/**
 * GPA / CGPA — deterministic, exact.
 * Grade points are handled as integer hundredths (4.00 → 400) so sums never drift;
 * only the final division is rounded (half-up to 2 decimals), as transcripts do.
 */

export interface GradeBand {
  letter: string;
  min_mark: number;
  max_mark: number;
  points: number;
}

/** Owner's scale (D-007, confirmed 2026-11-20): A = 80–100, then 5-mark steps. */
export const DEFAULT_GRADE_BANDS: readonly GradeBand[] = [
  { letter: 'A', min_mark: 80, max_mark: 100, points: 4.0 },
  { letter: 'B+', min_mark: 75, max_mark: 79.99, points: 3.5 },
  { letter: 'B', min_mark: 70, max_mark: 74.99, points: 3.0 },
  { letter: 'C+', min_mark: 65, max_mark: 69.99, points: 2.5 },
  { letter: 'C', min_mark: 60, max_mark: 64.99, points: 2.0 },
  { letter: 'D+', min_mark: 55, max_mark: 59.99, points: 1.5 },
  { letter: 'D', min_mark: 50, max_mark: 54.99, points: 1.0 },
  { letter: 'E', min_mark: 45, max_mark: 49.99, points: 0.5 },
  { letter: 'F', min_mark: 0, max_mark: 44.99, points: 0.0 },
];

export interface GradableCourse {
  credit_hours: number;
  final_mark: number | null;
  final_letter: string | null;
}

export interface ResolvedGrade {
  letter: string;
  points: number;
}

const toHundredths = (n: number): number => Math.round(n * 100);

/** Band containing a mark. Bands are matched on min_mark (highest first), so 79.995 is B+, never a gap. */
export function bandForMark(mark: number, bands: readonly GradeBand[]): GradeBand | null {
  if (!Number.isFinite(mark) || mark < 0 || mark > 100) return null;
  const m = toHundredths(mark);
  const sorted = [...bands].sort((a, b) => b.min_mark - a.min_mark);
  return sorted.find((b) => m >= toHundredths(b.min_mark)) ?? null;
}

/** Grade for a course: mark takes precedence over a manually entered letter. Null = in progress. */
export function resolveGrade(course: GradableCourse, bands: readonly GradeBand[]): ResolvedGrade | null {
  if (course.final_mark !== null) {
    const band = bandForMark(course.final_mark, bands);
    return band ? { letter: band.letter, points: band.points } : null;
  }
  if (course.final_letter) {
    const band = bands.find((b) => b.letter === course.final_letter);
    return band ? { letter: band.letter, points: band.points } : null;
  }
  return null;
}

export interface GpaResult {
  /** GPA rounded half-up to 2 decimals; null when no graded credits. */
  gpa: number | null;
  /** Credits that count toward GPA (graded courses only, including F). */
  gradedCredits: number;
  /** Σ points × credits, in hundredths of a point. */
  qualityPointsX100: number;
  inProgressCredits: number;
}

export function computeGpa(courses: readonly GradableCourse[], bands: readonly GradeBand[]): GpaResult {
  let gradedCredits = 0;
  let qualityPointsX100 = 0;
  let inProgressCredits = 0;
  for (const c of courses) {
    if (!Number.isInteger(c.credit_hours) || c.credit_hours <= 0) throw new Error(`Invalid credit hours: ${c.credit_hours}`);
    const grade = resolveGrade(c, bands);
    if (!grade) {
      inProgressCredits += c.credit_hours;
      continue;
    }
    gradedCredits += c.credit_hours;
    qualityPointsX100 += toHundredths(grade.points) * c.credit_hours;
  }
  if (gradedCredits === 0) return { gpa: null, gradedCredits, qualityPointsX100, inProgressCredits };
  // Half-up rounding in integer space: round(q / c) == floor((2q + c) / 2c) for non-negative q.
  const gpaX100 = Math.floor((2 * qualityPointsX100 + gradedCredits) / (2 * gradedCredits));
  return { gpa: gpaX100 / 100, gradedCredits, qualityPointsX100, inProgressCredits };
}

export function formatGpa(gpa: number | null): string {
  return gpa === null ? '—' : gpa.toFixed(2);
}

/** Problems in a scale that would make grading ambiguous (overlaps) or incomplete (gaps). */
export function validateBands(bands: readonly GradeBand[]): string[] {
  const issues: string[] = [];
  const sorted = [...bands].sort((a, b) => a.min_mark - b.min_mark);
  if (sorted.length === 0) return ['The scale has no grades.'];
  if (toHundredths(sorted[0]!.min_mark) !== 0) issues.push('Lowest grade should start at 0.');
  if (toHundredths(sorted[sorted.length - 1]!.max_mark) !== 10000) issues.push('Highest grade should end at 100.');
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    const gap = toHundredths(cur.min_mark) - toHundredths(prev.max_mark);
    if (gap <= 0) issues.push(`${prev.letter} and ${cur.letter} overlap.`);
    else if (gap > 1) issues.push(`Gap between ${prev.letter} (${prev.max_mark}) and ${cur.letter} (${cur.min_mark}).`);
  }
  return issues;
}
