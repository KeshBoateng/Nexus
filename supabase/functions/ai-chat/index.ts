// NEXUS ai-chat — the only path from NEXUS data to an AI provider (spec §14, §15).
//
// Guarantees, enforced here on the server (the browser is untrusted):
//   1. The caller is a signed-in user (JWT verified via Supabase Auth).
//   2. user_preferences.ai_enabled must be true, or nothing is sent.
//   3. Only categories the user allowed in ai_permissions are included; memories pass
//      through the same filter as the app's preview (aiContext.ts, kept identical by a test).
//   4. A daily cap per user; message content is never stored.
//   5. The provider key lives only in Edge Function secrets (AI_API_KEY).
// Provider-neutral: any OpenAI-compatible Chat Completions API. Defaults to Groq.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { AI_CATEGORIES, buildAiContext, renderContext, type AiCategory, type MemoryItem } from './aiContext.ts';

const ALLOWED_ORIGINS = ['https://nexus-theta-peach.vercel.app', 'http://localhost:5173'];
const DAILY_LIMIT = 50;
const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 4000;
const MAX_SUMMARY_LINES = 40;
const MAX_SUMMARY_LINE_CHARS = 300;

const SYSTEM_PROMPT = `You are NEXUS, a personal operating system assistant for one user: a university student in Ghana building toward software engineering, leadership and business ownership.

Rules you must follow:
- Use only the context provided below and what the user tells you. If something is not in the context, say you don't have it — never invent grades, balances, transactions, deadlines, people or events.
- Never invent links, video titles, courses or resources. If you suggest learning material, describe what to look for, or refer to resources in the user's NEXUS Development section.
- Lines marked "Unconfirmed guess" are not facts; treat them as uncertain.
- Financial, legal, tax and regulatory topics: give general educational information only, say so, and suggest a qualified professional for decisions.
- You cannot take actions, send messages or change records. Suggest; the user decides and acts.
- Be concise, practical and warm. Prefer a few concrete next steps over long essays.`;

function cors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]!;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), 'Content-Type': 'application/json' } });
}

function publishableKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}');
    if (keys.default) return keys.default;
  } catch {
    /* fall through */
  }
  return Deno.env.get('SUPABASE_ANON_KEY') ?? '';
}

type Msg = { role: 'user' | 'assistant'; content: string };

function parseBody(raw: unknown): { messages: Msg[]; summaries: Partial<Record<AiCategory, string[]>>; today: string } | string {
  if (!raw || typeof raw !== 'object') return 'Invalid body';
  const b = raw as Record<string, unknown>;
  if (!Array.isArray(b.messages) || b.messages.length === 0 || b.messages.length > MAX_MESSAGES) return 'Invalid messages';
  const messages: Msg[] = [];
  for (const m of b.messages) {
    if (!m || typeof m !== 'object') return 'Invalid message';
    const { role, content } = m as Record<string, unknown>;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || !content.trim() || content.length > MAX_MESSAGE_CHARS) return 'Invalid message';
    messages.push({ role, content });
  }
  if (messages[messages.length - 1]!.role !== 'user') return 'Last message must be from the user';
  const summaries: Partial<Record<AiCategory, string[]>> = {};
  if (b.summaries && typeof b.summaries === 'object') {
    for (const [k, v] of Object.entries(b.summaries as Record<string, unknown>)) {
      if (!(AI_CATEGORIES as readonly string[]).includes(k) || k === 'memories' || !Array.isArray(v)) continue;
      summaries[k as AiCategory] = v.filter((x): x is string => typeof x === 'string').slice(0, MAX_SUMMARY_LINES).map((x) => x.slice(0, MAX_SUMMARY_LINE_CHARS));
    }
  }
  const today = typeof b.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.today) ? b.today : new Date().toISOString().slice(0, 10);
  return { messages, summaries, today };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin);

  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Sign in required' }, 401, origin);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, publishableKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userData.user) return json({ error: 'Sign in required' }, 401, origin);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400, origin);
  }
  const parsed = parseBody(body);
  if (typeof parsed === 'string') return json({ error: parsed }, 400, origin);

  // Consent: master switch + per-category permissions, read with the user's own RLS.
  const [prefs, perms, mems, profile] = await Promise.all([
    sb.from('user_preferences').select('ai_enabled').single(),
    sb.from('ai_permissions').select('category, allowed'),
    sb.from('personal_memories').select('id, content, kind, topic, ai_visible, sensitive, expires_on, confirmed_at, source'),
    sb.from('profiles').select('display_name, timezone, default_currency').single(),
  ]);
  if (prefs.error || perms.error || mems.error || profile.error) return json({ error: 'Could not load your settings' }, 500, origin);
  if (!prefs.data.ai_enabled) {
    await sb.from('ai_requests').insert({ status: 'blocked', categories: [] });
    return json({ error: 'AI features are turned off in NEXUS.' }, 403, origin);
  }

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await sb.from('ai_requests').select('id', { count: 'exact', head: true }).gte('created_at', since).neq('status', 'blocked');
  if ((count ?? 0) >= DAILY_LIMIT) return json({ error: `Daily limit of ${DAILY_LIMIT} AI messages reached. Everything else in NEXUS still works.` }, 429, origin);

  const permissions = Object.fromEntries((perms.data ?? []).map((p: { category: string; allowed: boolean }) => [p.category, p.allowed])) as Partial<Record<AiCategory, boolean>>;
  const p = profile.data as { display_name: string | null; timezone: string; default_currency: string };
  const ctx = buildAiContext({
    aiEnabled: true,
    permissions,
    today: parsed.today,
    memories: (mems.data ?? []) as MemoryItem[],
    summaries: { ...parsed.summaries, profile: [`Name: ${p.display_name ?? 'not set'}`, `Timezone: ${p.timezone}`, `Currency: ${p.default_currency}`] },
  });
  const context = renderContext(ctx);
  const categories = ctx.sections.map((s) => s.category);

  const apiKey = Deno.env.get('AI_API_KEY');
  if (!apiKey) return json({ error: 'No AI provider is configured yet (AI_API_KEY secret missing).' }, 503, origin);
  const baseUrl = (Deno.env.get('AI_BASE_URL') ?? 'https://api.groq.com/openai/v1').replace(/\/$/, '');
  const model = Deno.env.get('AI_MODEL') ?? 'openai/gpt-oss-120b';

  const system = `${SYSTEM_PROMPT}\n\nToday is ${parsed.today}.\n\n${context ? `What the user has allowed you to know:\n\n${context}` : 'The user has not shared any personal data with you. Answer generally.'}`;
  const promptChars = system.length + parsed.messages.reduce((n, m) => n + m.content.length, 0);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, temperature: 0.4, max_tokens: 800, messages: [{ role: 'system', content: system }, ...parsed.messages] }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      console.error('provider error', res.status, detail);
      await sb.from('ai_requests').insert({ status: 'error', model, categories, prompt_chars: promptChars });
      return json({ error: res.status === 429 ? 'The AI provider is busy (rate limit). Try again in a minute.' : 'The AI provider returned an error.' }, 502, origin);
    }
    const out = await res.json();
    const reply: string = out?.choices?.[0]?.message?.content ?? '';
    await sb.from('ai_requests').insert({ status: 'ok', model, categories, prompt_chars: promptChars, response_chars: reply.length });
    return json({ reply, model, shared: categories, withheld: ctx.withheld }, 200, origin);
  } catch (e) {
    console.error('provider call failed', e instanceof Error ? e.message : e);
    await sb.from('ai_requests').insert({ status: 'error', model, categories, prompt_chars: promptChars });
    return json({ error: 'Could not reach the AI provider.' }, 504, origin);
  }
});
