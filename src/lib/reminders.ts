/**
 * Reminder rules (spec §10). Pure functions shared with the `notify` Edge Function — the
 * function's copy must stay byte-identical (checked by a test). No guilt-based wording:
 * reminders state facts and suggest one next step.
 */

export type NotifCategory = 'academic' | 'financial' | 'study' | 'career' | 'project' | 'leadership' | 'habit' | 'review' | 'recommendation' | 'system';

export interface ReminderInput {
  now: string; // ISO instant
  timeZone: string;
  briefingTime: string; // HH:MM[:SS] local
  accountability: boolean;
  assessments: { id: string; title: string; course: string; due_at: string | null; completed: boolean }[];
  habits: { id: string; name: string; daily: boolean; doneToday: boolean }[];
  myTasks: { id: string; title: string; project: string; due_on: string | null; done: boolean }[];
  budgetsOver: { category: string; text: string }[];
  weekDone: number;
  opportunities?: { id: string; title: string; deadline: string | null; open: boolean }[];
}

export interface Reminder {
  dedupe_key: string;
  source_key: string | null;
  category: NotifCategory;
  priority: 'low' | 'normal' | 'high';
  title: string;
  body: string;
  link: string;
}

/** Local calendar date, minutes since midnight and ISO weekday (1 = Mon) in a timezone. */
export function localParts(iso: string, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday!) + 1;
  return { date, minutes, weekday };
}

const toMinutes = (hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Inside quiet hours? Handles overnight ranges like 22:00–06:30. */
export function isQuiet(minutes: number, start: string | null, end: string | null): boolean {
  if (!start || !end) return false;
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === e) return false;
  return s < e ? minutes >= s && minutes < e : minutes >= s || minutes < e;
}

/** ISO week key, e.g. 2026-W47, for the local date. */
export function isoWeek(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const HOUR = 3_600_000;

export function reminders(i: ReminderInput): Reminder[] {
  const now = Date.parse(i.now);
  const { date, minutes, weekday } = localParts(i.now, i.timeZone);
  const out: Reminder[] = [];

  for (const a of i.assessments) {
    if (a.completed || !a.due_at) continue;
    const due = Date.parse(a.due_at);
    const left = due - now;
    if (left > 0 && left <= 24 * HOUR) {
      out.push({
        dedupe_key: `assessment:${a.id}:due24`,
        source_key: `assessment:${a.id}`,
        category: 'academic',
        priority: left <= 6 * HOUR ? 'high' : 'normal',
        title: `${a.title} is due ${left <= 6 * HOUR ? 'soon' : 'within 24 hours'}`,
        body: `${a.course}. Block time now so it's done before the deadline.`,
        link: '/life/academics',
      });
    } else if (left <= 0 && -left <= 7 * 24 * HOUR) {
      out.push({
        dedupe_key: `assessment:${a.id}:overdue`,
        source_key: `assessment:${a.id}`,
        category: 'academic',
        priority: 'high',
        title: `${a.title} is past its deadline`,
        body: `${a.course}. If late submission is allowed, submitting now still counts — or let your lecturer know.`,
        link: '/life/academics',
      });
    }
  }

  const bt = toMinutes(i.briefingTime);
  const inBriefingWindow = minutes >= bt && minutes < bt + 180;
  if (inBriefingWindow) {
    out.push({ dedupe_key: `briefing:${date}`, source_key: null, category: 'recommendation', priority: 'normal', title: 'Your daily briefing is ready', body: 'Your top priorities for today, from your own records.', link: '/' });
  }

  const pending = i.habits.filter((h) => h.daily && !h.doneToday);
  if (pending.length && minutes >= 19 * 60 && minutes < 23 * 60) {
    out.push({
      dedupe_key: `habits:${date}`,
      source_key: `habits:${date}`,
      category: 'habit',
      priority: 'low',
      title: `${pending.length} habit${pending.length === 1 ? '' : 's'} left today`,
      body: pending.map((h) => h.name).join(', '),
      link: '/life/goals',
    });
  }

  const tomorrow = new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  for (const t of i.myTasks) {
    if (t.done || !t.due_on || t.due_on > tomorrow || t.due_on < date) continue;
    out.push({
      dedupe_key: `task:${t.id}:due`,
      source_key: `task:${t.id}`,
      category: 'project',
      priority: t.due_on === date ? 'high' : 'normal',
      title: `${t.title} — due ${t.due_on === date ? 'today' : 'tomorrow'}`,
      body: `Your task in ${t.project}.`,
      link: '/projects',
    });
  }

  for (const o of i.opportunities ?? []) {
    if (!o.open || !o.deadline || o.deadline < date) continue;
    const left = Math.round((Date.parse(`${o.deadline}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
    const stage = left <= 1 ? 'd1' : left <= 7 ? 'd7' : null;
    if (!stage) continue;
    out.push({
      dedupe_key: `opportunity:${o.id}:${stage}`,
      source_key: `opportunity:${o.id}`,
      category: 'career',
      priority: stage === 'd1' ? 'high' : 'normal',
      title: `${o.title} closes ${left === 0 ? 'today' : left === 1 ? 'tomorrow' : `in ${left} days`}`,
      body: stage === 'd1' ? 'Submit what you have, or decide to let it go.' : 'Plan the application this week.',
      link: '/radar',
    });
  }

  for (const b of i.budgetsOver) {
    out.push({
      dedupe_key: `budget:${b.category}:${date.slice(0, 7)}`,
      source_key: null,
      category: 'financial',
      priority: 'normal',
      title: `${b.category} is over budget this month`,
      body: b.text,
      link: '/life/finances',
    });
  }

  if (i.accountability) {
    const overdue =
      i.assessments.filter((a) => !a.completed && a.due_at && Date.parse(a.due_at) < now).length +
      i.myTasks.filter((t) => !t.done && t.due_on && t.due_on < date).length;
    if (overdue > 0 && inBriefingWindow) {
      out.push({
        dedupe_key: `accountability:${date}`,
        source_key: null,
        category: 'review',
        priority: 'normal',
        title: `${overdue} commitment${overdue === 1 ? ' is' : 's are'} overdue`,
        body: 'Pick the one that matters most and clear it first — or give it an honest new date.',
        link: '/',
      });
    }
    if (weekday === 7 && minutes >= 18 * 60) {
      out.push({
        dedupe_key: `weekly:${isoWeek(date)}`,
        source_key: null,
        category: 'review',
        priority: 'low',
        title: 'Weekly review',
        body: `This week you completed ${i.weekDone} task${i.weekDone === 1 ? '' : 's'}${overdue ? ` and ${overdue} ${overdue === 1 ? 'is' : 'are'} overdue` : ''}. Take 10 minutes to plan next week.`,
        link: '/review',
      });
    }
  }
  return out;
}

/** Source keys that are still live; reminders whose source is gone or done get dismissed. */
export function activeSources(i: ReminderInput): Set<string> {
  const s = new Set<string>();
  for (const a of i.assessments) if (!a.completed) s.add(`assessment:${a.id}`);
  for (const t of i.myTasks) if (!t.done) s.add(`task:${t.id}`);
  for (const o of i.opportunities ?? []) if (o.open) s.add(`opportunity:${o.id}`);
  const { date } = localParts(i.now, i.timeZone);
  if (i.habits.some((h) => h.daily && !h.doneToday)) s.add(`habits:${date}`);
  return s;
}

export interface PushCandidate {
  category: NotifCategory;
  created_at: string;
  pushed_at: string | null;
  read_at: string | null;
  dismissed_at: string | null;
  snoozed_until: string | null;
}

/** Push now? Respects category preference, quiet hours, snooze, and drops stale items (>12 h). */
export function shouldPush(n: PushCandidate, pushAllowed: boolean, quiet: boolean, now: string): boolean {
  if (!pushAllowed || quiet || n.pushed_at || n.read_at || n.dismissed_at) return false;
  if (n.snoozed_until && Date.parse(n.snoozed_until) > Date.parse(now)) return false;
  return Date.parse(now) - Date.parse(n.created_at) <= 12 * HOUR;
}
