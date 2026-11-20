import { describe, expect, it } from 'vitest';
import { ESSENTIAL_FLOOR, candidates, feedbackHistory, score, selectBriefing, type EngineInput, type FeedbackHistory } from './recommend';

const today = '2026-11-20';
const empty: EngineInput = {
  today,
  assessments: [],
  budgetAlerts: [],
  finance: { hasAccounts: false, lastRecordedOn: null },
  habits: [],
  goals: [],
  projectSteps: [],
  pendingGuesses: 0,
  hasCourses: true,
};
const noFb: FeedbackHistory = { byType: {}, byKey: {} };

describe('candidates', () => {
  it('turns recorded data into recommendations with evidence', () => {
    const c = candidates({
      ...empty,
      assessments: [
        { id: 'a1', title: 'Lab 2', course: 'DCIT 201', due_on: '2026-11-21', done: false },
        { id: 'a2', title: 'Quiz', course: 'MATH 223', due_on: '2026-11-18', done: false },
        { id: 'a3', title: 'Essay', course: 'UGRC', due_on: '2026-12-10', done: false },
        { id: 'a4', title: 'Done thing', course: 'X', due_on: '2026-11-20', done: true },
      ],
      budgetAlerts: [{ category: 'Food', status: 'over', percent: 120, text: 'Food: GH₵ 180.00 of GH₵ 150.00' }],
    });
    const keys = c.map((x) => x.rule_key);
    expect(keys).toContain('assessment-due:a1');
    expect(keys).toContain('assessment-overdue:a2');
    expect(keys).not.toContain('assessment-due:a3'); // too far out
    expect(keys.some((k) => k.includes('a4'))).toBe(false); // done
    const lab = c.find((x) => x.rule_key === 'assessment-due:a1')!;
    expect(lab).toMatchObject({ title: 'Due in 1 day: Lab 2', essential: true, kind: 'immediate', category: 'academic' });
    expect(lab.evidence[0]).toContain('DCIT 201');
    expect(c.find((x) => x.rule_type === 'finance.budget_over')!.why).toContain('180.00');
  });

  it('only nudges about a habit streak worth protecting', () => {
    const c = candidates({ ...empty, habits: [{ id: 'h1', name: 'Read', doneToday: false, streak: 5 }, { id: 'h2', name: 'Run', doneToday: false, streak: 1 }] });
    expect(c.filter((x) => x.rule_type === 'habits.streak').map((x) => x.title)).toEqual(['Keep your 5-day Read streak']);
  });
});

describe('score — learning from feedback', () => {
  const c = candidates({ ...empty, goals: [{ id: 'g', title: 'Learn Go', milestonesTotal: 0, overdueMilestones: [] }] })[0]!;

  it('lowers a rule type the user finds not useful, with a floor', () => {
    expect(score(c, noFb, today)).toBe(42);
    expect(score(c, { byType: { 'goals.no_milestones': { not_useful: 1, very_useful: 0, somewhat_useful: 0 } }, byKey: {} }, today)).toBe(27);
    expect(score(c, { byType: { 'goals.no_milestones': { not_useful: 9, very_useful: 0, somewhat_useful: 0 } }, byKey: {} }, today)).toBe(0);
  });

  it('raises a rule type the user finds very useful', () => {
    expect(score(c, { byType: { 'goals.no_milestones': { not_useful: 0, very_useful: 1, somewhat_useful: 0 } }, byKey: {} }, today)).toBe(52);
  });

  it('hides an item the user already knows for 14 days, dismissed for 3', () => {
    expect(score(c, { byType: {}, byKey: { [c.rule_key]: { already_know: '2026-11-10' } } }, today)).toBeNull();
    expect(score(c, { byType: {}, byKey: { [c.rule_key]: { already_know: '2026-11-01' } } }, today)).toBe(42);
    expect(score(c, { byType: {}, byKey: { [c.rule_key]: { dismissed: '2026-11-19' } } }, today)).toBeNull();
    expect(score(c, { byType: {}, byKey: { [c.rule_key]: { dismissed: '2026-11-16' } } }, today)).toBe(42);
  });

  it('essential obligations never fall below the floor and return when urgent', () => {
    const due = candidates({ ...empty, assessments: [{ id: 'a', title: 'Exam prep', course: 'C', due_on: '2026-11-21', done: false }] })[0]!;
    const hated: FeedbackHistory = { byType: { 'academic.deadline': { not_useful: 10, very_useful: 0, somewhat_useful: 0 } }, byKey: { [due.rule_key]: { dismissed: today, already_know: today } } };
    expect(score(due, hated, today)).toBe(ESSENTIAL_FLOOR);
  });
});

describe('selectBriefing', () => {
  const input: EngineInput = {
    ...empty,
    assessments: [
      { id: 'a1', title: 'Lab', course: 'C1', due_on: '2026-11-21', done: false },
      { id: 'a2', title: 'Quiz', course: 'C2', due_on: '2026-11-22', done: false },
      { id: 'a3', title: 'Essay', course: 'C3', due_on: '2026-11-23', done: false },
    ],
    budgetAlerts: [{ category: 'Food', status: 'warn', percent: 85, text: 'Food 85%' }],
    finance: { hasAccounts: true, lastRecordedOn: '2026-11-01' },
    goals: [{ id: 'g', title: 'Learn Go', milestonesTotal: 0, overdueMilestones: [] }],
    pendingGuesses: 2,
  };

  it('returns 3–5 items, urgent essentials first, max 2 per category otherwise', () => {
    const b = selectBriefing(candidates(input), noFb, today);
    expect(b.length).toBeGreaterThanOrEqual(3);
    expect(b.length).toBeLessThanOrEqual(5);
    // a1 (1 day) and a2 (2 days) are urgent essentials; a3 (3 days) is capped by the per-category limit
    expect(b.filter((x) => x.category === 'academic').map((x) => x.rule_key)).toEqual(['assessment-due:a1', 'assessment-due:a2']);
    expect(b[0]!.rule_key).toBe('assessment-due:a1');
  });

  it('does not pad with noise when there is little to say', () => {
    const b = selectBriefing(candidates({ ...empty, pendingGuesses: 1 }), noFb, today);
    expect(b.map((x) => x.rule_type)).toEqual(['memory.guesses']);
  });
});

describe('feedbackHistory', () => {
  it('aggregates ratings by type and dates by key, ignoring old rows', () => {
    const recs = [
      { id: 'r1', rule_type: 'goals.no_milestones', rule_key: 'goal-milestones:g' },
      { id: 'r2', rule_type: 'finance.record', rule_key: 'finance-record:x' },
    ];
    const fb = feedbackHistory(
      today,
      recs,
      [
        { recommendation_id: 'r1', rating: 'not_useful', created_at: '2026-11-19T10:00:00Z' },
        { recommendation_id: 'r1', rating: 'not_useful', created_at: '2026-06-01T10:00:00Z' }, // >90 days
        { recommendation_id: 'r2', rating: 'already_know', created_at: '2026-11-18T10:00:00Z' },
      ],
      [{ recommendation_id: 'r1', event: 'dismissed', created_at: '2026-11-20T08:00:00Z' }],
    );
    expect(fb.byType['goals.no_milestones']).toEqual({ not_useful: 1, very_useful: 0, somewhat_useful: 0 });
    expect(fb.byKey['finance-record:x']).toEqual({ already_know: '2026-11-18' });
    expect(fb.byKey['goal-milestones:g']).toEqual({ dismissed: '2026-11-20' });
  });
});
