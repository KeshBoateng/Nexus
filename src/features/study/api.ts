import { z } from 'zod';
import { requireSupabase } from '../../lib/supabase';
import { ACCEPTED, extOf, guessTopic, matchCourse, titleFromFile } from '../../lib/studyText';

export const MAX_BYTES = 25 * 1024 * 1024;
const sb = () => requireSupabase();

export const MaterialSchema = z.object({
  id: z.uuid(),
  course_id: z.uuid().nullable(),
  title: z.string(),
  topic: z.string().nullable(),
  file_path: z.string(),
  mime: z.string(),
  size_bytes: z.number(),
  page_count: z.number().nullable(),
  status: z.enum(['uploaded', 'extracted', 'no_text', 'analysed', 'failed']),
  created_at: z.string(),
});
export type Material = z.infer<typeof MaterialSchema>;

const Pair = z.object({ q: z.string(), a: z.string() });
export const AnalysisSchema = z.object({
  material_id: z.uuid(),
  summary: z.string(),
  key_concepts: z.array(z.object({ term: z.string(), explanation: z.string() })),
  flashcards: z.array(Pair),
  questions: z.array(Pair),
  created_at: z.string(),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

export interface StudyData {
  materials: Material[];
  analyses: Map<string, Analysis>;
  courses: { id: string; code: string | null; title: string }[];
  studyAllowed: boolean;
  aiEnabled: boolean;
}

function ok<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

export async function fetchStudy(): Promise<StudyData> {
  const [mats, an, courses, perm, prefs] = await Promise.all([
    sb().from('study_materials').select('id, course_id, title, topic, file_path, mime, size_bytes, page_count, status, created_at').order('created_at', { ascending: false }),
    sb().from('study_analyses').select('material_id, summary, key_concepts, flashcards, questions, created_at'),
    sb().from('courses').select('id, code, title').order('created_at'),
    sb().from('ai_permissions').select('allowed').eq('category', 'study').maybeSingle(),
    sb().from('user_preferences').select('ai_enabled').single(),
  ]);
  return {
    materials: z.array(MaterialSchema).parse(ok(mats)),
    analyses: new Map(z.array(AnalysisSchema).parse(ok(an)).map((a) => [a.material_id, a])),
    courses: ok(courses) as StudyData['courses'],
    studyAllowed: Boolean((perm.data as { allowed: boolean } | null)?.allowed),
    aiEnabled: Boolean((prefs.data as { ai_enabled: boolean } | null)?.ai_enabled),
  };
}

/** Full-text search across titles, topics and extracted text. Returns matching ids, best first. */
export async function searchStudy(q: string): Promise<string[]> {
  const rows = ok(await sb().from('study_materials').select('id').textSearch('search', q, { type: 'websearch', config: 'english' }).limit(50)) as { id: string }[];
  return rows.map((r) => r.id);
}

export type UploadStep = 'reading' | 'uploading' | 'saving' | 'done' | 'error';

/** Extract on device → upload to the private bucket → save the record. Cleans up on failure. */
export async function uploadMaterial(file: File, userId: string, courses: StudyData['courses'], onStep: (s: UploadStep) => void): Promise<void> {
  const ext = extOf(file.name);
  if (!ext) throw new Error('Unsupported file type. Use PDF, Word (.docx), PowerPoint (.pptx), .txt or .md.');
  if (file.size > MAX_BYTES) throw new Error('File is larger than 25 MB.');
  onStep('reading');
  const { extractText } = await import('./extract');
  let text = '';
  let pages: number | null = null;
  let pageStarts: number[] | null = null;
  try {
    const r = await extractText(file, ext);
    text = r.text;
    pages = r.pages;
    pageStarts = r.pageStarts;
  } catch {
    // Unreadable or scanned — the file is still stored, marked as having no text.
  }
  const title = titleFromFile(file.name);
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  onStep('uploading');
  const up = await sb().storage.from('study').upload(path, file, { contentType: ACCEPTED[ext], upsert: false });
  if (up.error) throw up.error;
  onStep('saving');
  const { error } = await sb()
    .from('study_materials')
    .insert({
      title,
      topic: text ? guessTopic(text, title) : null,
      course_id: matchCourse(file.name, text, courses),
      file_path: path,
      mime: ACCEPTED[ext],
      size_bytes: file.size,
      page_count: pages,
      page_starts: text ? pageStarts : null,
      extracted_text: text || null,
      status: text.length >= 200 ? 'extracted' : 'no_text',
    });
  if (error) {
    await sb().storage.from('study').remove([path]);
    throw error;
  }
  onStep('done');
}

export async function updateMaterial(id: string, patch: { course_id?: string | null; topic?: string | null; title?: string }) {
  ok(await sb().from('study_materials').update(patch).eq('id', id));
}

export async function deleteMaterial(m: Material) {
  const rm = await sb().storage.from('study').remove([m.file_path]);
  if (rm.error) throw rm.error;
  ok(await sb().from('study_materials').delete().eq('id', m.id));
}

export async function openMaterial(m: Material): Promise<string> {
  const { data, error } = await sb().storage.from('study').createSignedUrl(m.file_path, 300);
  if (error || !data) throw error ?? new Error('Could not open file.');
  return data.signedUrl;
}

export interface AnalyseProgress {
  done: number;
  total: number;
  waiting: number; // seconds until the next attempt (provider rate limit)
}

/**
 * Builds a study pack. Long files are processed in parts across several calls; when the AI
 * provider asks us to slow down, wait the advised time and continue. Finished parts are kept
 * server-side, so nothing is redone.
 */
export async function analyse(id: string, onProgress?: (p: AnalyseProgress) => void, maxRounds = 20): Promise<{ partial: boolean }> {
  for (let round = 0; round < maxRounds; round++) {
    const { data, error } = await sb().functions.invoke('study-analyze', { body: { id } });
    if (error) {
      let msg = 'Analysis is unavailable right now.';
      try {
        const body = await (error as { context?: Response }).context?.json();
        if (body?.error) msg = body.error;
      } catch {
        /* keep generic */
      }
      throw new Error(msg);
    }
    const d = data as { status?: string; partial?: boolean; done?: number; total?: number; retry_after?: number };
    if (d.status !== 'in_progress') return { partial: Boolean(d.partial) };
    const wait = Math.min(Math.max(d.retry_after ?? 20, 5), 75);
    for (let left = wait; left > 0; left--) {
      onProgress?.({ done: d.done ?? 0, total: d.total ?? 1, waiting: left });
      await new Promise((r) => setTimeout(r, 1000));
    }
    onProgress?.({ done: d.done ?? 0, total: d.total ?? 1, waiting: 0 });
  }
  throw new Error('Still working after many rounds — try again later; finished parts are kept.');
}

export async function setStudyPermission(allowed: boolean) {
  const existing = await sb().from('ai_permissions').select('id').eq('category', 'study').maybeSingle();
  if (existing.data) ok(await sb().from('ai_permissions').update({ allowed }).eq('category', 'study'));
  else ok(await sb().from('ai_permissions').insert({ category: 'study', allowed }));
}
