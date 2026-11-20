/**
 * Habit streaks and goal progress. Dates are calendar strings (YYYY-MM-DD) in the user's
 * timezone; arithmetic is done on UTC midnights so DST never shifts a day.
 */

const DAY = 86_400_000;

const toUtc = (d: string): number => Date.parse(`${d}T00:00:00Z`);
const fromUtc = (t: number): string => new Date(t).toISOString().slice(0, 10);

export function addDays(d: string, n: number): string {
  return fromUtc(toUtc(d) + n * DAY);
}

/** Monday of the week containing d. */
export function weekStart(d: string): string {
  const dow = (new Date(toUtc(d)).getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(d, -dow);
}

/** Check-ins in the week (Mon–Sun) containing `today`, up to and including today. */
export function countThisWeek(dates: ReadonlySet<string>, today: string): number {
  let n = 0;
  for (let d = weekStart(today); d <= today; d = addDays(d, 1)) if (dates.has(d)) n++;
  return n;
}

/**
 * Current streak.
 * - Daily habits (target 7): consecutive days. An unchecked today doesn't break it yet.
 * - Weekly habits (target 1–6): consecutive weeks that met the target. The current week
 *   counts once met; until then it doesn't break the streak.
 */
export function currentStreak(dates: ReadonlySet<string>, today: string, targetPerWeek: number): { value: number; unit: 'day' | 'week' } {
  if (targetPerWeek >= 7) {
    let d = dates.has(today) ? today : addDays(today, -1);
    let n = 0;
    while (dates.has(d)) {
      n++;
      d = addDays(d, -1);
    }
    return { value: n, unit: 'day' };
  }
  const weekCount = (start: string) => {
    let c = 0;
    for (let i = 0; i < 7; i++) if (dates.has(addDays(start, i))) c++;
    return c;
  };
  let start = weekStart(today);
  let n = 0;
  if (countThisWeek(dates, today) >= targetPerWeek) n++;
  start = addDays(start, -7);
  while (weekCount(start) >= targetPerWeek) {
    n++;
    start = addDays(start, -7);
  }
  return { value: n, unit: 'week' };
}

/** The last `n` days ending today, oldest first. */
export function recentDays(dates: ReadonlySet<string>, today: string, n = 7): { date: string; done: boolean }[] {
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(today, i - (n - 1));
    return { date, done: dates.has(date) };
  });
}

/** Whole-percent milestone progress; null when a goal has no milestones yet. */
export function milestoneProgress(milestones: readonly { done_at: string | null }[]): number | null {
  if (milestones.length === 0) return null;
  const done = milestones.filter((m) => m.done_at).length;
  return Math.floor((done * 100) / milestones.length);
}
