import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { requireSupabase } from '../../lib/supabase';

export const NOTIF_CATEGORIES = ['academic', 'financial', 'study', 'career', 'project', 'leadership', 'habit', 'review', 'recommendation', 'system'] as const;
export const CATEGORY_LABEL: Record<(typeof NOTIF_CATEGORIES)[number], string> = {
  academic: 'Academic deadlines',
  financial: 'Money & budgets',
  study: 'Study sessions',
  career: 'Career development',
  project: 'Project tasks',
  leadership: 'Leadership',
  habit: 'Habits',
  review: 'Reviews & accountability',
  recommendation: 'Daily briefing',
  system: 'System',
};

export const NotifSchema = z.object({
  id: z.uuid(),
  category: z.enum(NOTIF_CATEGORIES),
  priority: z.enum(['low', 'normal', 'high']),
  title: z.string(),
  body: z.string().nullable(),
  link: z.string().nullable(),
  read_at: z.string().nullable(),
  snoozed_until: z.string().nullable(),
  dismissed_at: z.string().nullable(),
  created_at: z.string(),
});
export type Notif = z.infer<typeof NotifSchema>;

function ok<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}
const sb = () => requireSupabase();

/** Visible = not dismissed and not currently snoozed. */
export function isVisible(n: Notif, now = Date.now()) {
  return !n.dismissed_at && !(n.snoozed_until && Date.parse(n.snoozed_until) > now);
}

export async function fetchNotifications(): Promise<Notif[]> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  return z
    .array(NotifSchema)
    .parse(ok(await sb().from('notifications').select('id, category, priority, title, body, link, read_at, snoozed_until, dismissed_at, created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(200)));
}

export async function markRead(ids: string[]) {
  if (ids.length) ok(await sb().from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids).is('read_at', null));
}
export async function snooze(id: string, until: Date) {
  ok(await sb().from('notifications').update({ snoozed_until: until.toISOString() }).eq('id', id));
}
export async function dismiss(id: string) {
  ok(await sb().from('notifications').update({ dismissed_at: new Date().toISOString(), read_at: new Date().toISOString() }).eq('id', id));
}

/** Unread count for the bell; refreshes every minute and when the app regains focus. */
export function useUnreadCount() {
  const [count, setCount] = useState(0);
  const load = useCallback(async () => {
    const { count: c } = await sb().from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null).is('dismissed_at', null);
    return c ?? 0;
  }, []);
  useEffect(() => {
    let active = true;
    const tick = () => void load().then((c) => active && setCount(c)).catch(() => undefined);
    tick();
    const t = setInterval(tick, 60_000);
    window.addEventListener('focus', tick);
    window.addEventListener('nexus:notifications-changed', tick);
    return () => {
      active = false;
      clearInterval(t);
      window.removeEventListener('focus', tick);
      window.removeEventListener('nexus:notifications-changed', tick);
    };
  }, [load]);
  return count;
}

export const announceChange = () => window.dispatchEvent(new Event('nexus:notifications-changed'));

// ---------------------------------------------------------------------------
// Preferences and push
// ---------------------------------------------------------------------------

const PrefSchema = z.object({ category: z.enum(NOTIF_CATEGORIES), in_app: z.boolean(), push: z.boolean() });
export type NotifPref = z.infer<typeof PrefSchema>;

export async function fetchPrefs(): Promise<Record<string, NotifPref>> {
  const rows = z.array(PrefSchema).parse(ok(await sb().from('notification_preferences').select('category, in_app, push')));
  return Object.fromEntries(NOTIF_CATEGORIES.map((c) => [c, rows.find((r) => r.category === c) ?? { category: c, in_app: true, push: true }]));
}

export async function setPref(category: NotifPref['category'], patch: Partial<Pick<NotifPref, 'in_app' | 'push'>>, exists: boolean) {
  if (exists) ok(await sb().from('notification_preferences').update(patch).eq('category', category));
  else ok(await sb().from('notification_preferences').insert({ category, in_app: true, push: true, ...patch }));
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function invoke(action: string) {
  const { data, error } = await sb().functions.invoke('notify', { body: { action } });
  if (error) throw new Error('Notification service is unavailable.');
  return data as Record<string, unknown>;
}

/** Ask permission, subscribe this device, and store the subscription. */
export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error('This browser does not support push notifications. On Android, install NEXUS from Chrome first.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications were not allowed. You can change this in your browser’s site settings.');
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = (await invoke('public-key')) as { publicKey: string };
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const { error } = await sb().from('push_subscriptions').insert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 300) });
  if (error && error.code !== '23505') throw error;
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await sb().from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
}

export async function pushEnabledHere(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return Boolean(await reg?.pushManager.getSubscription());
}

export async function sendTest(): Promise<number> {
  const r = await invoke('test');
  return Number(r.devices ?? 0);
}
