/**
 * Project health and leadership next steps — deterministic rules over recorded data.
 * Every suggestion carries its evidence so the user can see exactly why it appeared.
 * (Spec §2.4 "Collaborative leadership support", §5 recommendation structure.)
 */
import { addDays } from './habits';

export interface PTask {
  id: string;
  title: string;
  assignee_member_id: string | null;
  status: 'todo' | 'doing' | 'done';
  due_on: string | null;
}
export interface PMember {
  id: string;
  name: string;
  is_me: boolean;
}
export interface PMilestone {
  id: string;
  title: string;
  due_on: string | null;
  done_at: string | null;
}
export interface PMeeting {
  held_on: string;
}
export interface PProject {
  name: string;
  kind: 'assignment' | 'team' | 'personal' | 'business';
  status: 'planning' | 'active' | 'on_hold' | 'done' | 'cancelled';
  due_on: string | null;
}

export type Health = 'on_track' | 'at_risk' | 'off_track' | 'closed';

export interface NextStep {
  id: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  action: string;
  why: string;
  evidence: string[];
  minutes: number;
  skill?: 'delegation' | 'accountability' | 'communication' | 'meeting management' | 'deadline management' | 'planning';
}

export interface ProjectState {
  project: PProject;
  tasks: readonly PTask[];
  members: readonly PMember[];
  milestones: readonly PMilestone[];
  meetings: readonly PMeeting[];
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export function summarize(s: ProjectState, today: string) {
  const open = s.tasks.filter((t) => t.status !== 'done');
  const done = s.tasks.length - open.length;
  const overdue = open.filter((t) => t.due_on && t.due_on < today);
  const unassigned = open.filter((t) => !t.assignee_member_id);
  const dueSoon = open.filter((t) => t.due_on && t.due_on >= today && t.due_on <= addDays(today, 7));
  const overdueMilestones = s.milestones.filter((m) => !m.done_at && m.due_on && m.due_on < today);
  const percentDone = s.tasks.length ? Math.floor((done * 100) / s.tasks.length) : 0;
  const daysLeft = s.project.due_on ? daysBetween(today, s.project.due_on) : null;
  const lastMeeting = s.meetings.reduce<string | null>((m, x) => (!m || x.held_on > m ? x.held_on : m), null);
  return { open, done, overdue, unassigned, dueSoon, overdueMilestones, percentDone, daysLeft, lastMeeting };
}

export function projectHealth(s: ProjectState, today: string): Health {
  if (s.project.status === 'done' || s.project.status === 'cancelled') return 'closed';
  const x = summarize(s, today);
  if (x.daysLeft !== null && x.daysLeft < 0 && x.open.length > 0) return 'off_track';
  // A single late task is a risk, not a failure; off track needs several or most of the work late.
  if (x.overdue.length >= 3 || (x.overdue.length >= 2 && x.overdue.length / x.open.length >= 0.5)) return 'off_track';
  if (x.overdue.length > 0 || x.overdueMilestones.length > 0) return 'at_risk';
  if (x.daysLeft !== null && x.daysLeft <= 7 && x.percentDone < 70 && s.tasks.length > 0) return 'at_risk';
  if (x.unassigned.some((t) => t.due_on && t.due_on <= addDays(today, 7))) return 'at_risk';
  return 'on_track';
}

const names = (ids: (string | null)[], members: readonly PMember[]) =>
  [...new Set(ids.map((id) => members.find((m) => m.id === id)?.name).filter(Boolean))] as string[];

const list = (xs: string[], max = 3) => (xs.length <= max ? xs.join(', ') : `${xs.slice(0, max).join(', ')} +${xs.length - max} more`);

/** Up to `limit` next steps, highest priority first. Closed projects get none. */
export function nextSteps(s: ProjectState, today: string, limit = 4): NextStep[] {
  if (s.project.status === 'done' || s.project.status === 'cancelled') return [];
  const x = summarize(s, today);
  const isTeam = s.project.kind === 'team' || s.members.filter((m) => !m.is_me).length > 0;
  const steps: NextStep[] = [];

  if (s.tasks.length === 0) {
    steps.push({
      id: 'break-down',
      priority: 'high',
      title: 'Break the project into tasks',
      action: 'List the deliverables, then split each into tasks someone can finish in a sitting or two.',
      why: 'Without tasks there is nothing to assign, track or warn you about.',
      evidence: ['0 tasks recorded'],
      minutes: 20,
      skill: 'planning',
    });
  }

  if (isTeam && x.unassigned.length > 0) {
    const urgent = x.unassigned.filter((t) => t.due_on && t.due_on <= addDays(today, 7));
    steps.push({
      id: 'assign-owners',
      priority: urgent.length > 0 ? 'high' : 'medium',
      title: `Clarify ownership of ${x.unassigned.length} task${x.unassigned.length === 1 ? '' : 's'}`,
      action: 'Give each unassigned task one named owner — ideally agreed in your next meeting, not imposed.',
      why: 'Work nobody owns tends to be done by nobody, or at the last minute by you.',
      evidence: [`Unassigned: ${list(x.unassigned.map((t) => t.title))}`, ...(urgent.length ? [`${urgent.length} due within 7 days`] : [])],
      minutes: 10,
      skill: 'delegation',
    });
  }

  if (x.overdue.length > 0) {
    const people = names(x.overdue.map((t) => t.assignee_member_id), s.members.filter((m) => !m.is_me));
    const mine = x.overdue.filter((t) => s.members.find((m) => m.id === t.assignee_member_id)?.is_me);
    steps.push({
      id: 'overdue',
      priority: 'high',
      title: `${x.overdue.length} overdue task${x.overdue.length === 1 ? '' : 's'}`,
      action: people.length
        ? `Check in with ${list(people)}: ask what's blocking them and agree a new date${mine.length ? ', and finish your own' : ''}.`
        : 'Finish them or move their dates to something realistic.',
      why: 'Overdue tasks compound — each one delays whatever depends on it.',
      evidence: x.overdue.map((t) => `${t.title} (due ${t.due_on})`).slice(0, 4),
      minutes: 15,
      skill: 'accountability',
    });
  }

  if (isTeam && s.project.status === 'active' && x.open.length > 0) {
    const gap = x.lastMeeting ? daysBetween(x.lastMeeting, today) : null;
    if (gap === null || gap >= 14) {
      steps.push({
        id: 'check-in',
        priority: x.overdue.length || x.unassigned.length ? 'high' : 'medium',
        title: gap === null ? 'Hold a kickoff meeting' : 'Schedule a team check-in',
        action: 'Agree goals, owners and dates. Use “Prepare agenda” to start from the project’s real state.',
        why: gap === null ? 'No meeting recorded — the team may not share the same picture of the work.' : `Last meeting was ${gap} days ago.`,
        evidence: [gap === null ? 'No meetings recorded' : `Last meeting ${x.lastMeeting}`],
        minutes: 30,
        skill: 'meeting management',
      });
    }
  }

  if (x.daysLeft !== null && x.daysLeft >= 0 && x.daysLeft <= 7 && s.tasks.length > 0 && x.percentDone < 70) {
    steps.push({
      id: 'deadline-scope',
      priority: 'high',
      title: `Due in ${x.daysLeft} day${x.daysLeft === 1 ? '' : 's'} with ${x.percentDone}% done`,
      action: 'Decide now what is essential for submission and what can be cut or simplified.',
      why: 'Cutting scope deliberately beats running out of time.',
      evidence: [`${x.done}/${s.tasks.length} tasks done`, `Project due ${s.project.due_on}`],
      minutes: 15,
      skill: 'deadline management',
    });
  }

  const others = s.members.filter((m) => !m.is_me);
  if (isTeam && others.length >= 2 && x.open.length >= 5) {
    const counts = s.members.map((m) => ({ m, n: x.open.filter((t) => t.assignee_member_id === m.id).length }));
    const top = counts.reduce((a, b) => (b.n > a.n ? b : a));
    if (top.n / x.open.length >= 0.5) {
      steps.push({
        id: 'workload',
        priority: 'medium',
        title: `Workload imbalance: ${top.m.is_me ? 'you hold' : `${top.m.name} holds`} ${top.n} of ${x.open.length} open tasks`,
        action: top.m.is_me ? 'Delegate some of your tasks — leading is not doing everything yourself.' : `Ask ${top.m.name} whether the load is realistic and rebalance if needed.`,
        why: 'Concentrated work creates a single point of failure and burns people out.',
        evidence: counts.filter((c) => c.n > 0).map((c) => `${c.m.is_me ? 'You' : c.m.name}: ${c.n}`),
        minutes: 10,
        skill: 'delegation',
      });
    }
  }

  if (x.overdueMilestones.length > 0) {
    steps.push({
      id: 'milestones',
      priority: 'medium',
      title: `${x.overdueMilestones.length} milestone${x.overdueMilestones.length === 1 ? '' : 's'} past due`,
      action: 'Mark them done if they are, or re-plan the dates with the team.',
      why: 'Stale milestones make the plan untrustworthy.',
      evidence: x.overdueMilestones.map((m) => `${m.title} (due ${m.due_on})`),
      minutes: 5,
      skill: 'planning',
    });
  }

  const rank = { high: 0, medium: 1, low: 2 } as const;
  return steps.sort((a, b) => rank[a.priority] - rank[b.priority]).slice(0, limit);
}

/** Plain-text agenda built from the project's recorded state, for the user to copy and send themselves. */
export function buildAgenda(s: ProjectState, today: string): string {
  const x = summarize(s, today);
  const who = (id: string | null) => s.members.find((m) => m.id === id)?.name ?? 'Unassigned';
  const lines = [`${s.project.name} — team check-in (${today})`, ''];
  let n = 1;
  lines.push(`${n++}. Progress: ${x.done}/${s.tasks.length} tasks done${s.project.due_on ? `, project due ${s.project.due_on}` : ''}.`);
  if (x.overdue.length) {
    lines.push(`${n++}. Overdue — blockers and new dates:`);
    x.overdue.forEach((t) => lines.push(`   - ${t.title} (${who(t.assignee_member_id)}, was due ${t.due_on})`));
  }
  if (x.unassigned.length) {
    lines.push(`${n++}. Agree owners for:`);
    x.unassigned.forEach((t) => lines.push(`   - ${t.title}${t.due_on ? ` (due ${t.due_on})` : ''}`));
  }
  if (x.dueSoon.length) {
    lines.push(`${n++}. Due this week:`);
    x.dueSoon.forEach((t) => lines.push(`   - ${t.title} (${who(t.assignee_member_id)}, ${t.due_on})`));
  }
  const nextMs = s.milestones.filter((m) => !m.done_at).sort((a, b) => (a.due_on ?? '9999') .localeCompare(b.due_on ?? '9999'))[0];
  if (nextMs) lines.push(`${n++}. Next milestone: ${nextMs.title}${nextMs.due_on ? ` (${nextMs.due_on})` : ''}.`);
  lines.push(`${n++}. Any other business.`, `${n}. Recap: who does what by when.`);
  return lines.join('\n');
}
