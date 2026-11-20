/**
 * Semester target tracking. Kept deliberately simple:
 *  - The target GPA (e.g. 4.0) becomes one grade to aim for in every course: the lowest band whose
 *    points reach the target (4.0 → A, 80+; 3.5 → B+, 75+).
 *  - A course's standing comes from its weighted, scored assessments (weight = % of the course).
 *  - "Needed" = the average you must score on the course's remaining weight to still reach the grade.
 */
import { computeGpa, type GradeBand } from './gpa';

export function requiredBand<B extends GradeBand>(target: number, bands: readonly B[]): B | null {
  const ok = bands.filter((b) => b.points >= target).sort((a, b) => a.points - b.points || a.min_mark - b.min_mark);
  return ok[0] ?? null;
}

export interface ScoredWork {
  weight: number | null;
  score: number | null;
  max_score: number | null;
}

export type Standing = 'final' | 'no_data' | 'on_track' | 'behind' | 'out_of_reach';

export interface CourseProgress {
  standing: Standing;
  /** Percentage of the course already graded (sum of graded weights, capped at 100). */
  graded: number;
  /** Marks earned out of 100 so far (weighted). */
  earned: number;
  /** Average % on graded work so far; null if nothing graded. */
  soFar: number | null;
  /** Average % needed on the remaining weight to reach the required grade; null if not applicable. */
  needed: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function courseProgress(
  course: { final_mark: number | null; final_letter: string | null },
  work: readonly ScoredWork[],
  requiredMin: number,
): CourseProgress {
  if (course.final_mark !== null || course.final_letter) return { standing: 'final', graded: 100, earned: course.final_mark ?? 0, soFar: course.final_mark, needed: null };
  let graded = 0;
  let earned = 0;
  for (const w of work) {
    if (w.weight === null || w.score === null || w.max_score === null || w.max_score <= 0 || w.weight <= 0) continue;
    graded += w.weight;
    earned += (w.score / w.max_score) * w.weight;
  }
  graded = Math.min(graded, 100);
  if (graded === 0) return { standing: 'no_data', graded: 0, earned: 0, soFar: null, needed: requiredMin };
  const soFar = round1((earned / graded) * 100);
  const remaining = 100 - graded;
  const needed = remaining > 0 ? round1(Math.max(0, ((requiredMin - earned) / remaining) * 100)) : null;
  const standing: Standing =
    needed === null ? (earned >= requiredMin ? 'on_track' : 'out_of_reach') : needed > 100 ? 'out_of_reach' : soFar >= requiredMin ? 'on_track' : 'behind';
  return { standing, graded: round1(graded), earned: round1(earned), soFar, needed };
}

/**
 * Projected semester GPA: final grades where entered, otherwise the grade the course's graded work
 * points to so far. Null until at least one course has something graded.
 */
export function projectedGpa(
  courses: readonly { credit_hours: number; final_mark: number | null; final_letter: string | null; progress: CourseProgress }[],
  bands: readonly GradeBand[],
): number | null {
  const projected = courses
    .filter((c) => c.progress.standing === 'final' || c.progress.soFar !== null)
    .map((c) => (c.progress.standing === 'final' ? c : { credit_hours: c.credit_hours, final_mark: c.progress.soFar, final_letter: null }));
  return computeGpa(projected, bands).gpa;
}

/** One plain sentence for a course row. */
export function progressLine(p: CourseProgress, band: GradeBand | null): string {
  const grade = band ? `${band.letter} (${band.min_mark}+)` : 'your target grade';
  switch (p.standing) {
    case 'final':
      return 'Final result entered';
    case 'no_data':
      return `Aim for ${grade}. Add marks as you get them back.`;
    case 'on_track':
      return p.needed === null
        ? `On track for ${grade}: ${p.soFar}% overall.`
        : `On track: ${p.soFar}% on ${p.graded}% graded. Keep ${p.needed}%+ on the remaining ${round1(100 - p.graded)}%.`;
    case 'behind':
      return `Behind: ${p.soFar}% on ${p.graded}% graded. Need ${p.needed}% on the remaining ${round1(100 - p.graded)}% for ${grade}.`;
    case 'out_of_reach':
      return `${grade} is out of reach on current marks (${p.soFar}% on ${p.graded}% graded). Aim as high as you can.`;
  }
}

