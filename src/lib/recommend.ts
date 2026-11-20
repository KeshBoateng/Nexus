/**
 * Recommendation engine — deterministic rules + scoring + feedback learning (spec §5, §6, §9).
 * Works with AI off. Each candidate carries the evidence that produced it.
 *
 * Learning from feedback:
 *   - "Not useful" lowers that rule type's score (−15 each, floor −45); "very useful" raises it.
 *   - "Already know" hides that exact item for 14 days; "Not now" (dismiss) for 3 days.
 *   - Essential obligations (deadlines, overspending) never drop below a floor and come back
 *     when they become urgent — they cannot disappear just because they are unwelcome.
 */
import type { NextStep } from './projectHealth';

export type RecCategory = 'academic' | 'financial' | 'goals' | 'habits' | 'projects' | 'leadership' | 'development' | 'personal';
export type RecKind = 'immediate' | 'preventive' | 'developmental' | 'corrective';

export interface Candidate {
  rule_type: string;
  rule_key: string;
  category: RecCategory;
  kind: RecKind;
  title: string;
  action: string;
  why: string;
  benefit: string;
  evidence: string[];
  est_minutes: number;
  due_on: string | null;
  essential: boolean;
  base: number;
}

export interface EngineInput {
  today: string;
  assessments: { id: string; title: string; course: string; due_on: string | null; done: boolean; kind?: string; courseId?: string }[];
  /** Current-semester courses that are behind the target grade (from weighted marks so far). */
  targets?: { courseId: string; course: string; grade: string; standing: 'behind' | 'out_of_reach'; soFar: number; graded: number; needed: number | null }[];
  /** Study Library + Learn progress per course id (files, sections understood / known, sections to review). */
  courseStudy?: Record<string, { files: number; understood: number; total: number; review: number }>;
  budgetAlerts: { category: string; status: 'warn' | 'over'; percent: number; text: string }[];
  finance: { hasAccounts: boolean; lastRecordedOn: string | null };
  habits: { id: string; name: string; doneToday: boolean; streak: number }[];
  goals: { id: string; title: string; milestonesTotal: number; overdueMilestones: { title: string; due_on: string }[] }[];
  projectSteps: { projectId: string; projectName: string; step: NextStep }[];
  pendingGuesses: number;
  hasCourses: boolean;
  /** Files being studied in Learn mode, most recently studied first. */
  study?: { materialId: string; title: string; understood: number; total: number; next: number; review: boolean; lastStudied: string }[];
  /** Skills below target, with the next verified resource in their adaptive plan. */
  learning?: { skill: string; estimate: number; target: number; next: { id: string; title: string; source: string; objective: string; exercise: string; inProgress: boolean } | null }[];
}

export interface FeedbackHistory {
  /** Last-90-day ratings per rule type. */
  byType: Record<string, { not_useful: number; very_useful: number; somewhat_useful: number }>;
  /** Most recent dates per exact item. */
  byKey: Record<string, { already_know?: string; dismissed?: string; completed?: string }>;
}

export interface Scored extends Candidate {
  priority: number;
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

const EXAM_KINDS = new Set(['exam', 'midterm', 'quiz']);

export function candidates(i: EngineInput): Candidate[] {
  const out: Candidate[] = [];

  for (const a of i.assessments) {
    if (a.done || !a.due_on) continue;
    const d = daysBetween(i.today, a.due_on);
    if (d < 0) {
      out.push({
        rule_type: 'academic.overdue',
        rule_key: `assessment-overdue:${a.id}`,
        category: 'academic',
        kind: 'corrective',
        title: `Overdue: ${a.title}`,
        action: `Submit it now if late submission is allowed, or speak to the ${a.course} lecturer today.`,
        why: `It was due ${-d} day${d === -1 ? '' : 's'} ago and is still open.`,
        benefit: 'Late work usually beats missing work; early contact keeps options open.',
        evidence: [`${a.course} · ${a.title} · due ${a.due_on}`],
        est_minutes: 30,
        due_on: a.due_on,
        essential: true,
        base: 95,
      });
    } else if (d <= 3) {
      out.push({
        rule_type: 'academic.deadline',
        rule_key: `assessment-due:${a.id}`,
        category: 'academic',
        kind: 'immediate',
        title: d === 0 ? `Due today: ${a.title}` : `Due in ${d} day${d === 1 ? '' : 's'}: ${a.title}`,
        action: d === 0 ? 'Block time now to finish and submit.' : 'Schedule a focused session for it today.',
        why: 'An approaching deadline outranks optional work.',
        benefit: 'Submitting on time protects your grade and reduces last-minute stress.',
        evidence: [`${a.course} · ${a.title} · due ${a.due_on}`],
        est_minutes: 60,
        due_on: a.due_on,
        essential: true,
        base: 90 - d * 5,
      });
    }
  }

  for (const b of i.budgetAlerts) {
    out.push({
      rule_type: b.status === 'over' ? 'finance.budget_over' : 'finance.budget_warn',
      rule_key: `budget-${b.status}:${b.category}`,
      category: 'financial',
      kind: b.status === 'over' ? 'corrective' : 'preventive',
      title: b.status === 'over' ? `${b.category} is over budget` : `${b.category} budget ${b.percent}% used`,
      action: b.status === 'over' ? `Pause non-essential ${b.category.toLowerCase()} spending for the rest of the month.` : `Slow ${b.category.toLowerCase()} spending to stay within the month.`,
      why: b.text,
      benefit: 'Staying within budget keeps money available for what matters later in the month.',
      evidence: [b.text],
      est_minutes: 5,
      due_on: null,
      essential: b.status === 'over',
      base: b.status === 'over' ? 75 : 55,
    });
  }

  if (i.finance.hasAccounts) {
    const gap = i.finance.lastRecordedOn ? daysBetween(i.finance.lastRecordedOn, i.today) : null;
    if (gap === null || gap >= 5) {
      out.push({
        rule_type: 'finance.record',
        rule_key: `finance-record:${i.today}`,
        category: 'financial',
        kind: 'preventive',
        title: 'Catch up on recording spending',
        action: 'Check your MoMo and bank history and record anything missing.',
        why: gap === null ? 'No transactions recorded yet.' : `Nothing recorded for ${gap} days — balances and budgets may be off.`,
        benefit: 'Accurate records make the budgets and net worth trustworthy.',
        evidence: [gap === null ? 'No transactions' : `Last recorded ${i.finance.lastRecordedOn}`],
        est_minutes: 10,
        due_on: null,
        essential: false,
        base: 45,
      });
    }
  }

  const pending = i.habits.filter((h) => !h.doneToday);
  const atRisk = pending.filter((h) => h.streak >= 3).sort((a, b) => b.streak - a.streak)[0];
  if (atRisk) {
    out.push({
      rule_type: 'habits.streak',
      rule_key: `habit-streak:${atRisk.id}:${i.today}`,
      category: 'habits',
      kind: 'developmental',
      title: `Keep your ${atRisk.streak}-day ${atRisk.name} streak`,
      action: `Do ${atRisk.name.toLowerCase()} today, even a short version.`,
      why: 'Consistency matters more than intensity for habits.',
      benefit: 'Protecting a streak makes the habit easier to keep.',
      evidence: [`${atRisk.streak} days in a row`],
      est_minutes: 20,
      due_on: i.today,
      essential: false,
      base: 40,
    });
  }

  for (const g of i.goals) {
    if (g.milestonesTotal === 0) {
      out.push({
        rule_type: 'goals.no_milestones',
        rule_key: `goal-milestones:${g.id}`,
        category: 'goals',
        kind: 'developmental',
        title: `Break “${g.title}” into milestones`,
        action: 'Write 3–5 concrete steps, each something you could finish in a week or two.',
        why: 'A goal without steps cannot be tracked or started.',
        benefit: 'Milestones turn an intention into a plan with visible progress.',
        evidence: ['0 milestones'],
        est_minutes: 15,
        due_on: null,
        essential: false,
        base: 42,
      });
    }
    if (g.overdueMilestones.length) {
      out.push({
        rule_type: 'goals.milestone_overdue',
        rule_key: `goal-overdue:${g.id}`,
        category: 'goals',
        kind: 'corrective',
        title: `“${g.title}” has a milestone past due`,
        action: 'Finish it, or set a new realistic date.',
        why: 'Stale dates make the plan untrustworthy.',
        benefit: 'An honest plan is one you will keep using.',
        evidence: g.overdueMilestones.map((m) => `${m.title} (due ${m.due_on})`),
        est_minutes: 10,
        due_on: null,
        essential: false,
        base: 50,
      });
    }
  }

  const leadership = new Set(['delegation', 'accountability', 'communication', 'meeting management']);
  for (const { projectId, projectName, step } of i.projectSteps) {
    out.push({
      rule_type: `project.${step.id}`,
      rule_key: `project:${projectId}:${step.id}`,
      category: step.skill && leadership.has(step.skill) ? 'leadership' : 'projects',
      kind: step.id === 'overdue' || step.id === 'milestones' ? 'corrective' : step.id === 'break-down' ? 'developmental' : 'preventive',
      title: `${projectName}: ${step.title}`,
      action: step.action,
      why: step.why,
      benefit: step.skill ? `Practises ${step.skill} on a real project.` : 'Keeps the project moving.',
      evidence: step.evidence,
      est_minutes: step.minutes,
      due_on: null,
      essential: step.id === 'overdue' || step.id === 'deadline-scope',
      base: step.priority === 'high' ? 80 : step.priority === 'medium' ? 60 : 40,
    });
  }

  // Semester target: a course whose marks so far are below the grade the target GPA needs.
  for (const t of i.targets ?? []) {
    const reachable = t.standing === 'behind';
    out.push({
      rule_type: 'academic.target',
      rule_key: `target:${t.courseId}:${t.graded}`,
      category: 'academic',
      kind: 'corrective',
      title: reachable ? `${t.course} is behind your target` : `${t.course}: ${t.grade} is out of reach`,
      action: reachable
        ? `You need ${t.needed}% on the remaining ${100 - t.graded}% to get ${t.grade}. Put extra study time on ${t.course} this week.`
        : `Aim for the next grade down in ${t.course}, and lift your other courses to protect your GPA.`,
      why: `You have ${t.soFar}% on the ${t.graded}% of ${t.course} graded so far.`,
      benefit: 'Catching a slipping course early is far easier than recovering in the final exam.',
      evidence: [`${t.course} · ${t.soFar}% on ${t.graded}% graded · target ${t.grade}`],
      est_minutes: 45,
      due_on: null,
      essential: false,
      base: reachable ? 72 : 60,
    });
  }

  // Exam prep: a test within a week, and the course's study files still have sections to learn or review.
  for (const a of i.assessments) {
    if (a.done || !a.due_on || !a.courseId || !EXAM_KINDS.has(a.kind ?? '')) continue;
    const d = daysBetween(i.today, a.due_on);
    const s = i.courseStudy?.[a.courseId];
    if (d < 0 || d > 7 || !s || s.files === 0) continue;
    const left = s.total > 0 ? s.total - s.understood : null;
    if (left === 0 && s.review === 0) continue;
    const when = d === 0 ? 'today' : `in ${d} day${d === 1 ? '' : 's'}`;
    out.push({
      rule_type: 'study.exam_prep',
      rule_key: `exam-prep:${a.id}:${i.today}`,
      category: 'academic',
      kind: 'preventive',
      title: `Prepare for ${a.title} (${a.course}) — ${when}`,
      action:
        s.review > 0
          ? `Start with the ${s.review} section${s.review === 1 ? '' : 's'} you marked for review in Learn mode.`
          : left !== null
            ? `Work through the ${left} section${left === 1 ? '' : 's'} not yet understood in your ${a.course} files.`
            : `Open your ${a.course} files in Learn mode and start section 1.`,
      why: left !== null ? `${s.understood} of ${s.total} sections understood across ${s.files} file${s.files === 1 ? '' : 's'}.` : `You have ${s.files} ${a.course} file${s.files === 1 ? '' : 's'} not started in Learn mode.`,
      benefit: 'Targeting what you have not mastered yet is the fastest way to raise your score.',
      evidence: [`${a.course} · ${a.title} · ${a.kind} · ${a.due_on}`, `${s.files} study file${s.files === 1 ? '' : 's'} linked to ${a.course}`],
      est_minutes: 45,
      due_on: a.due_on,
      essential: false,
      base: 80 - d * 3,
    });
  }

  // Where you left off in Learn mode (most recent file still in progress).
  const studying = (i.study ?? []).filter((x) => x.understood < x.total).sort((a, b) => b.lastStudied.localeCompare(a.lastStudied))[0];
  if (studying) {
    out.push({
      rule_type: 'study.continue',
      rule_key: `study:${studying.materialId}:${i.today}`,
      category: 'academic',
      kind: 'developmental',
      title: `Continue studying ${studying.title}`,
      action: studying.review ? `Revisit section ${studying.next}, which you marked for review, then carry on.` : `Next up: section ${studying.next} of ${studying.total}.`,
      why: `You've understood ${studying.understood} of ${studying.total} sections so far.`,
      benefit: 'Steady sections beat cramming the whole file before the exam.',
      evidence: [`${studying.understood}/${studying.total} sections understood`, `Last studied ${studying.lastStudied.slice(0, 10)}`],
      est_minutes: 25,
      due_on: null,
      essential: false,
      base: 47,
    });
  }

  // One learning step a day: the skill furthest below its target that has a next resource.
  const LEVELS = ['None', 'Beginner', 'Developing', 'Proficient', 'Advanced'];
  const gap = (i.learning ?? []).filter((l) => l.next && l.estimate < l.target).sort((a, b) => b.target - b.estimate - (a.target - a.estimate) || a.skill.localeCompare(b.skill))[0];
  if (gap?.next) {
    out.push({
      rule_type: 'development.learn',
      rule_key: `learn:${gap.next.id}:${i.today}`,
      category: 'development',
      kind: 'developmental',
      title: `${gap.next.inProgress ? 'Continue' : 'Start'}: ${gap.next.title}`,
      action: `${gap.next.objective} Then: ${gap.next.exercise}`,
      why: `${gap.skill} is at ${LEVELS[gap.estimate]} (from your evidence); your target is ${LEVELS[gap.target]}.`,
      benefit: 'Practical work you can record as evidence moves the estimate — reading alone does not.',
      evidence: [`${gap.skill}: ${LEVELS[gap.estimate]} → ${LEVELS[gap.target]}`, `${gap.next.source} · link verified`],
      est_minutes: 45,
      due_on: null,
      essential: false,
      base: 45,
    });
  }

  if (i.pendingGuesses > 0) {
    out.push({
      rule_type: 'memory.guesses',
      rule_key: `memory-guesses:${i.today}`,
      category: 'personal',
      kind: 'developmental',
      title: `Review ${i.pendingGuesses} thing${i.pendingGuesses === 1 ? '' : 's'} NEXUS isn't sure about`,
      action: 'Confirm or reject them in Intelligence → Personal memory.',
      why: 'NEXUS never treats a guess as fact until you confirm it.',
      benefit: 'Better context means better recommendations.',
      evidence: [`${i.pendingGuesses} unconfirmed`],
      est_minutes: 2,
      due_on: null,
      essential: false,
      base: 25,
    });
  }

  if (!i.hasCourses) {
    out.push({
      rule_type: 'setup.academics',
      rule_key: 'setup-academics',
      category: 'academic',
      kind: 'developmental',
      title: 'Add your current semester and courses',
      action: 'Open My Life → Academics and add your courses with credit hours.',
      why: 'Deadlines and GPA tracking need your courses first.',
      benefit: 'NEXUS can then warn you about deadlines automatically.',
      evidence: ['No courses recorded'],
      est_minutes: 10,
      due_on: null,
      essential: false,
      base: 50,
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Scoring and selection
// ---------------------------------------------------------------------------

export const ESSENTIAL_FLOOR = 70;

export function score(c: Candidate, fb: FeedbackHistory, today: string): number | null {
  const key = fb.byKey[c.rule_key];
  const urgent = c.due_on !== null && daysBetween(today, c.due_on) <= 1;
  if (key?.completed === today) return null;
  if (key?.already_know && daysBetween(key.already_know, today) < 14 && !(c.essential && urgent)) return null;
  if (key?.dismissed && daysBetween(key.dismissed, today) < 3 && !(c.essential && urgent)) return null;

  const t = fb.byType[c.rule_type];
  const adj = t ? Math.max(-45, Math.min(15, -15 * t.not_useful + 10 * t.very_useful + 3 * t.somewhat_useful)) : 0;
  let s = c.base + adj;
  if (c.essential) s = Math.max(s, ESSENTIAL_FLOOR);
  return Math.max(0, Math.min(100, Math.round(s)));
}

/** Pick 3–5 recommendations: urgent essentials first, then by score, max 2 per category when possible. */
export function selectBriefing(all: Candidate[], fb: FeedbackHistory, today: string, max = 5): Scored[] {
  const scored = all
    .map((c) => ({ ...c, priority: score(c, fb, today) }))
    .filter((c): c is Scored => c.priority !== null && c.priority >= 20)
    .sort((a, b) => b.priority - a.priority || a.rule_key.localeCompare(b.rule_key));

  const urgentEssential = (c: Scored) => c.essential && c.due_on !== null && daysBetween(today, c.due_on) <= 2;
  const picked: Scored[] = scored.filter(urgentEssential).slice(0, max);
  const perCat = new Map<RecCategory, number>();
  for (const c of picked) perCat.set(c.category, (perCat.get(c.category) ?? 0) + 1);

  for (const c of scored) {
    if (picked.length >= max) break;
    if (picked.includes(c)) continue;
    if ((perCat.get(c.category) ?? 0) >= 2) continue;
    picked.push(c);
    perCat.set(c.category, (perCat.get(c.category) ?? 0) + 1);
  }
  // Fewer than 3 because of the diversity cap? Relax it.
  for (const c of scored) {
    if (picked.length >= Math.min(3, max)) break;
    if (!picked.includes(c)) picked.push(c);
  }
  return picked.sort((a, b) => b.priority - a.priority);
}

/** Build feedback history from stored rows (last 90 days). */
export function feedbackHistory(
  today: string,
  recs: { id: string; rule_type: string; rule_key: string }[],
  feedback: { recommendation_id: string; rating: 'very_useful' | 'somewhat_useful' | 'not_useful' | 'already_know'; created_at: string }[],
  events: { recommendation_id: string; event: string; created_at: string }[],
): FeedbackHistory {
  const byId = new Map(recs.map((r) => [r.id, r]));
  const fb: FeedbackHistory = { byType: {}, byKey: {} };
  const recent = (iso: string) => daysBetween(iso.slice(0, 10), today) <= 90;
  const later = (a: string | undefined, b: string) => (!a || b > a ? b : a);

  for (const f of feedback) {
    const r = byId.get(f.recommendation_id);
    if (!r || !recent(f.created_at)) continue;
    const day = f.created_at.slice(0, 10);
    if (f.rating === 'already_know') {
      const k = (fb.byKey[r.rule_key] ??= {});
      k.already_know = later(k.already_know, day);
    } else {
      const t = (fb.byType[r.rule_type] ??= { not_useful: 0, very_useful: 0, somewhat_useful: 0 });
      t[f.rating]++;
    }
  }
  for (const e of events) {
    const r = byId.get(e.recommendation_id);
    if (!r || !recent(e.created_at)) continue;
    const day = e.created_at.slice(0, 10);
    const k = (fb.byKey[r.rule_key] ??= {});
    if (e.event === 'dismissed') k.dismissed = later(k.dismissed, day);
    if (e.event === 'completed' || e.event === 'applied') k.completed = later(k.completed, day);
  }
  return fb;
}
