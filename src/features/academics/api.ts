import { z } from 'zod';
import { requireSupabase } from '../../lib/supabase';
import { DEFAULT_GRADE_BANDS } from '../../lib/gpa';

const num = z.coerce.number();
const numOrNull = z.union([z.coerce.number(), z.null()]);

export const BandSchema = z.object({
  id: z.uuid(),
  letter: z.string(),
  min_mark: num,
  max_mark: num,
  points: num,
});
export type Band = z.infer<typeof BandSchema>;

export const TermSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  starts_on: z.string().nullable(),
  ends_on: z.string().nullable(),
  created_at: z.string(),
});
export type Term = z.infer<typeof TermSchema>;

export const CourseSchema = z.object({
  id: z.uuid(),
  term_id: z.uuid(),
  code: z.string().nullable(),
  title: z.string(),
  credit_hours: z.number().int(),
  final_mark: numOrNull,
  final_letter: z.string().nullable(),
});
export type Course = z.infer<typeof CourseSchema>;

export const ASSESSMENT_KINDS = ['assignment', 'quiz', 'midterm', 'exam', 'project', 'presentation', 'other'] as const;

export const AssessmentSchema = z.object({
  id: z.uuid(),
  course_id: z.uuid(),
  title: z.string(),
  kind: z.enum(ASSESSMENT_KINDS),
  due_at: z.string().nullable(),
  weight: numOrNull,
  score: numOrNull,
  max_score: numOrNull,
  completed_at: z.string().nullable(),
});
export type Assessment = z.infer<typeof AssessmentSchema>;

// Write shapes — only client-writable columns (mirrors grants in migration 0003).
export const TermInput = z.object({
  name: z.string().trim().min(1).max(80),
  starts_on: z.string().nullable(),
  ends_on: z.string().nullable(),
});
export const CourseInput = z.object({
  term_id: z.uuid(),
  code: z.string().trim().max(20).nullable(),
  title: z.string().trim().min(1).max(120),
  credit_hours: z.number().int().min(1).max(12),
  final_mark: z.number().min(0).max(100).nullable(),
  final_letter: z.string().regex(/^[A-Z][+-]?$/).nullable(),
});
export const AssessmentInput = z.object({
  course_id: z.uuid(),
  title: z.string().trim().min(1).max(120),
  kind: z.enum(ASSESSMENT_KINDS),
  due_at: z.string().nullable(),
  completed_at: z.string().nullable().optional(),
});
export const BandInput = z.object({
  letter: z.string().regex(/^[A-Z][+-]?$/),
  min_mark: z.number().min(0).max(100),
  max_mark: z.number().min(0).max(100),
  points: z.number().min(0).max(4),
});

export interface AcademicsData {
  bands: Band[];
  terms: Term[];
  courses: Course[];
  assessments: Assessment[];
}

function check<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

export async function fetchAcademics(): Promise<AcademicsData> {
  const sb = requireSupabase();
  const [bands, terms, courses, assessments] = await Promise.all([
    sb.from('grade_bands').select('id, letter, min_mark, max_mark, points').order('min_mark', { ascending: false }),
    sb.from('academic_terms').select('id, name, starts_on, ends_on, created_at').order('starts_on', { ascending: true, nullsFirst: false }).order('created_at'),
    sb.from('courses').select('id, term_id, code, title, credit_hours, final_mark, final_letter').order('created_at'),
    sb.from('assessments').select('id, course_id, title, kind, due_at, weight, score, max_score, completed_at').order('due_at', { ascending: true, nullsFirst: false }),
  ]);
  return {
    bands: z.array(BandSchema).parse(check(bands)),
    terms: z.array(TermSchema).parse(check(terms)),
    courses: z.array(CourseSchema).parse(check(courses)),
    assessments: z.array(AssessmentSchema).parse(check(assessments)),
  };
}

/** First visit: install the Owner's default scale. Unique (user_id, letter) makes a double call harmless. */
export async function ensureDefaultBands(): Promise<void> {
  const { error } = await requireSupabase()
    .from('grade_bands')
    .insert(DEFAULT_GRADE_BANDS.map((b) => BandInput.parse(b)));
  if (error && error.code !== '23505') throw error;
}

export async function saveTerm(input: z.input<typeof TermInput>, id?: string) {
  const row = TermInput.parse(input);
  const q = requireSupabase().from('academic_terms');
  check(id ? await q.update(row).eq('id', id) : await q.insert(row));
}

export async function saveCourse(input: z.input<typeof CourseInput>, id?: string) {
  const row = CourseInput.parse(input);
  const q = requireSupabase().from('courses');
  check(id ? await q.update(row).eq('id', id) : await q.insert(row));
}

export async function saveAssessment(input: z.input<typeof AssessmentInput>, id?: string) {
  const row = AssessmentInput.parse(input);
  const q = requireSupabase().from('assessments');
  check(id ? await q.update(row).eq('id', id) : await q.insert(row));
}

export async function setAssessmentDone(id: string, done: boolean) {
  check(await requireSupabase().from('assessments').update({ completed_at: done ? new Date().toISOString() : null }).eq('id', id));
}

export async function saveBand(id: string, input: z.input<typeof BandInput>) {
  check(await requireSupabase().from('grade_bands').update(BandInput.parse(input)).eq('id', id));
}

export async function remove(table: 'academic_terms' | 'courses' | 'assessments', id: string) {
  check(await requireSupabase().from(table).delete().eq('id', id));
}

/** Study Library files and Learn progress, rolled up per course (for the Academics page). */
export async function fetchCourseStudyRows() {
  const sb = requireSupabase();
  const [mats, prog, lessons] = await Promise.all([
    sb.from('study_materials').select('id, course_id'),
    sb.from('study_progress').select('material_id, status'),
    sb.from('study_lessons').select('material_id, sections_total'),
  ]);
  return {
    materials: check(mats) as { id: string; course_id: string | null }[],
    progress: check(prog) as { material_id: string; status: string }[],
    lessons: check(lessons) as { material_id: string; sections_total: number }[],
  };
}
