import { describe, expect, it } from 'vitest';
import { gpaTrend, habitWeeks, monthlySpend, relevance, weekStats } from './insights';
import { DEFAULT_GRADE_BANDS } from './gpa';

const accounts = new Map([
  ['m', { id: 'm', currency: 'GHS' }],
  ['u', { id: 'u', currency: 'USD' }],
]);

describe('gpaTrend', () => {
  it('lists graded terms in order, skipping terms with nothing graded', () => {
    const t = gpaTrend(
      [{ id: 't1', name: 'L100 S1' }, { id: 't2', name: 'L100 S2' }, { id: 't3', name: 'L200 S1' }],
      [
        { term_id: 't1', credit_hours: 3, final_mark: 85, final_letter: null },
        { term_id: 't2', credit_hours: 3, final_mark: 72, final_letter: null },
        { term_id: 't3', credit_hours: 3, final_mark: null, final_letter: null },
      ],
      DEFAULT_GRADE_BANDS,
    );
    expect(t).toEqual([{ label: 'L100 S1', gpa: 4 }, { label: 'L100 S2', gpa: 3 }]);
  });
});

describe('monthlySpend', () => {
  it('sums expenses per month for one currency across a year boundary', () => {
    const r = monthlySpend(
      [
        { account_id: 'm', kind: 'expense', amount_minor: 500, occurred_on: '2026-12-10', category: 'Food' },
        { account_id: 'm', kind: 'expense', amount_minor: 250, occurred_on: '2027-01-02', category: 'Food' },
        { account_id: 'm', kind: 'income', amount_minor: 9999, occurred_on: '2027-01-02', category: null },
        { account_id: 'u', kind: 'expense', amount_minor: 100, occurred_on: '2027-01-03', category: null },
      ],
      accounts,
      'GHS',
      '2027-01-15',
      3,
    );
    expect(r).toEqual([
      { label: '2026-11', minor: 0 },
      { label: '2026-12', minor: 500 },
      { label: '2027-01', minor: 250 },
    ]);
  });
});

describe('habitWeeks', () => {
  it('computes consistency per week, partial current week up to today', () => {
    // Today Wed 2026-11-18 (week starts Mon 16). Two daily habits.
    const checkins = [
      { habit_id: 'a', on_date: '2026-11-16' },
      { habit_id: 'b', on_date: '2026-11-16' },
      { habit_id: 'a', on_date: '2026-11-17' },
      { habit_id: 'a', on_date: '2026-11-10' },
    ];
    expect(habitWeeks(['a', 'b'], checkins, '2026-11-18', 2)).toEqual([
      { label: '2026-11-09', pct: 7 }, // 1 of 14
      { label: '2026-11-16', pct: 50 }, // 3 of 6 (Mon–Wed)
    ]);
    expect(habitWeeks([], checkins, '2026-11-18', 1)).toEqual([{ label: '2026-11-16', pct: null }]);
  });
});

describe('weekStats', () => {
  it('counts only this week, up to today', () => {
    const s = weekStats('2026-11-18', 'GHS', {
      tasks: [{ completed_at: '2026-11-17T09:00:00Z' }, { completed_at: '2026-11-14T09:00:00Z' }, { completed_at: null }],
      assessments: [{ completed_at: '2026-11-16T20:00:00Z' }],
      dailyHabitIds: ['a'],
      checkins: [{ habit_id: 'a', on_date: '2026-11-16' }],
      entries: [
        { account_id: 'm', kind: 'expense', amount_minor: 1250, occurred_on: '2026-11-17', category: 'Food' },
        { account_id: 'm', kind: 'expense', amount_minor: 999, occurred_on: '2026-11-15', category: 'Food' },
      ],
      accounts,
    });
    expect(s).toEqual({ week_start: '2026-11-16', tasks_done: 1, assessments_done: 1, habit_consistency: 33, spent_minor: 1250, currency: 'GHS' });
  });
});

describe('relevance', () => {
  it('matches tags to skills and goal areas', () => {
    expect(relevance(['networking', 'Cybersecurity', 'leadership'], ['Networking', 'Cybersecurity', 'Sales'], ['leadership', 'career'])).toEqual([
      'Networking',
      'Cybersecurity',
      'leadership goal',
    ]);
    expect(relevance([], ['Networking'], [])).toEqual([]);
  });
});
