import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, ExternalLink, Plus, ShieldQuestion, XCircle } from 'lucide-react';
import { z } from 'zod';
import { Button, ConfirmDelete, Field, Notice, Panel, Select, TextInput } from '../../components/ui';
import { requireSupabase } from '../../lib/supabase';
import { todayIn } from '../../lib/dates';
import { relevance } from '../../lib/insights';
import { useProfile } from '../profile/ProfileProvider';

const KINDS = ['scholarship', 'internship', 'competition', 'certification', 'job', 'grant', 'event', 'business', 'other'] as const;
const STATUSES = ['saved', 'applying', 'applied', 'won', 'rejected', 'dropped'] as const;

const OppSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  kind: z.enum(KINDS),
  organisation: z.string().nullable(),
  url: z.string().nullable(),
  description: z.string().nullable(),
  eligibility: z.string().nullable(),
  deadline: z.string().nullable(),
  relevance: z.string().nullable(),
  next_action: z.string().nullable(),
  status: z.enum(STATUSES),
  tags: z.array(z.string()),
  link_status: z.enum(['unchecked', 'ok', 'broken']),
  link_checked_at: z.string().nullable(),
});
type Opp = z.infer<typeof OppSchema>;

const sb = () => requireSupabase();

async function load() {
  const [opps, skills, goals] = await Promise.all([
    sb().from('opportunities').select('id, title, kind, organisation, url, description, eligibility, deadline, relevance, next_action, status, tags, link_status, link_checked_at').order('deadline', { ascending: true, nullsFirst: false }),
    sb().from('skills').select('name'),
    sb().from('goals').select('area').eq('status', 'active'),
  ]);
  for (const r of [opps, skills, goals]) if (r.error) throw r.error;
  return {
    opps: z.array(OppSchema).parse(opps.data),
    skills: (skills.data ?? []).map((s: { name: string }) => s.name),
    areas: [...new Set((goals.data ?? []).map((g: { area: string }) => g.area))],
  };
}

const daysLeft = (deadline: string, today: string) => Math.round((Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);

export function RadarPage() {
  const { profile } = useProfile();
  const today = todayIn(profile?.timezone ?? 'Africa/Accra');
  const [data, setData] = useState<Awaited<ReturnType<typeof load>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  const reload = useCallback(async () => {
    try {
      setData(await load());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load opportunities.');
    }
  }, []);
  useEffect(() => {
    let active = true;
    load()
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e instanceof Error ? e.message : 'Could not load opportunities.'));
    return () => {
      active = false;
    };
  }, []);

  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  }

  const closed = (o: Opp) => ['won', 'rejected', 'dropped'].includes(o.status) || (o.deadline !== null && o.deadline < today && o.status === 'saved');
  const list = data?.opps.filter((o) => closed(o) === showClosed) ?? [];

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">Opportunity Radar</h1>
          <p className="mt-1 text-[15px] text-text-muted">Scholarships, internships, competitions and certifications you’re tracking.</p>
        </div>
        <Button onClick={() => setAdding((v) => !v)}>
          <Plus className="size-4" aria-hidden /> Add
        </Button>
      </header>
      <p className="text-sm text-text-faint">
        NEXUS doesn’t invent listings. Save opportunities you find; it checks each link on the server, matches it to your skills and goals, and reminds you before the deadline.
      </p>
      {error && <Notice tone="danger">{error}</Notice>}
      {adding && <OppForm onDone={() => setAdding(false)} run={run} />}
      {data && data.opps.length === 0 && !adding && (
        <Panel>
          <p className="text-[15px] text-text-muted">Nothing saved yet. Good places to look: your department notice board, the university career office, and organisations’ own websites.</p>
        </Panel>
      )}
      <ul className="space-y-3">
        {list.map((o) => {
          const matches = relevance(o.tags, data!.skills, data!.areas);
          const d = o.deadline ? daysLeft(o.deadline, today) : null;
          return (
            <li key={o.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-medium">{o.title}</p>
                  <p className="text-xs text-text-faint">
                    <span className="capitalize">{o.kind}</span>
                    {o.organisation && ` · ${o.organisation}`}
                  </p>
                </div>
                {d !== null && (
                  <span className={`tabular shrink-0 text-xs ${d < 0 ? 'text-text-faint' : d <= 7 ? 'text-danger' : d <= 21 ? 'text-accent' : 'text-text-muted'}`}>
                    {d < 0 ? 'Closed' : d === 0 ? 'Closes today' : `${d} day${d === 1 ? '' : 's'} left`}
                  </span>
                )}
              </div>
              {o.description && <p className="mt-2 text-sm text-text-muted">{o.description}</p>}
              {o.eligibility && <p className="mt-1 text-sm text-text-faint">Eligibility: {o.eligibility}</p>}
              {(matches.length > 0 || o.relevance) && (
                <p className="mt-1 text-sm text-text-muted">
                  Relevant: {[...matches, ...(o.relevance ? [o.relevance] : [])].join(' · ')}
                </p>
              )}
              {o.next_action && <p className="mt-1 text-sm">Next: {o.next_action}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {o.url && (
                  <a
                    href={o.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs hover:border-accent"
                  >
                    Open <ExternalLink className="size-3" aria-hidden />
                  </a>
                )}
                {o.url && <LinkBadge o={o} run={run} />}
                <select
                  aria-label="Status"
                  value={o.status}
                  onChange={(e) => run(async () => {
                    const { error: err } = await sb().from('opportunities').update({ status: e.target.value }).eq('id', o.id);
                    if (err) throw err;
                  })}
                  className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <span className="flex-1" />
                <ConfirmDelete label={`Delete ${o.title}`} onConfirm={() => run(async () => {
                  const { error: err } = await sb().from('opportunities').delete().eq('id', o.id);
                  if (err) throw err;
                })} />
              </div>
            </li>
          );
        })}
      </ul>
      {data && data.opps.some(closed) && (
        <button className="text-sm text-text-muted hover:text-text" onClick={() => setShowClosed((v) => !v)}>
          {showClosed ? 'Show open' : `Show closed (${data.opps.filter(closed).length})`}
        </button>
      )}
    </div>
  );
}

function LinkBadge({ o, run }: { o: Opp; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const check = () => {
    setBusy(true);
    void run(async () => {
      const { error } = await sb().functions.invoke('verify-link', { body: { id: o.id } });
      if (error) throw new Error('Link check is unavailable right now.');
    }).finally(() => setBusy(false));
  };
  if (o.link_status === 'ok')
    return (
      <span className="inline-flex items-center gap-1 text-xs text-success" title={`Checked ${o.link_checked_at?.slice(0, 10)}`}>
        <CheckCircle2 className="size-3.5" aria-hidden /> Link verified
      </span>
    );
  return (
    <button onClick={check} disabled={busy} className={`inline-flex items-center gap-1 text-xs ${o.link_status === 'broken' ? 'text-danger' : 'text-text-muted'} hover:text-text`}>
      {o.link_status === 'broken' ? <XCircle className="size-3.5" aria-hidden /> : <ShieldQuestion className="size-3.5" aria-hidden />}
      {busy ? 'Checking…' : o.link_status === 'broken' ? 'Link broken — recheck' : 'Check link'}
    </button>
  );
}

function OppForm({ onDone, run }: { onDone: () => void; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [f, setF] = useState({ title: '', kind: 'internship', organisation: '', url: '', deadline: '', eligibility: '', description: '', next_action: '', tags: '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  async function submit(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      const row = {
        title: f.title.trim(),
        kind: f.kind,
        organisation: f.organisation.trim() || null,
        url: f.url.trim() || null,
        deadline: f.deadline || null,
        eligibility: f.eligibility.trim() || null,
        description: f.description.trim() || null,
        next_action: f.next_action.trim() || null,
        tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 12),
      };
      if (row.url && !/^https:\/\//i.test(row.url)) throw new Error('Links must start with https://');
      const { data, error } = await sb().from('opportunities').insert(row).select('id').single();
      if (error) throw error;
      if (row.url) await sb().functions.invoke('verify-link', { body: { id: (data as { id: string }).id } });
    });
    onDone();
  }
  return (
    <Panel title="Save an opportunity">
      <form onSubmit={submit} className="space-y-3">
        <Field label="Title">
          <TextInput value={f.title} onChange={set('title')} required maxLength={160} placeholder="Software engineering internship 2027" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <Select value={f.kind} onChange={set('kind')}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Deadline">
            <TextInput type="date" value={f.deadline} onChange={set('deadline')} />
          </Field>
        </div>
        <Field label="Organisation">
          <TextInput value={f.organisation} onChange={set('organisation')} maxLength={120} />
        </Field>
        <Field label="Link (where you found it)" hint="https only — NEXUS checks it on the server.">
          <TextInput value={f.url} onChange={set('url')} maxLength={500} placeholder="https://" />
        </Field>
        <Field label="Eligibility">
          <TextInput value={f.eligibility} onChange={set('eligibility')} maxLength={500} placeholder="Level 300+, CS students, Ghanaian citizens" />
        </Field>
        <Field label="Short description">
          <TextInput value={f.description} onChange={set('description')} maxLength={1000} />
        </Field>
        <Field label="Next action">
          <TextInput value={f.next_action} onChange={set('next_action')} maxLength={300} placeholder="Update CV and ask Dr. Mensah for a reference" />
        </Field>
        <Field label="Tags (comma-separated)" hint="Used to match your skills and goals, e.g. networking, cybersecurity, leadership.">
          <TextInput value={f.tags} onChange={set('tags')} maxLength={300} />
        </Field>
        <div className="flex gap-2">
          <Button type="submit">Save</Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Panel>
  );
}
