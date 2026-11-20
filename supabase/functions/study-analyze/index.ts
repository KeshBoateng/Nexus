// NEXUS study-analyze — builds a study pack (summary, key concepts, flashcards, practice
// questions) from ONE uploaded material's extracted text.
//
// Enforced here, server-side:
//   - signed-in user; the material is read through their own RLS (others' ids aren't found);
//   - AI switch on AND the 'study' permission allowed, or nothing is sent;
//   - shares the 50/day AI cap with ai-chat (each model call is logged in ai_requests);
//   - only the document text goes to the provider — no profile, memories or other records;
//   - the model is told to use only the document; output is validated and size-capped.
//
// Resumable and paced: long files are condensed part by part and each part's notes are saved
// (study_notes). When the provider rate-limits (Groq free tier: 8,000 tokens/minute), the function
// waits the advised time if it fits its time budget, otherwise returns { status: 'in_progress' }
// with retry_after; the app calls again and work continues from the next unfinished part.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { chunkText } from './studyText.ts';

const ALLOWED_ORIGINS = ['https://nexus-theta-peach.vercel.app', 'http://localhost:5173'];
const DAILY_LIMIT = 50;
const CHUNK = 7_000; // ~1.8k tokens: each call stays well inside an 8k tokens/minute cap
const MAX_CHUNKS = 8;
const NOTES_TOKENS = 700;
const FINAL_TOKENS = 2_500;
const BUDGET_MS = 100_000; // stay well under the Edge Function wall-clock limit
const MAX_WAIT_S = 30;

const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]!,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
});
const json = (b: unknown, s: number, o: string | null) => new Response(JSON.stringify(b), { status: s, headers: { ...cors(o), 'Content-Type': 'application/json' } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function publishableKey(): string {
  try {
    const k = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}');
    if (k.default) return k.default;
  } catch {
    /* fall through */
  }
  return Deno.env.get('SUPABASE_ANON_KEY') ?? '';
}

const RULES = `You are a careful study assistant for a university student.
Use ONLY the document text provided. Do not add facts, examples, names, formulas or sources that are not in it.
If something is unclear or missing in the document, say so instead of guessing.`;

class RateLimited {
  constructor(public seconds: number) {}
}
class Fatal {
  constructor(public status: number, public message: string) {}
}

/** Seconds to wait, from Retry-After or the provider's "try again in Xs" message. */
function retryAfter(res: Response, body: string): number {
  const h = Number(res.headers.get('retry-after'));
  if (Number.isFinite(h) && h > 0) return Math.ceil(h);
  const m = /try again in ([\d.]+)\s*(ms|s)/i.exec(body);
  if (m) return Math.max(1, Math.ceil(m[2] === 'ms' ? Number(m[1]) / 1000 : Number(m[1])));
  return 20;
}

async function callModel(sb: SupabaseClient, system: string, user: string, maxTokens: number, jsonMode: boolean): Promise<string> {
  const apiKey = Deno.env.get('AI_API_KEY');
  if (!apiKey) throw new Fatal(503, 'No AI provider is configured (AI_API_KEY missing).');
  const baseUrl = (Deno.env.get('AI_BASE_URL') ?? 'https://api.groq.com/openai/v1').replace(/\/$/, '');
  const model = Deno.env.get('AI_MODEL') ?? 'openai/gpt-oss-120b';
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: maxTokens,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (res.status === 429) {
    const body = await res.text().catch(() => '');
    // Rate-limited calls aren't counted against the daily cap: nothing was processed.
    throw new RateLimited(retryAfter(res, body));
  }
  const out = res.ok ? await res.json() : null;
  const text: string = out?.choices?.[0]?.message?.content ?? '';
  await sb.from('ai_requests').insert({ status: res.ok ? 'ok' : 'error', model, categories: ['study'], prompt_chars: system.length + user.length, response_chars: text.length });
  if (!res.ok) {
    console.error('provider error', res.status, (await res.text().catch(() => '')).slice(0, 200));
    throw new Fatal(502, 'The AI provider returned an error.');
  }
  return text;
}

type Pair = { q: string; a: string };
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const pairs = (v: unknown, max: number): Pair[] =>
  (Array.isArray(v) ? v : [])
    .map((x) => ({ q: str((x as Pair)?.q, 400), a: str((x as Pair)?.a, 800) }))
    .filter((p) => p.q && p.a)
    .slice(0, max);

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin);
  const started = Date.now();

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Sign in required' }, 401, origin);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, publishableKey(), { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: u, error: ue } = await sb.auth.getUser(token);
  if (ue || !u.user) return json({ error: 'Sign in required' }, 401, origin);

  let id: unknown;
  try {
    id = (await req.json())?.id;
  } catch {
    return json({ error: 'Invalid JSON' }, 400, origin);
  }
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Invalid id' }, 400, origin);

  const [prefs, perm, mat] = await Promise.all([
    sb.from('user_preferences').select('ai_enabled').single(),
    sb.from('ai_permissions').select('allowed').eq('category', 'study').maybeSingle(),
    sb.from('study_materials').select('id, title, extracted_text').eq('id', id).maybeSingle(),
  ]);
  if (!prefs.data?.ai_enabled || !perm.data?.allowed) return json({ error: 'Allow “Study materials” for AI first (and turn AI on).' }, 403, origin);
  if (!mat.data) return json({ error: 'Not found' }, 404, origin);
  const text: string = mat.data.extracted_text ?? '';
  if (text.trim().length < 200) return json({ error: 'Not enough text in this file to analyse (it may be a scanned PDF).' }, 422, origin);

  const all = chunkText(text, CHUNK);
  const chunks = all.slice(0, MAX_CHUNKS);
  const total = chunks.length;
  const partial = all.length > MAX_CHUNKS;

  // Saved notes from earlier runs (discard any from a different split).
  let saved = new Map<number, string>();
  if (total > 1) {
    const { data: rows } = await sb.from('study_notes').select('part, parts_total, notes').eq('material_id', mat.data.id);
    if ((rows ?? []).some((r) => r.parts_total !== total)) await sb.from('study_notes').delete().eq('material_id', mat.data.id);
    else saved = new Map((rows ?? []).map((r) => [r.part as number, r.notes as string]));
  }

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await sb.from('ai_requests').select('id', { count: 'exact', head: true }).gte('created_at', since).neq('status', 'blocked');
  const callsLeft = (total > 1 ? total - saved.size : 0) + 1;
  if ((count ?? 0) + callsLeft > DAILY_LIMIT) return json({ error: `This needs ${callsLeft} more AI calls and would pass today's limit of ${DAILY_LIMIT}. Try tomorrow — finished parts are kept.` }, 429, origin);

  /** Run one call, waiting out rate limits while the time budget allows. */
  async function paced(fn: () => Promise<string>): Promise<string | { wait: number }> {
    for (;;) {
      try {
        return await fn();
      } catch (e) {
        if (!(e instanceof RateLimited)) throw e;
        const wait = Math.min(e.seconds, 60);
        if (wait > MAX_WAIT_S || Date.now() - started + wait * 1000 + 15_000 > BUDGET_MS) return { wait };
        await sleep((wait + 1) * 1000);
      }
    }
  }
  const progress = (wait: number) => json({ status: 'in_progress', done: total > 1 ? saved.size : 0, total: total > 1 ? total + 1 : 1, retry_after: wait }, 202, origin);

  try {
    let source: string;
    if (total === 1) source = chunks[0]!;
    else {
      for (let i = 1; i <= total; i++) {
        if (saved.has(i)) continue;
        const r = await paced(() =>
          callModel(sb, RULES, `Part ${i} of ${total} of "${mat.data!.title}". Write concise study notes (max 12 bullet points) covering every key idea, definition and formula in this part:\n\n${chunks[i - 1]}`, NOTES_TOKENS, false),
        );
        if (typeof r !== 'string') return progress(r.wait);
        const notes = r.trim().slice(0, 8000) || '- (no notes)';
        await sb.from('study_notes').insert({ material_id: mat.data.id, part: i, parts_total: total, notes });
        saved.set(i, notes);
      }
      source = [...saved.entries()].sort((a, b) => a[0] - b[0]).map(([i, n]) => `Notes on part ${i}:\n${n}`).join('\n\n');
    }

    const r = await paced(() =>
      callModel(
        sb,
        RULES,
        `Create a study pack for "${mat.data!.title}" as a JSON object with exactly these keys:
- "summary": a clear summary (150-350 words) of what the document covers,
- "key_concepts": array of up to 12 objects {"term","explanation"},
- "flashcards": array of up to 15 objects {"q","a"} testing important facts and definitions,
- "questions": array of up to 8 exam-style practice questions {"q","a"} with model answers.
Base everything only on this ${total > 1 ? 'set of notes from the document' : 'document'}:

${source}`,
        FINAL_TOKENS,
        true,
      ),
    );
    if (typeof r !== 'string') return progress(r.wait);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(r);
    } catch {
      return json({ error: 'The AI returned an unreadable answer. Try again — finished parts are kept.' }, 502, origin);
    }
    const summary = str(parsed.summary, 6000);
    if (!summary) return json({ error: 'The AI returned an empty summary. Try again.' }, 502, origin);
    const key_concepts = (Array.isArray(parsed.key_concepts) ? parsed.key_concepts : [])
      .map((k) => ({ term: str((k as { term?: unknown })?.term, 120), explanation: str((k as { explanation?: unknown })?.explanation, 600) }))
      .filter((k) => k.term && k.explanation)
      .slice(0, 12);

    await sb.from('study_analyses').delete().eq('material_id', mat.data.id);
    const ins = await sb.from('study_analyses').insert({
      material_id: mat.data.id,
      summary,
      key_concepts,
      flashcards: pairs(parsed.flashcards, 15),
      questions: pairs(parsed.questions, 8),
      model: Deno.env.get('AI_MODEL') ?? 'openai/gpt-oss-120b',
      chars_used: chunks.reduce((n, c) => n + c.length, 0),
    });
    if (ins.error) return json({ error: 'Could not save the study pack.' }, 500, origin);
    await sb.from('study_materials').update({ status: 'analysed' }).eq('id', mat.data.id);
    return json({ status: 'done', partial }, 200, origin);
  } catch (e) {
    if (e instanceof Fatal) return json({ error: e.message }, e.status, origin);
    console.error('analyze failed', e instanceof Error ? e.message : e);
    return json({ error: 'Could not reach the AI provider. Try again — finished parts are kept.' }, 504, origin);
  }
});
