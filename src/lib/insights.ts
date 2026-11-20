/**
 * Deterministic trends and weekly stats for Insights and Weekly reviews.
 * Every number comes from recorded data; nothing is estimated or extrapolated.
 */
import { computeGpa, type GradableCourse, type GradeBand } from './gpa';
import { addDays, weekStart } from './habits';
import { monthKey, type AccountRef, type LedgerEntry } from './finance';
import { sumMinor } from './money';

export function gpaTrend(terms: { id: string; name: string }[], courses: (GradableCourse & { term_id: string })[], bands: readonly GradeBand[]) {
  return terms
    .map((t) => ({ label: t.name, gpa: computeGpa(courses.filter((c) => c.term_id === t.id), bands).gpa }))
    .filter((x): x is { label: string; gpa: number } => x.gpa !== null);
}

/** Expense totals for the last `n` calendar months (oldest first), one currency. */
export function monthlySpend(entries: readonly LedgerEntry[], accounts: ReadonlyMap<string, AccountRef>, currency: string, today: string, n = 6) {
  const months: string[] = [];
  const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    months.push(m.toISOString().slice(0, 7));
  }
  return months.map((m) => ({
    label: m,
    minor: sumMinor(entries.filter((e) => e.kind === 'expense' && monthKey(e.occurred_on) === m && accounts.get(e.account_id)?.currency === currency).map((e) => e.amount_minor)),
  }));
}

/** Daily-habit consistency per week (Mon–Sun), oldest first: done check-ins / possible. */
export function habitWeeks(dailyHabitIds: readonly string[], checkins: readonly { habit_id: string; on_date: string }[], today: string, n = 8) {
  const thisWeek = weekStart(today);
  const out: { label: string; pct: number | null }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const start = addDays(thisWeek, -7 * i);
    const end = i === 0 ? today : addDays(start, 6);
    const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
    const possible = dailyHabitIds.length * days;
    const done = checkins.filter((c) => dailyHabitIds.includes(c.habit_id) && c.on_date >= start && c.on_date <= end).length;
    out.push({ label: start, pct: possible ? Math.floor((done * 100) / possible) : null });
  }
  return out;
}

export interface WeekStats {
  week_start: string;
  tasks_done: number;
  assessments_done: number;
  habit_consistency: number | null;
  spent_minor: number;
  currency: string;
}

/** Snapshot for the weekly review of the week containing `today` (up to today). */
export function weekStats(
  today: string,
  currency: string,
  data: {
    tasks: { completed_at: string | null }[];
    assessments: { completed_at: string | null }[];
    dailyHabitIds: string[];
    checkins: { habit_id: string; on_date: string }[];
    entries: readonly LedgerEntry[];
    accounts: ReadonlyMap<string, AccountRef>;
  },
): WeekStats {
  const start = weekStart(today);
  const inWeek = (iso: string | null) => Boolean(iso && iso.slice(0, 10) >= start && iso.slice(0, 10) <= today);
  return {
    week_start: start,
    tasks_done: data.tasks.filter((t) => inWeek(t.completed_at)).length,
    assessments_done: data.assessments.filter((a) => inWeek(a.completed_at)).length,
    habit_consistency: habitWeeks(data.dailyHabitIds, data.checkins, today, 1)[0]!.pct,
    spent_minor: sumMinor(
      data.entries.filter((e) => e.kind === 'expense' && e.occurred_on >= start && e.occurred_on <= today && data.accounts.get(e.account_id)?.currency === currency).map((e) => e.amount_minor),
    ),
    currency,
  };
}

/** Opportunity relevance: which of the user's skills / goal areas the tags match. */
export function relevance(tags: readonly string[], skills: readonly string[], goalAreas: readonly string[]): string[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const t = new Set(tags.map(norm));
  const hits: string[] = [];
  for (const s of skills) if ([...t].some((x) => x && (norm(s).includes(x) || x.includes(norm(s))))) hits.push(s);
  for (const g of goalAreas) if (t.has(norm(g))) hits.push(`${g} goal`);
  return [...new Set(hits)];
}
