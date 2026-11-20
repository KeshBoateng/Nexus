/**
 * Where a course or semester stands, derived from what's already recorded (no extra input):
 *   completed — the course has a final mark or letter grade
 *   upcoming  — no result, and the semester starts in the future
 *   awaiting  — no result, and the semester's end date has passed (results not entered yet)
 *   taking    — no result, semester in progress (or no dates set)
 */
export type CourseStatus = 'completed' | 'taking' | 'awaiting' | 'upcoming';
export type TermStatus = 'completed' | 'current' | 'awaiting' | 'upcoming' | 'empty';

export function courseStatus(
  course: { final_mark: number | null; final_letter: string | null },
  term: { starts_on: string | null; ends_on: string | null },
  today: string,
): CourseStatus {
  if (course.final_mark !== null || course.final_letter) return 'completed';
  if (term.starts_on && term.starts_on > today) return 'upcoming';
  if (term.ends_on && term.ends_on < today) return 'awaiting';
  return 'taking';
}

export function termStatus(statuses: readonly CourseStatus[], term: { starts_on: string | null; ends_on: string | null }, today: string): TermStatus {
  if (statuses.length === 0) return term.starts_on && term.starts_on > today ? 'upcoming' : 'empty';
  if (statuses.every((s) => s === 'completed')) return 'completed';
  if (statuses.some((s) => s === 'taking')) return 'current';
  if (statuses.some((s) => s === 'awaiting')) return 'awaiting';
  return 'upcoming';
}

export const COURSE_STATUS_LABEL: Record<CourseStatus, string> = {
  completed: 'Completed',
  taking: 'Taking now',
  awaiting: 'Awaiting result',
  upcoming: 'Upcoming',
};

export const TERM_STATUS_LABEL: Record<TermStatus, string> = {
  completed: 'Completed',
  current: 'Current',
  awaiting: 'Awaiting results',
  upcoming: 'Upcoming',
  empty: 'No courses',
};

export interface CourseStudy {
  files: number;
  understood: number;
  /** Sections across files whose size is known (a file's size is known once any lesson exists). */
  total: number;
  review: number;
}

/** Study Library + Learn progress per course. */
export function courseStudy(
  materials: readonly { id: string; course_id: string | null }[],
  progress: readonly { material_id: string; status: string }[],
  lessons: readonly { material_id: string; sections_total: number }[],
): Map<string, CourseStudy> {
  const totals = new Map<string, number>();
  for (const l of lessons) totals.set(l.material_id, Math.max(totals.get(l.material_id) ?? 0, l.sections_total));
  const out = new Map<string, CourseStudy>();
  for (const m of materials) {
    if (!m.course_id) continue;
    const s = out.get(m.course_id) ?? { files: 0, understood: 0, total: 0, review: 0 };
    s.files++;
    s.total += totals.get(m.id) ?? 0;
    for (const p of progress) {
      if (p.material_id !== m.id) continue;
      if (p.status === 'understood') s.understood++;
      if (p.status === 'review') s.review++;
    }
    out.set(m.course_id, s);
  }
  return out;
}

/** "3 files · 9 of 14 sections understood · 2 to review" */
export function studyLine(s: CourseStudy | undefined): string {
  if (!s || s.files === 0) return 'No study files yet — add some';
  const parts = [`${s.files} file${s.files === 1 ? '' : 's'}`];
  if (s.total > 0) parts.push(`${s.understood} of ${s.total} sections understood`);
  else parts.push('not started in Learn');
  if (s.review > 0) parts.push(`${s.review} to review`);
  return parts.join(' · ');
}

/** "2 taking now · 5 completed · 1 awaiting result" — only non-zero groups. */
export function statusSummary(counts: Record<CourseStatus, number>): string {
  const order: CourseStatus[] = ['taking', 'awaiting', 'upcoming', 'completed'];
  return order
    .filter((k) => counts[k] > 0)
    .map((k) => `${counts[k]} ${COURSE_STATUS_LABEL[k].toLowerCase()}`)
    .join(' · ');
}

/**
 * The semester the Academics page focuses on: the one whose dates contain today; otherwise the most
 * recent one that has started (or has no start date); otherwise the earliest upcoming one.
 */
export function currentTerm<T extends { id: string; starts_on: string | null; ends_on: string | null; created_at: string }>(terms: readonly T[], today: string): T | null {
  const within = terms.find((t) => t.starts_on && t.starts_on <= today && (!t.ends_on || t.ends_on >= today));
  if (within) return within;
  const started = terms
    .filter((t) => !t.starts_on || t.starts_on <= today)
    .sort((a, b) => (b.starts_on ?? b.created_at).localeCompare(a.starts_on ?? a.created_at));
  if (started[0]) return started[0];
  return [...terms].sort((a, b) => (a.starts_on ?? '').localeCompare(b.starts_on ?? ''))[0] ?? null;
}
