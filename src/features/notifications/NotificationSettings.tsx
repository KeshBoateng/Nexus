import { useEffect, useState } from 'react';
import { Button, Notice, Panel } from '../../components/ui';
import { useProfile } from '../profile/ProfileProvider';
import { requireSupabase } from '../../lib/supabase';
import { CATEGORY_LABEL, NOTIF_CATEGORIES, disablePush, enablePush, fetchPrefs, pushEnabledHere, pushSupported, sendTest, setPref, type NotifPref } from './api';

export function NotificationSettings() {
  const { preferences, reload } = useProfile();
  const [prefs, setPrefs] = useState<Record<string, NotifPref> | null>(null);
  const [stored, setStored] = useState<Set<string>>(new Set());
  const [here, setHere] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchPrefs(),
      requireSupabase().from('notification_preferences').select('category'),
      pushEnabledHere(),
    ])
      .then(([p, rows, h]) => {
        if (!active) return;
        setPrefs(p);
        setStored(new Set((rows.data ?? []).map((r: { category: string }) => r.category)));
        setHere(h);
      })
      .catch(() => active && setMsg({ tone: 'danger', text: 'Could not load notification settings.' }));
    return () => {
      active = false;
    };
  }, []);

  async function run(fn: () => Promise<string | void>) {
    setBusy(true);
    setMsg(null);
    try {
      const text = await fn();
      if (text) setMsg({ tone: 'success', text });
    } catch (err) {
      setMsg({ tone: 'danger', text: err instanceof Error ? err.message : 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  }

  async function toggle(category: NotifPref['category'], field: 'in_app' | 'push') {
    const cur = prefs![category]!;
    await run(async () => {
      await setPref(category, { [field]: !cur[field] }, stored.has(category));
      setPrefs({ ...prefs!, [category]: { ...cur, [field]: !cur[field] } });
      setStored(new Set([...stored, category]));
    });
  }

  async function toggleAccountability() {
    await run(async () => {
      const { error } = await requireSupabase().from('user_preferences').update({ accountability_mode: !preferences?.accountability_mode }).eq('user_id', preferences!.user_id);
      if (error) throw error;
      await reload();
    });
  }

  return (
    <Panel title="Notifications">
      <div className="space-y-4">
        <div className="rounded-xl border border-border p-4">
          <p className="text-[15px] font-medium">Push on this device</p>
          <p className="mt-0.5 text-sm text-text-muted">
            {!pushSupported()
              ? 'Not supported in this browser. On Android: open NEXUS in Chrome → menu → Install app, then enable here.'
              : here
                ? 'On. Reminders arrive even when NEXUS is closed (outside your quiet hours).'
                : 'Off. You will still see reminders in the app.'}
          </p>
          {pushSupported() && (
            <div className="mt-3 flex flex-wrap gap-2">
              {here ? (
                <>
                  <Button variant="ghost" className="h-9 border border-border px-3 text-sm" disabled={busy} onClick={() => run(async () => `Test sent to ${await sendTest()} device(s).`)}>
                    Send test
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-9 px-3 text-sm"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await disablePush();
                        setHere(false);
                        return 'Push turned off on this device.';
                      })
                    }
                  >
                    Turn off
                  </Button>
                </>
              ) : (
                <Button
                  className="h-9 px-3 text-sm"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await enablePush();
                      setHere(true);
                      return 'Push enabled on this device.';
                    })
                  }
                >
                  Enable push
                </Button>
              )}
            </div>
          )}
        </div>

        <label className="flex items-start gap-3 rounded-xl border border-border p-4">
          <input type="checkbox" checked={preferences?.accountability_mode ?? false} onChange={toggleAccountability} disabled={busy || !preferences} className="mt-1 size-4 accent-[var(--accent)]" />
          <span>
            <span className="block text-[15px] font-medium">Accountability Mode</span>
            <span className="block text-sm text-text-muted">A short morning note when commitments are overdue, and a Sunday-evening weekly check-in. Factual, never guilt-tripping.</span>
          </span>
        </label>

        {prefs && (
          <div>
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 pb-1 text-xs text-text-faint">
              <span>Category</span>
              <span>In app</span>
              <span>Push</span>
            </div>
            {NOTIF_CATEGORIES.filter((c) => c !== 'system').map((c) => (
              <div key={c} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 border-t border-border py-2.5">
                <span className="text-[15px]">{CATEGORY_LABEL[c]}</span>
                <input type="checkbox" aria-label={`${CATEGORY_LABEL[c]} in app`} checked={prefs[c]!.in_app} onChange={() => toggle(c, 'in_app')} disabled={busy} className="size-4 justify-self-center accent-[var(--accent)]" />
                <input type="checkbox" aria-label={`${CATEGORY_LABEL[c]} push`} checked={prefs[c]!.push} onChange={() => toggle(c, 'push')} disabled={busy} className="size-4 justify-self-center accent-[var(--accent)]" />
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-text-faint">Quiet hours (above) hold push until they end. Reminders disappear by themselves once you finish the thing they’re about.</p>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      </div>
    </Panel>
  );
}
