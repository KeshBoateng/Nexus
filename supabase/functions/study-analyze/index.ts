// NEXUS study-analyze — builds a study pack (summary, key concepts, flashcards, practice
// questions) from ONE uploaded material's extracted text.
//
// Enforced here, server-side:
//   - signed-in user; the material is read through their own RLS (others' ids aren't found);
//   - AI switch on AND the 'study' permission allowed, or nothing is sent;
//   - shares the 50/day AI cap with ai-chat (each model call is logged in ai_requests);
//   - only the document text goes to the provider — no profile, memories or other records;
//   - the model is told to use only the document; output is validated and size-capped.
// Long documents: up to MAX_CHUNKS pieces are condensed one by one, then combined.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { chunkText } from './studyText.ts';

const ALLOWED_ORIGINS = ['https://nexus-theta-peach.vercel.app', 'http://localhost:5173'];
const DAILY_LIMIT = 50;
const CHUNK = 10_000;
const MAX_CHUNKS = 5;

const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]!,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
});
const json = (b: unknown, s: number, o: string | null) => new Response(JSON.stringify(b), { status: s, headers: { ...cors(o), 'Content-Type': 'application/json' } });

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

async function callModel(sb: SupabaseClient, system: string, user: string, jsonMode: boolean): Promise<string> {
  const apiKey = Deno.env.get('AI_API_KEY');
  if (!apiKey) throw new Response(JSON.stringify({ error: 'No AI provider is configured (AI_API_KEY missing).' }), { status: 503 });
  const baseUrl = (Deno.env.get('AI_BASE_URL') ?? 'https://api.groq.com/openai/v1').replace(/\/$/, '');
  const model = Deno.env.get('AI_MODEL') ?? 'openai/gpt-oss-120b';
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: jsonMode ? 3000 : 1200,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const out = res.ok ? await res.json() : null;
  const text: string = out?.choices?.[0]?.message?.content ?? '';
  await sb.from('ai_requests').insert({ status: res.ok ? 'ok' : 'error', model, categories: ['study'], prompt_chars: system.length + user.length, response_chars: text.length });
  if (!res.ok) {
    console.error('provider error', res.status, (await res.text().catch(() => '')).slice(0, 200));
    throw new Response(JSON.stringify({ error: res.status === 429 ? 'The AI provider is busy (rate limit). Try again in a minute.' : 'The AI provider returned an error.' }), { status: 502 });
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

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await sb.from('ai_requests').select('id', { count: 'exact', head: true }).gte('created_at', since).neq('status', 'blocked');
  const chunks = chunkText(text, CHUNK).slice(0, MAX_CHUNKS);
  const callsNeeded = chunks.length > 1 ? chunks.length + 1 : 1;
  if ((count ?? 0) + callsNeeded > DAILY_LIMIT) return json({ error: `This needs ${callsNeeded} AI calls and would pass today's limit of ${DAILY_LIMIT}. Try tomorrow.` }, 429, origin);

  try {
    let source: string;
    if (chunks.length === 1) source = chunks[0]!;
    else {
      const notes: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        notes.push(
          await callModel(sb, RULES, `Part ${i + 1} of ${chunks.length} of "${mat.data.title}". Write concise study notes (max 12 bullet points) covering every key idea, definition and formula in this part:\n\n${chunks[i]}`, false),
        );
      }
      source = notes.map((n, i) => `Notes on part ${i + 1}:\n${n}`).join('\n\n');
    }

    const raw = await callModel(
      sb,
      RULES,
      `Create a study pack for "${mat.data.title}" as a JSON object with exactly these keys:
- "summary": a clear summary (150-350 words) of what the document covers,
- "key_concepts": array of up to 12 objects {"term","explanation"},
- "flashcards": array of up to 15 objects {"q","a"} testing important facts and definitions,
- "questions": array of up to 8 exam-style practice questions {"q","a"} with model answers.
Base everything only on this ${chunks.length > 1 ? 'set of notes from the document' : 'document'}:

${source}`,
      true,
    );

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return json({ error: 'The AI returned an unreadable answer. Try again.' }, 502, origin);
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
    return json({ ok: true, partial: chunkText(text, CHUNK).length > MAX_CHUNKS }, 200, origin);
  } catch (e) {
    if (e instanceof Response) return new Response(e.body, { status: e.status, headers: { ...cors(origin), 'Content-Type': 'application/json' } });
    console.error('analyze failed', e instanceof Error ? e.message : e);
    return json({ error: 'Could not reach the AI provider.' }, 504, origin);
  }
});
