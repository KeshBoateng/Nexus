import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useProfile } from '../profile/ProfileProvider';
import {
  exportMyData,
  updatePreferences,
  updateProfile,
  type Preferences,
  type Profile,
} from '../profile/api';
import { requireSupabase } from '../../lib/supabase';
import { applyTheme, type ThemePreference } from '../../lib/theme';
import { Button, Field, Notice, Panel, Select, TextInput } from '../../components/ui';
import { NotificationSettings } from '../notifications/NotificationSettings';

const CURRENCIES = ['GHS', 'USD', 'EUR', 'GBP', 'NGN', 'KES', 'ZAR'];

function timezones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['Africa/Accra', 'UTC'];
  }
}

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '');

export function SettingsPage() {
  const { session } = useAuth();
  const { profile, preferences, error, reload } = useProfile();

  return (
    <div className="space-y-6">
      <header className="mb-2">
        <h1 className="text-[28px] font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-[15px] text-text-muted">{session?.user.email}</p>
      </header>
      {error && <Notice tone="danger">{error}</Notice>}
      {profile && <ProfileForm key={profile.id} profile={profile} onSaved={reload} />}
      {preferences && <PreferencesForm key={preferences.user_id} prefs={preferences} onSaved={reload} />}
      <NotificationSettings />
      {session && <DataPanel userId={session.user.id} />}
      <Panel>
        <Button variant="danger" onClick={() => requireSupabase().auth.signOut()}>
          Sign out
        </Button>
      </Panel>
    </div>
  );
}

function useSaver(onSaved: () => Promise<void>) {
  const [status, setStatus] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setStatus(null);
    try {
      await fn();
      await onSaved();
      setStatus({ tone: 'success', text: 'Saved.' });
    } catch (err) {
      setStatus({ tone: 'danger', text: err instanceof Error ? err.message : 'Could not save.' });
    } finally {
      setBusy(false);
    }
  }
  return { status, busy, run };
}

function ProfileForm({ profile, onSaved }: { profile: Profile; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(profile.display_name ?? '');
  const [timezone, setTimezone] = useState(profile.timezone);
  const [currency, setCurrency] = useState(profile.default_currency);
  const { status, busy, run } = useSaver(onSaved);

  function submit(e: FormEvent) {
    e.preventDefault();
    void run(() =>
      updateProfile(profile.id, {
        display_name: name.trim() || null,
        timezone,
        default_currency: currency,
      }),
    );
  }

  return (
    <Panel title="Profile">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Timezone">
            <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {timezones().map((tz) => (
                <option key={tz}>{tz}</option>
              ))}
            </Select>
          </Field>
          <Field label="Default currency">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="flex items-center gap-4">
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save profile'}
          </Button>
          {status && <Notice tone={status.tone}>{status.text}</Notice>}
        </div>
      </form>
    </Panel>
  );
}

function PreferencesForm({ prefs, onSaved }: { prefs: Preferences; onSaved: () => Promise<void> }) {
  const [theme, setTheme] = useState<ThemePreference>(prefs.theme);
  const [briefing, setBriefing] = useState(hhmm(prefs.briefing_time));
  const [quietStart, setQuietStart] = useState(hhmm(prefs.quiet_hours_start));
  const [quietEnd, setQuietEnd] = useState(hhmm(prefs.quiet_hours_end));
  const [ai, setAi] = useState(prefs.ai_enabled);
  const { status, busy, run } = useSaver(onSaved);

  function submit(e: FormEvent) {
    e.preventDefault();
    void run(() =>
      updatePreferences(prefs.user_id, {
        theme,
        briefing_time: briefing,
        quiet_hours_start: quietStart || null,
        quiet_hours_end: quietEnd || null,
        ai_enabled: ai,
      }),
    );
  }

  return (
    <Panel title="Preferences">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Theme">
          <Select
            value={theme}
            onChange={(e) => {
              const t = e.target.value as ThemePreference;
              setTheme(t);
              applyTheme(t); // preview immediately; persisted on save
            }}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="system">Match device</option>
          </Select>
        </Field>
        <Field label="Daily briefing time">
          <TextInput type="time" value={briefing} onChange={(e) => setBriefing(e.target.value)} required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Quiet hours start" hint="No notifications in this window.">
            <TextInput type="time" value={quietStart} onChange={(e) => setQuietStart(e.target.value)} />
          </Field>
          <Field label="Quiet hours end">
            <TextInput type="time" value={quietEnd} onChange={(e) => setQuietEnd(e.target.value)} />
          </Field>
        </div>
        <label className="flex items-start gap-3 rounded-xl border border-border p-4">
          <input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} className="mt-1 size-4 accent-[var(--accent)]" />
          <span>
            <span className="block text-[15px] font-medium">Allow AI features</span>
            <span className="block text-sm text-text-muted">
              Off by default. When on, NEXUS may send the data categories you permit to an AI provider. Everything
              else in NEXUS works without it.
            </span>
          </span>
        </label>
        <div className="flex items-center gap-4">
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save preferences'}
          </Button>
          {status && <Notice tone={status.tone}>{status.text}</Notice>}
        </div>
      </form>
    </Panel>
  );
}

function DataPanel({ userId }: { userId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const blob = await exportMyData(userId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nexus-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Your data">
      <p className="mb-4 text-[15px] text-text-muted">Download everything NEXUS stores about you as JSON.</p>
      <div className="flex items-center gap-4">
        <Button variant="ghost" className="border border-border" onClick={download} disabled={busy}>
          {busy ? 'Preparing…' : 'Export my data'}
        </Button>
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Panel>
  );
}
