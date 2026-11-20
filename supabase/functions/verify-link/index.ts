// NEXUS verify-link — checks that a saved opportunity's link is live (spec §11: "verify external
// information and links before presenting opportunities as current").
//
// Server-side request forgery protections: https only; no credentials in URLs; hostnames that
// are IP literals or resolve to private / loopback / link-local / metadata ranges are refused;
// redirects are followed manually (max 3) and each hop is re-checked; 10 s timeout; the body is
// never returned to the caller — only ok / broken is stored.

import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = ['https://nexus-theta-peach.vercel.app', 'http://localhost:5173'];
const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]!,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
});
const json = (b: unknown, s: number, o: string | null) => new Response(JSON.stringify(b), { status: s, headers: { ...cors(o), 'Content-Type': 'application/json' } });

function key(envJson: string, legacy: string): string {
  try {
    const k = JSON.parse(Deno.env.get(envJson) ?? '{}');
    if (k.default) return k.default;
  } catch {
    /* fall through */
  }
  return Deno.env.get(legacy) ?? '';
}

function privateV4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p as [number, number, number, number];
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}
function privateV6(ip: string): boolean {
  const x = ip.toLowerCase();
  return x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe8') || x.startsWith('fe9') || x.startsWith('fea') || x.startsWith('feb') || x.startsWith('::ffff:');
}

async function safeHost(host: string): Promise<boolean> {
  const h = host.replace(/^\[|\]$/g, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':')) return false; // no IP literals
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return false;
  try {
    const [v4, v6] = await Promise.all([Deno.resolveDns(h, 'A').catch(() => []), Deno.resolveDns(h, 'AAAA').catch(() => [])]);
    if (v4.length + v6.length === 0) return false;
    return !v4.some(privateV4) && !v6.some(privateV6);
  } catch {
    return false;
  }
}

async function check(url: string): Promise<'ok' | 'broken'> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    let u: URL;
    try {
      u = new URL(current);
    } catch {
      return 'broken';
    }
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return 'broken';
    if (!(await safeHost(u.hostname))) return 'broken';
    let res: Response;
    try {
      res = await fetch(u, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': 'NEXUS-link-check/1.0', Accept: 'text/html,*/*;q=0.8' } });
    } catch {
      return 'broken';
    }
    await res.body?.cancel();
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return 'broken';
      current = new URL(loc, u).toString();
      continue;
    }
    return res.status >= 200 && res.status < 300 ? 'ok' : 'broken';
  }
  return 'broken';
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Sign in required' }, 401, origin);
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, key('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: u, error: ue } = await asUser.auth.getUser(token);
  if (ue || !u.user) return json({ error: 'Sign in required' }, 401, origin);

  let id: unknown;
  try {
    id = (await req.json())?.id;
  } catch {
    return json({ error: 'Invalid JSON' }, 400, origin);
  }
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Invalid id' }, 400, origin);

  // Ownership: read through the user's own RLS — another user's id simply isn't found.
  const { data: opp } = await asUser.from('opportunities').select('id, url').eq('id', id).maybeSingle();
  if (!opp?.url) return json({ error: 'Not found' }, 404, origin);

  const status = await check(opp.url);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, key('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  await admin.from('opportunities').update({ link_status: status, link_checked_at: new Date().toISOString() }).eq('id', opp.id).eq('url', opp.url);
  return json({ status }, 200, origin);
});
