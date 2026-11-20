import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Check, Eye, EyeOff, Lock, Pencil, Plus, X } from 'lucide-react';
import { Button, ConfirmDelete, Field, Notice, Panel, Select, TextInput } from '../../components/ui';
import { AI_CATEGORIES, buildAiContext, renderContext, type AiCategory } from '../../lib/aiContext';
import { todayIn } from '../../lib/dates';
import { useRunner, type Run } from '../../lib/useRunner';
import { useProfile } from '../profile/ProfileProvider';
import { updatePreferences } from '../profile/api';
import { fetchHistory } from '../briefing/api';
import { AskPanel } from './AskPanel';
import { InsightsPanel } from '../review/ReviewPages';
import { CalendarCheck, Radar } from 'lucide-react';
import {
  KIND_LABEL,
  MEMORY_KINDS,
  MEMORY_TOPICS,
  addMemories,
  addMemory,
  confirmMemory,
  deleteMemory,
  setPermission,
  updateMemory,
  useIntel,
  type IntelData,
  type Memory,
} from './api';

const CATEGORY_LABEL: Record<AiCategory, { label: string; hint: string }> = {
  profile: { label: 'Profile', hint: 'Your name, timezone, currency' },
  memories: { label: 'Personal memory', hint: 'The items below that are marked visible' },
  academics: { label: 'Academics', hint: 'Courses, grades, deadlines' },
  finances: { label: 'Finances', hint: 'Balances, spending, budgets' },
  goals: { label: 'Goals & habits', hint: 'Goals, milestones, habit streaks' },
  projects: { label: 'Projects', hint: 'Tasks, team names, meeting notes' },
  development: { label: 'Development', hint: 'Skills and learning progress' },
};

export function IntelligencePage() {
  const { data, error, reload } = useIntel();
  const { run, error: actionError, busy } = useRunner(reload);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[28px] font-semibold tracking-tight">Intelligence</h1>
        <p className="mt-1 text-[15px] text-text-muted">What NEXUS knows about you — and exactly what it may share.</p>
      </header>
      {error && <Notice tone="danger">{error}</Notice>}
      {actionError && <Notice tone="danger">{actionError}</Notice>}
      {!data && !error && <p className="text-text-muted">Loading…</p>}
      {data && (
        <>
          <AskPanel permissions={data.permissions} />
          {data.memories.length === 0 && <Onboarding run={run} busy={busy} />}
          <MemoryCentre data={data} run={run} busy={busy} />
          <AiAccess data={data} run={run} />
          <RecHistory />
          <div className="grid gap-3 sm:grid-cols-2">
            <Link to="/review" className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 hover:border-accent">
              <CalendarCheck className="size-5 text-accent" aria-hidden />
              <span>
                <span className="block text-[15px] font-medium">Weekly review</span>
                <span className="block text-sm text-text-muted">Look back, plan forward</span>
              </span>
            </Link>
            <Link to="/radar" className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 hover:border-accent">
              <Radar className="size-5 text-accent" aria-hidden />
              <span>
                <span className="block text-[15px] font-medium">Opportunity Radar</span>
                <span className="block text-sm text-text-muted">Scholarships, internships, competitions</span>
              </span>
            </Link>
          </div>
          <InsightsPanel />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recommendation history
// ---------------------------------------------------------------------------

const RATING_LABEL: Record<string, string> = {
  very_useful: 'Very useful',
  somewhat_useful: 'Somewhat useful',
  not_useful: 'Not useful',
  already_know: 'Already knew',
};

function RecHistory() {
  const { profile } = useProfile();
  const today = todayIn(profile?.timezone ?? 'Africa/Accra');
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchHistory>> | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setOpen((v) => !v);
    if (rows) return;
    try {
      setRows(await fetchHistory(today));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load history.');
    }
  }

  const counts = rows
    ? {
        shown: rows.recs.length,
        done: rows.recs.filter((r) => r.status === 'completed' || r.status === 'applied').length,
        applied: rows.recs.filter((r) => r.status === 'applied').length,
        dismissed: rows.recs.filter((r) => r.status === 'dismissed').length,
      }
    : null;

  return (
    <Panel
      title="Recommendation history"
      action={
        <button className="text-sm text-text-muted hover:text-text" onClick={load}>
          {open ? 'Hide' : 'Show last 90 days'}
        </button>
      }
    >
      {!open && <p className="text-[15px] text-text-muted">Every recommendation NEXUS has made, why, and what happened.</p>}
      {error && <Notice tone="danger">{error}</Notice>}
      {open && counts && (
        <>
          <p className="tabular mb-3 text-sm text-text-muted">
            {counts.shown} shown · {counts.done} done · {counts.applied} applied · {counts.dismissed} not now
          </p>
          <ul className="divide-y divide-border">
            {rows!.recs.map((r) => (
              <li key={r.id} className="py-2.5">
                <p className="text-[15px]">{r.title}</p>
                <p className="text-xs text-text-faint">
                  {r.shown_on} · {r.status === 'open' ? 'no action' : r.status}
                  {rows!.ratings.get(r.id) && ` · ${RATING_LABEL[rows!.ratings.get(r.id)!]}`}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

const QUESTIONS: { key: string; label: string; placeholder: string; topic: Memory['topic']; kind: Memory['kind']; prefix: string }[] = [
  { key: 'study', label: 'What are you studying, and which year are you in?', placeholder: 'BSc Computer Science, Level 200', topic: 'academic', kind: 'fact', prefix: 'Studies: ' },
  { key: 'ambition', label: 'Where do you want to be in 5–10 years?', placeholder: 'Running my own tech company', topic: 'ambition', kind: 'fact', prefix: 'Long-term ambition: ' },
  { key: 'career', label: 'What kind of work do you want next (internship / first job)?', placeholder: 'Software engineering or cybersecurity internship', topic: 'career', kind: 'fact', prefix: 'Career target: ' },
  { key: 'tech', label: 'Which technical areas interest you most?', placeholder: 'AI, networking, web development', topic: 'technical', kind: 'fact', prefix: 'Technical interests: ' },
  { key: 'learn', label: 'How do you learn best?', placeholder: 'Building things, then reading the docs', topic: 'learning', kind: 'preference', prefix: 'Learns best by: ' },
  { key: 'time', label: 'When do you do your best focused work?', placeholder: 'Early morning', topic: 'productivity', kind: 'preference', prefix: 'Best focus time: ' },
];

function Onboarding({ run, busy }: { run: Run; busy: boolean }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  async function submit(e: FormEvent) {
    e.preventDefault();
    const items = QUESTIONS.filter((q) => answers[q.key]?.trim()).map((q) => ({
      content: `${q.prefix}${answers[q.key]!.trim()}`,
      kind: q.kind,
      topic: q.topic,
      expires_on: null,
      sensitive: false,
    }));
    await run(() => addMemories(items, 'onboarding'));
  }
  return (
    <Panel title="Tell NEXUS about you">
      <p className="mb-4 text-[15px] text-text-muted">
        A few answers help NEXUS make recommendations that fit you. Answer what you like — everything can be edited or deleted
        later, and none of it is shared with an AI unless you allow it below.
      </p>
      <form onSubmit={submit} className="space-y-3">
        {QUESTIONS.map((q) => (
          <Field key={q.key} label={q.label}>
            <TextInput value={answers[q.key] ?? ''} onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })} placeholder={q.placeholder} maxLength={300} />
          </Field>
        ))}
        <Button type="submit" disabled={busy || !Object.values(answers).some((a) => a.trim())}>
          Save
        </Button>
      </form>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Memory Centre
// ---------------------------------------------------------------------------

function MemoryCentre({ data, run, busy }: { data: IntelData; run: Run; busy: boolean }) {
  const [filter, setFilter] = useState<Memory['kind'] | 'all'>('all');
  const [adding, setAdding] = useState(false);
  const guesses = data.memories.filter((m) => m.kind === 'hypothesis');
  const list = data.memories.filter((m) => filter === 'all' || m.kind === filter);
  const count = (k: Memory['kind']) => data.memories.filter((m) => m.kind === k).length;

  return (
    <Panel
      title="Personal memory"
      action={
        <Button variant="ghost" className="h-9 px-3 text-sm" onClick={() => setAdding((v) => !v)}>
          <Plus className="size-4" aria-hidden /> Add
        </Button>
      }
    >
      {adding && <MemoryForm run={run} busy={busy} onDone={() => setAdding(false)} />}
      {guesses.length > 0 && (
        <p className="mb-3 rounded-lg bg-surface-raised px-3 py-2 text-sm text-text-muted">
          {guesses.length} guess{guesses.length === 1 ? '' : 'es'} waiting for you to confirm or reject. NEXUS never treats a guess as fact.
        </p>
      )}
      {data.memories.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {(['all', ...MEMORY_KINDS] as const).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              aria-pressed={filter === k}
              className={`rounded-lg px-2.5 py-1 text-xs ${filter === k ? 'bg-surface-raised text-text' : 'text-text-muted hover:text-text'}`}
            >
              {k === 'all' ? `All ${data.memories.length}` : `${KIND_LABEL[k]} ${count(k)}`}
            </button>
          ))}
        </div>
      )}
      {data.memories.length === 0 && !adding && <p className="text-[15px] text-text-muted">Nothing stored yet.</p>}
      <ul className="divide-y divide-border">
        {list.map((m) => (
          <MemoryRow key={m.id} m={m} run={run} busy={busy} />
        ))}
      </ul>
    </Panel>
  );
}

function MemoryRow({ m, run, busy }: { m: Memory; run: Run; busy: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(m.content);

  if (editing) {
    return (
      <li className="py-3">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => updateMemory(m.id, { content: text.trim() }))) setEditing(false);
          }}
          className="flex gap-2"
        >
          <TextInput value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} aria-label="Edit memory" />
          <Button type="submit" disabled={busy || !text.trim()} aria-label="Save">
            <Check className="size-4" aria-hidden />
          </Button>
          <Button type="button" variant="ghost" onClick={() => setEditing(false)} aria-label="Cancel">
            <X className="size-4" aria-hidden />
          </Button>
        </form>
      </li>
    );
  }

  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px]">{m.content}</p>
          <p className="mt-0.5 text-xs text-text-faint">
            <span className={m.kind === 'hypothesis' ? 'text-accent' : ''}>{KIND_LABEL[m.kind]}</span> · {m.topic} · from {m.source}
            {m.kind === 'hypothesis' && m.confidence !== null && ` · ${m.confidence}% confident`}
            {m.expires_on && ` · until ${m.expires_on}`}
            {m.confirmed_at && ' · confirmed by you'}
          </p>
        </div>
        <div className="flex shrink-0 items-center">
          {m.sensitive ? (
            <button
              className="rounded-lg p-1.5 text-accent"
              onClick={() => run(() => updateMemory(m.id, { sensitive: false }))}
              aria-label="Sensitive — never shared with AI. Tap to unmark."
              title="Sensitive — never shared with AI"
            >
              <Lock className="size-4" aria-hidden />
            </button>
          ) : (
            <button
              className={`rounded-lg p-1.5 ${m.ai_visible ? 'text-text-muted' : 'text-text-faint'} hover:text-text`}
              onClick={() => run(() => updateMemory(m.id, { ai_visible: !m.ai_visible }))}
              aria-label={m.ai_visible ? 'AI may see this. Tap to hide.' : 'Hidden from AI. Tap to allow.'}
              title={m.ai_visible ? 'AI may see this' : 'Hidden from AI'}
            >
              {m.ai_visible ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}
            </button>
          )}
          {!m.sensitive && (
            <button className="rounded-lg p-1.5 text-text-faint hover:text-text" onClick={() => run(() => updateMemory(m.id, { sensitive: true }))} aria-label="Mark sensitive" title="Mark sensitive">
              <Lock className="size-4 opacity-40" aria-hidden />
            </button>
          )}
          <button className="rounded-lg p-1.5 text-text-faint hover:text-text" onClick={() => setEditing(true)} aria-label="Correct this">
            <Pencil className="size-4" aria-hidden />
          </button>
          <ConfirmDelete label="Delete this memory" onConfirm={() => run(() => deleteMemory(m.id))} />
        </div>
      </div>
      {m.kind === 'hypothesis' && (
        <div className="mt-2 flex gap-2">
          <Button variant="ghost" className="h-8 border border-border px-3 text-xs" onClick={() => run(() => confirmMemory(m.id))}>
            That’s right
          </Button>
          <Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => run(() => deleteMemory(m.id))}>
            That’s wrong
          </Button>
        </div>
      )}
    </li>
  );
}

function MemoryForm({ run, busy, onDone }: { run: Run; busy: boolean; onDone: () => void }) {
  const [content, setContent] = useState('');
  const [kind, setKind] = useState<Memory['kind']>('fact');
  const [topic, setTopic] = useState<Memory['topic']>('personal');
  const [expires, setExpires] = useState('');
  const [sensitive, setSensitive] = useState(false);
  const kinds = MEMORY_KINDS.filter((k) => k !== 'hypothesis' && k !== 'pattern');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (await run(() => addMemory({ content, kind, topic, expires_on: kind === 'temporary' ? expires || null : null, sensitive }))) onDone();
  }
  return (
    <form onSubmit={submit} className="mb-4 space-y-3 rounded-xl border border-border p-4">
      <Field label="What should NEXUS remember?">
        <TextInput value={content} onChange={(e) => setContent(e.target.value)} required maxLength={1000} placeholder="I want to learn system design this year" />
      </Field>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Type">
          <Select value={kind} onChange={(e) => setKind(e.target.value as Memory['kind'])}>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Topic">
          <Select value={topic} onChange={(e) => setTopic(e.target.value as Memory['topic'])}>
            {MEMORY_TOPICS.map((t) => (
              <option key={t} value={t}>
                {t[0]!.toUpperCase() + t.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        {kind === 'temporary' && (
          <Field label="Until">
            <TextInput type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </Field>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm text-text-muted">
        <input type="checkbox" checked={sensitive} onChange={(e) => setSensitive(e.target.checked)} className="size-4 accent-[var(--accent)]" />
        Sensitive — never share with any AI
      </label>
      <Button type="submit" disabled={busy}>
        Save
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// AI data access
// ---------------------------------------------------------------------------

function AiAccess({ data, run }: { data: IntelData; run: Run }) {
  const { profile, preferences, reload } = useProfile();
  const [preview, setPreview] = useState(false);
  const aiEnabled = preferences?.ai_enabled ?? false;
  const today = todayIn(profile?.timezone ?? 'Africa/Accra');

  const ctx = buildAiContext({
    aiEnabled,
    permissions: data.permissions,
    today,
    memories: data.memories,
    summaries: {
      profile: profile ? [`Name: ${profile.display_name ?? '—'}`, `Timezone: ${profile.timezone}`, `Currency: ${profile.default_currency}`] : [],
    },
  });
  const text = renderContext(ctx);

  async function toggleMaster() {
    if (!preferences) return;
    await run(async () => {
      await updatePreferences(preferences.user_id, {
        theme: preferences.theme,
        briefing_time: preferences.briefing_time,
        quiet_hours_start: preferences.quiet_hours_start,
        quiet_hours_end: preferences.quiet_hours_end,
        ai_enabled: !aiEnabled,
      });
      await reload();
    });
  }

  return (
    <Panel title="What AI may see">
      <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-border p-4">
        <div>
          <p className="text-[15px] font-medium">AI features {aiEnabled ? 'on' : 'off'}</p>
          <p className="text-sm text-text-muted">
            {aiEnabled ? 'Only the categories you allow below can be sent.' : 'Nothing is ever sent to an AI provider. Everything else in NEXUS works normally.'}
          </p>
        </div>
        <Button variant={aiEnabled ? 'ghost' : 'primary'} className={aiEnabled ? 'border border-border' : ''} onClick={toggleMaster}>
          {aiEnabled ? 'Turn off' : 'Turn on'}
        </Button>
      </div>
      <ul className={`divide-y divide-border ${aiEnabled ? '' : 'opacity-50'}`}>
        {AI_CATEGORIES.map((c) => (
          <li key={c} className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="text-[15px]">{CATEGORY_LABEL[c].label}</p>
              <p className="text-xs text-text-faint">{CATEGORY_LABEL[c].hint}</p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={data.permissions[c]}
                disabled={!aiEnabled}
                onChange={(e) => run(() => setPermission(c, e.target.checked))}
                aria-label={`Allow AI to see ${CATEGORY_LABEL[c].label}`}
              />
              <span className="h-6 w-11 rounded-full bg-surface-raised transition-colors peer-checked:bg-accent" />
              <span className="absolute left-0.5 size-5 rounded-full bg-text transition-transform peer-checked:translate-x-5" />
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-4">
        <button className="text-sm text-text-muted hover:text-text" onClick={() => setPreview((v) => !v)}>
          {preview ? 'Hide preview' : 'Preview exactly what would be sent'}
        </button>
        {preview && (
          <div className="mt-2">
            {text ? (
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-surface-raised p-3 text-xs text-text-muted">{text}</pre>
            ) : (
              <p className="text-sm text-text-muted">Nothing — {aiEnabled ? 'no allowed category has data yet' : 'AI is off'}.</p>
            )}
            {aiEnabled && (ctx.withheld.sensitive > 0 || ctx.withheld.hidden > 0 || ctx.withheld.expired > 0) && (
              <p className="mt-2 text-xs text-text-faint">
                Withheld: {ctx.withheld.sensitive} sensitive, {ctx.withheld.hidden} hidden, {ctx.withheld.expired} expired.
              </p>
            )}
            <p className="mt-2 text-xs text-text-faint">
              Summaries of the other allowed categories (academics, finances…) are computed when you send a message. <Link to="/settings" className="underline">Settings</Link>
            </p>
          </div>
        )}
      </div>
    </Panel>
  );
}
