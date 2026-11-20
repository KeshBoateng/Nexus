import { z } from 'zod';
import { requireSupabase } from '../../lib/supabase';
import { sectionsFor, type Section } from '../../lib/studyText';

const sb = () => requireSupabase();
export const PASS_MARK = 70;

export const LessonSchema = z.object({
  section: z.number(),
  sections_total: z.number(),
  content: z.object({
    title: z.string(),
    explanation: z.string(),
    key_terms: z.array(z.object({ term: z.string(), meaning: z.string() })),
    examples: z.array(z.string()),
    check_questions: z.array(z.object({ q: z.string(), a: z.string() })),
    label: z.string().optional(),
  }),
});
export type Lesson = z.infer<typeof LessonSchema>;

export const ProgressSchema = z.object({
  id: z.uuid(),
  section: z.number(),
  status: z.enum(['learning', 'review', 'understood']),
  score: z.number().nullable(),
  attempts: z.number(),
});
export type SectionProgress = z.infer<typeof ProgressSchema>;

export interface LearnData {
  sections: Section[];
  lessons: Map<number, Lesson>;
  progress: Map<number, SectionProgress>;
}

function ok<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

export async function fetchLearn(materialId: string): Promise<LearnData> {
  const [mat, lessons, progress] = await Promise.all([
    sb().from('study_materials').select('extracted_text, page_starts, page_count').eq('id', materialId).single(),
    sb().from('study_lessons').select('section, sections_total, content').eq('material_id', materialId),
    sb().from('study_progress').select('id, section, status, score, attempts').eq('material_id', materialId),
  ]);
  const m = ok(mat) as { extracted_text: string | null; page_starts: number[] | null; page_count: number | null };
  const sections = sectionsFor(m.extracted_text ?? '', m.page_starts, m.page_count);
  const ls = z.array(LessonSchema).parse(ok(lessons)).filter((l) => l.sections_total === sections.length);
  return {
    sections,
    lessons: new Map(ls.map((l) => [l.section, l])),
    progress: new Map(z.array(ProgressSchema).parse(ok(progress)).map((p) => [p.section, p])),
  };
}

/** Next section to study: the first not yet understood (review comes before new). */
export function nextSection(d: Pick<LearnData, 'sections' | 'progress'>): number | null {
  const review = d.sections.find((s) => d.progress.get(s.index)?.status === 'review');
  if (review) return review.index;
  const fresh = d.sections.find((s) => d.progress.get(s.index)?.status !== 'understood');
  return fresh?.index ?? null;
}

export function understoodCount(d: Pick<LearnData, 'progress'>): number {
  return [...d.progress.values()].filter((p) => p.status === 'understood').length;
}

/** Self-check result → status. The AI never decides this; the user's own answers do. */
export function statusFor(got: number, total: number): { score: number; status: 'understood' | 'review' } {
  const score = total ? Math.round((got * 100) / total) : 0;
  return { score, status: score >= PASS_MARK ? 'understood' : 'review' };
}

export async function requestLesson(materialId: string, section: number, onWait?: (seconds: number) => void): Promise<void> {
  for (let round = 0; round < 10; round++) {
    const { data, error } = await sb().functions.invoke('study-analyze', { body: { id: materialId, action: 'lesson', section } });
    if (error) {
      let msg = 'Lessons are unavailable right now.';
      try {
        const body = await (error as { context?: Response }).context?.json();
        if (body?.error) msg = body.error;
      } catch {
        /* keep generic */
      }
      throw new Error(msg);
    }
    const d = data as { status?: string; retry_after?: number };
    if (d.status !== 'in_progress') return;
    for (let left = Math.min(Math.max(d.retry_after ?? 20, 5), 75); left > 0; left--) {
      onWait?.(left);
      await new Promise((r) => setTimeout(r, 1000));
    }
    onWait?.(0);
  }
  throw new Error('Still busy — try this section again in a few minutes.');
}

export async function saveProgress(materialId: string, section: number, got: number, total: number, existing?: SectionProgress) {
  const { score, status } = statusFor(got, total);
  if (existing) ok(await sb().from('study_progress').update({ score, status, attempts: existing.attempts + 1 }).eq('id', existing.id));
  else ok(await sb().from('study_progress').insert({ material_id: materialId, section, score, status, attempts: 1 }));
  return { score, status };
}
