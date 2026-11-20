// NEXUS notify — reminders, in-app notifications and Web Push (spec §10).
//
// Actions (POST JSON { action }):
//   run         — called every 15 min by pg_cron with header x-cron-token (a random token
//                 generated inside the database). Generates reminders for every user, dismisses
//                 ones whose source is done, and pushes what is due.
//   public-key  — signed-in user: returns the VAPID public key (keys are generated here on
//                 first use and stored in app_secrets; the private key never leaves Supabase).
//   test        — signed-in user: creates and pushes a test notification to their devices.
//
// This is the only code that uses the secret key (bypasses RLS). It reads only the fields the
// reminder rules need and writes only notifications / push_subscriptions cleanup.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { activeSources, isQuiet, localParts, reminders, shouldPush, type NotifCategory, type ReminderInput } from './reminders.ts';

const ALLOWED_ORIGINS = ['https://nexus-theta-peach.vercel.app', 'http://localhost:5173'];
const CONTACT = 'mailto:nexus-notify@users.noreply.github.com';

function cors(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]!,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}
const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(origin), 'Content-Type': 'application/json' } });

function key(envJson: string, legacy: string): string {
  try {
    const k = JSON.parse(Deno.env.get(envJson) ?? '{}');
    if (k.default) return k.default;
  } catch {
    /* fall through */
  }
  return Deno.env.get(legacy) ?? '';
}

const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, key('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

async function secret(sb: SupabaseClient, name: string): Promise<string | null> {
  const { data } = await sb.from('app_secrets').select('value').eq('name', name).maybeSingle();
  return (data?.value as string | undefined) ?? null;
}

/** VAPID keys: generated once, inside Supabase, on first use. */
async function vapid(sb: SupabaseClient): Promise<{ publicKey: string; privateKey: string }> {
  const pub = await secret(sb, 'vapid_public');
  const priv = await secret(sb, 'vapid_private');
  if (pub && priv) return { publicKey: pub, privateKey: priv };
  const k = webpush.generateVAPIDKeys();
  await sb.from('app_secrets').upsert([{ name: 'vapid_public', value: k.publicKey }, { name: 'vapid_private', value: k.privateKey }], { onConflict: 'name', ignoreDuplicates: true });
  // Re-read in case another invocation won the race.
  return { publicKey: (await secret(sb, 'vapid_public'))!, privateKey: (await secret(sb, 'vapid_private'))! };
}

async function userFromToken(req: Request): Promise<string | null> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, key('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY'), { auth: { persistSession: false } });
  const { data, error } = await sb.auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

type NotifRow = {
  id: string;
  user_id: string;
  category: NotifCategory;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
  pushed_at: string | null;
  read_at: string | null;
  dismissed_at: string | null;
  snoozed_until: string | null;
  source_key: string | null;
};

async function pushTo(sb: SupabaseClient, userId: string, n: Pick<NotifRow, 'id' | 'title' | 'body' | 'link'>, keys: { publicKey: string; privateKey: string }): Promise<number> {
  const { data: subs } = await sb.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId);
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: n.title, body: n.body ?? '', url: n.link ?? '/', tag: n.id }),
        { vapidDetails: { subject: CONTACT, publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 12 * 3600 },
      );
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await sb.from('push_subscriptions').delete().eq('id', s.id);
      else console.error('push failed', status ?? (e instanceof Error ? e.message : e));
    }
  }
  return sent;
}

async function runForUser(sb: SupabaseClient, u: { id: string; timezone: string; currency: string; briefing_time: string; quiet_start: string | null; quiet_end: string | null; accountability: boolean }, now: string, keys: { publicKey: string; privateKey: string }) {
  const { date, minutes } = localParts(now, u.timezone);
  const weekStartIso = new Date(Date.parse(`${date}T00:00:00Z`) - (((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) * 86_400_000)).toISOString();

  const [courses, assessments, habits, checkins, members, tasks, projects, prefs, budgetRows] = await Promise.all([
    sb.from('courses').select('id, code, title').eq('user_id', u.id),
    sb.from('assessments').select('id, course_id, title, due_at, completed_at').eq('user_id', u.id),
    sb.from('habits').select('id, name, target_per_week, archived_at').eq('user_id', u.id).is('archived_at', null),
    sb.from('habit_checkins').select('habit_id').eq('user_id', u.id).eq('on_date', date),
    sb.from('project_members').select('id').eq('user_id', u.id).eq('is_me', true),
    sb.from('project_tasks').select('id, project_id, title, assignee_member_id, status, due_on, completed_at').eq('user_id', u.id),
    sb.from('projects').select('id, name').eq('user_id', u.id),
    sb.from('notification_preferences').select('category, in_app, push').eq('user_id', u.id),
    sb.rpc('nexus_budgets_over', { p_user: u.id, p_currency: u.currency, p_month: date.slice(0, 7) }),
  ]);

  const courseLabel = new Map((courses.data ?? []).map((c) => [c.id, c.code ?? c.title]));
  const done = new Set((checkins.data ?? []).map((c) => c.habit_id));
  const meIds = new Set((members.data ?? []).map((m) => m.id));
  const projectName = new Map((projects.data ?? []).map((p) => [p.id, p.name]));
  const pref = new Map((prefs.data ?? []).map((p) => [p.category, p]));

  const input: ReminderInput = {
    now,
    timeZone: u.timezone,
    briefingTime: u.briefing_time,
    accountability: u.accountability,
    assessments: (assessments.data ?? []).map((a) => ({ id: a.id, title: a.title, course: courseLabel.get(a.course_id) ?? 'Course', due_at: a.due_at, completed: Boolean(a.completed_at) })),
    habits: (habits.data ?? []).map((h) => ({ id: h.id, name: h.name, daily: h.target_per_week >= 7, doneToday: done.has(h.id) })),
    myTasks: (tasks.data ?? [])
      .filter((t) => t.assignee_member_id && meIds.has(t.assignee_member_id))
      .map((t) => ({ id: t.id, title: t.title, project: projectName.get(t.project_id) ?? 'project', due_on: t.due_on, done: t.status === 'done' })),
    budgetsOver: ((budgetRows.data as { category: string; spent_minor: number; limit_minor: number }[] | null) ?? []).map((b) => ({
      category: b.category,
      text: `Spent ${(b.spent_minor / 100).toFixed(2)} of ${(b.limit_minor / 100).toFixed(2)} ${u.currency} this month.`,
    })),
    weekDone:
      (assessments.data ?? []).filter((a) => a.completed_at && a.completed_at >= weekStartIso).length +
      (tasks.data ?? []).filter((t) => t.completed_at && t.completed_at >= weekStartIso).length,
  };

  // 1. Create new reminders (deduplicated by the database), unless the category is off in-app.
  const fresh = reminders(input).filter((r) => pref.get(r.category)?.in_app !== false);
  if (fresh.length) {
    await sb.from('notifications').upsert(
      fresh.map((r) => ({ user_id: u.id, ...r })),
      { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true },
    );
  }

  // 2. Completion-based suppression.
  const live = activeSources(input);
  const { data: open } = await sb
    .from('notifications')
    .select('id, user_id, category, title, body, link, created_at, pushed_at, read_at, dismissed_at, snoozed_until, source_key')
    .eq('user_id', u.id)
    .is('dismissed_at', null)
    .gte('created_at', new Date(Date.parse(now) - 7 * 86_400_000).toISOString());
  const stale = (open ?? []).filter((n) => n.source_key && !live.has(n.source_key)).map((n) => n.id);
  if (stale.length) await sb.from('notifications').update({ dismissed_at: now }).in('id', stale);

  // 3. Push what is due.
  const quiet = isQuiet(minutes, u.quiet_start, u.quiet_end);
  let pushed = 0;
  for (const n of (open ?? []) as NotifRow[]) {
    if (stale.includes(n.id)) continue;
    if (!shouldPush(n, pref.get(n.category)?.push !== false, quiet, now)) continue;
    const sent = await pushTo(sb, u.id, n, keys);
    if (sent > 0) {
      await sb.from('notifications').update({ pushed_at: now }).eq('id', n.id);
      pushed++;
    }
  }
  return { created: fresh.length, dismissed: stale.length, pushed };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin);

  let body: { action?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400, origin);
  }
  const sb = admin();

  if (body.action === 'run') {
    const expected = await secret(sb, 'cron_token');
    const got = req.headers.get('x-cron-token') ?? '';
    // Constant-time comparison.
    const a = new TextEncoder().encode(got);
    const b = new TextEncoder().encode(expected ?? '');
    let diff = a.length ^ b.length;
    for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
    if (!expected || diff !== 0) return json({ error: 'Forbidden' }, 403, origin);

    const keys = await vapid(sb);
    const now = new Date().toISOString();
    const { data: users, error } = await sb
      .from('profiles')
      .select('id, timezone, default_currency, user_preferences(briefing_time, quiet_hours_start, quiet_hours_end, accountability_mode)');
    if (error) return json({ error: 'Could not load users' }, 500, origin);
    const results = [];
    for (const p of users ?? []) {
      const prefs = (Array.isArray(p.user_preferences) ? p.user_preferences[0] : p.user_preferences) as
        | { briefing_time: string; quiet_hours_start: string | null; quiet_hours_end: string | null; accountability_mode: boolean }
        | undefined;
      if (!prefs) continue;
      try {
        results.push(
          await runForUser(
            sb,
            { id: p.id, timezone: p.timezone, currency: p.default_currency, briefing_time: prefs.briefing_time, quiet_start: prefs.quiet_hours_start, quiet_end: prefs.quiet_hours_end, accountability: prefs.accountability_mode },
            now,
            keys,
          ),
        );
      } catch (e) {
        console.error('run failed for a user', e instanceof Error ? e.message : e);
      }
    }
    return json({ ok: true, users: results.length, results }, 200, origin);
  }

  const userId = await userFromToken(req);
  if (!userId) return json({ error: 'Sign in required' }, 401, origin);

  if (body.action === 'public-key') {
    const keys = await vapid(sb);
    return json({ publicKey: keys.publicKey }, 200, origin);
  }

  if (body.action === 'test') {
    const keys = await vapid(sb);
    const { data, error } = await sb
      .from('notifications')
      .insert({ user_id: userId, category: 'system', priority: 'normal', title: 'NEXUS notifications are working', body: 'This is a test from Settings.', link: '/settings', dedupe_key: `test:${Date.now()}` })
      .select('id, title, body, link')
      .single();
    if (error) return json({ error: 'Could not create test notification' }, 500, origin);
    const sent = await pushTo(sb, userId, data, keys);
    if (sent) await sb.from('notifications').update({ pushed_at: new Date().toISOString() }).eq('id', data.id);
    return json({ ok: true, devices: sent }, 200, origin);
  }

  return json({ error: 'Unknown action' }, 400, origin);
});
