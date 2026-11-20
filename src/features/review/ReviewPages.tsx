import type React from 'react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { Button, Field, Notice, Panel } from '../../components/ui';
import { requireSupabase } from '../../lib/supabase';
import { todayIn } from '../../lib/dates';
import { formatMoney } from '../../lib/money';
import { formatGpa } from '../../lib/gpa';
import { isoWeek } from '../../lib/reminders';
import { gpaTrend, habitWeeks, monthlySpend, weekStats, type WeekStats } from '../../lib/insights';
import { useProfile } from '../profile/ProfileProvider';
import { fetchAcademics } from '../academics/api';
import { fetchFinances } from '../finances/api';
import { fetchGoals } from '../goals/api';

const ReviewSchema = z.object({
  id: z.uuid(),
  week_key: z.string(),
  wins: z.string().nullable(),
  challenges: z.string().nullable(),
  lessons: z.string().nullable(),
  next_focus: z.string().nullable(),
  energy: z.number().nullable(),
  stats: z.record(z.string(), z.unknown()),
});
type Review = z.infer<typeof ReviewSchema>;

async function loadEverything(today: string, currency: string) {
  const [acad, fin, goals, doneTasks] = await Promise.all([fetchAcademics(), fetchFinances(), fetchGoals(), completedTasks()]);
  const accounts = new Map(fin.accounts.map((a) => [a.id, a]));
  const daily = goals.habits.filter((h) => !h.archived_at && h.target_per_week >= 7).map((h) => h.id);
  return {
    stats: weekStats(today, currency, {
      tasks: doneTasks.map((c) => ({ completed_at: c })),
      assessments: acad.assessments.map((a) => ({ completed_at: a.completed_at })),
      dailyHabitIds: daily,
      checkins: goals.checkins,
      entries: fin.transactions,
      accounts,
    }),
    gpa: gpaTrend(acad.terms, acad.courses, acad.bands),
    spend: monthlySpend(fin.transactions, accounts, currency, today, 6),
    habits: habitWeeks(daily, goals.checkins, today, 8),
  };
}

async function completedTasks(): Promise<(string | null)[]> {
  const { data, error } = await requireSupabase().from('project_tasks').select('completed_at').not('completed_at', 'is', null);
  if (error) throw error;
  return (data ?? []).map((r: { completed_at: string | null }) => r.completed_at);
}

function useInsights() {
  const { profile } = useProfile();
  const today = todayIn(profile?.timezone ?? 'Africa/Accra');
  const currency = profile?.default_currency ?? 'GHS';
  const [data, setData] = useState<Awaited<ReturnType<typeof loadEverything>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    loadEverything(today, currency)
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e instanceof Error ? e.message : 'Could not load insights.'));
    return () => {
      active = false;
    };
  }, [today, currency]);
  return { data, error, today, currency };
}

function Bars({ items, format, max }: { items: { label: string; value: number | null; caption: string }[]; format: (v: number) => string; max?: number }) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value ?? 0));
  return (
    <div className="flex h-36 items-end gap-1.5" role="img" aria-label={items.map((i) => `${i.caption}: ${i.value === null ? 'no data' : format(i.value)}`).join('; ')}>
      {items.map((i) => (
        <div key={i.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <span className="tabular text-[10px] text-text-faint">{i.value === null ? '—' : format(i.value)}</span>
          <div className="flex h-24 w-full items-end">
            <div className="w-full rounded-t-md bg-accent/80" style={{ height: `${i.value === null ? 0 : Math.max(2, (i.value / top) * 100)}%` }} />
          </div>
          <span className="w-full truncate text-center text-[10px] text-text-faint">{i.caption}</span>
        </div>
      ))}
    </div>
  );
}

/** Compact trends for the Intelligence page. */
export function InsightsPanel() {
  const { data, error, currency } = useInsights();
  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!data) return null;
  const monthName = (m: string) => new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(new Date(`${m}-01T00:00:00Z`));
  return (
    <Panel title="Insights">
      <div className="space-y-6">
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-faint">GPA by term</h3>
          {data.gpa.length ? (
            <Bars items={data.gpa.map((g) => ({ label: g.label, value: g.gpa, caption: g.label }))} format={(v) => formatGpa(v)} max={4} />
          ) : (
            <p className="text-sm text-text-muted">Appears once a term has final marks.</p>
          )}
        </section>
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-faint">Spending per month ({currency})</h3>
          <Bars items={data.spend.map((s) => ({ label: s.label, value: s.minor, caption: monthName(s.label) }))} format={(v) => formatMoney(v, currency).replace(/\.\d+$/, '')} />
        </section>
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-faint">Daily-habit consistency per week</h3>
          {data.habits.some((h) => h.pct !== null) ? (
            <Bars items={data.habits.map((h) => ({ label: h.label, value: h.pct, caption: h.label.slice(5) }))} format={(v) => `${v}%`} max={100} />
          ) : (
            <p className="text-sm text-text-muted">Appears once you track a daily habit.</p>
          )}
        </section>
      </div>
    </Panel>
  );
}

const TextArea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea rows={3} maxLength={1000} className="w-full rounded-xl border border-border bg-surface p-3 text-[15px] text-text focus:border-accent focus:outline-none" {...props} />
);

/** Weekly review: this week's numbers from records + a short reflection. */
export function WeeklyReviewPage() {
  const { data, error, today, currency } = useInsights();
  const week = isoWeek(today);
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [form, setForm] = useState({ wins: '', challenges: '', lessons: '', next_focus: '', energy: 3 });
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data: rows, error: e } = await requireSupabase().from('weekly_reviews').select('id, week_key, wins, challenges, lessons, next_focus, energy, stats').order('week_key', { ascending: false }).limit(20);
    if (e) throw e;
    return z.array(ReviewSchema).parse(rows);
  }, []);

  useEffect(() => {
    let active = true;
    load()
      .then((r) => {
        if (!active) return;
        setReviews(r);
        const cur = r.find((x) => x.week_key === week);
        if (cur) setForm({ wins: cur.wins ?? '', challenges: cur.challenges ?? '', lessons: cur.lessons ?? '', next_focus: cur.next_focus ?? '', energy: cur.energy ?? 3 });
      })
      .catch(() => active && setMsg({ tone: 'danger', text: 'Could not load reviews.' }));
    return () => {
      active = false;
    };
  }, [load, week]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    const row = {
      wins: form.wins.trim() || null,
      challenges: form.challenges.trim() || null,
      lessons: form.lessons.trim() || null,
      next_focus: form.next_focus.trim() || null,
      energy: form.energy,
      stats: (data?.stats ?? {}) as unknown as Record<string, unknown>,
    };
    const existing = reviews?.find((r) => r.week_key === week);
    const sb = requireSupabase().from('weekly_reviews');
    const { error: err } = existing ? await sb.update(row).eq('id', existing.id) : await sb.insert({ week_key: week, ...row });
    if (err) return setMsg({ tone: 'danger', text: err.message });
    setReviews(await load());
    setMsg({ tone: 'success', text: 'Saved.' });
  }

  const s = data?.stats;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[28px] font-semibold tracking-tight">Weekly review</h1>
        <p className="mt-1 text-[15px] text-text-muted">{week} · ten minutes to look back and plan forward.</p>
      </header>
      {error && <Notice tone="danger">{error}</Notice>}
      {s && <StatsRow s={s} currency={currency} />}
      <Panel title="Reflect">
        <form onSubmit={save} className="space-y-3">
          <Field label="What went well?">
            <TextArea value={form.wins} onChange={set('wins')} />
          </Field>
          <Field label="What got in the way?">
            <TextArea value={form.challenges} onChange={set('challenges')} />
          </Field>
          <Field label="What did you learn?">
            <TextArea value={form.lessons} onChange={set('lessons')} />
          </Field>
          <Field label="One focus for next week">
            <TextArea value={form.next_focus} onChange={set('next_focus')} rows={2} />
          </Field>
          <Field label={`Energy this week: ${form.energy}/5`}>
            <input type="range" min={1} max={5} value={form.energy} onChange={(e) => setForm({ ...form, energy: Number(e.target.value) })} className="w-full accent-[var(--accent)]" />
          </Field>
          <div className="flex items-center gap-3">
            <Button type="submit">Save review</Button>
            {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
          </div>
        </form>
      </Panel>
      {reviews && reviews.filter((r) => r.week_key !== week).length > 0 && (
        <Panel title="Past reviews">
          <ul className="divide-y divide-border">
            {reviews
              .filter((r) => r.week_key !== week)
              .map((r) => (
                <li key={r.id} className="py-3 text-sm">
                  <p className="font-medium">{r.week_key}{r.energy ? ` · energy ${r.energy}/5` : ''}</p>
                  {r.next_focus && <p className="text-text-muted">Focus: {r.next_focus}</p>}
                  {r.lessons && <p className="text-text-faint">Learned: {r.lessons}</p>}
                </li>
              ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function StatsRow({ s, currency }: { s: WeekStats; currency: string }) {
  const cell = (label: string, value: string) => (
    <div className="rounded-2xl border border-border bg-surface px-3 py-3">
      <p className="text-xs text-text-faint">{label}</p>
      <p className="tabular mt-1 text-[19px] font-semibold">{value}</p>
    </div>
  );
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cell('Tasks done', String(s.tasks_done))}
      {cell('Assessments done', String(s.assessments_done))}
      {cell('Habit consistency', s.habit_consistency === null ? '—' : `${s.habit_consistency}%`)}
      {cell('Spent', formatMoney(s.spent_minor, currency))}
    </section>
  );
}
