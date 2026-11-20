import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Check, ChevronDown, ChevronLeft, Plus } from 'lucide-react';
import { Button, ConfirmDelete, Field, Notice, Panel, Select, TextInput } from '../../components/ui';
import { milestoneProgress } from '../../lib/habits';
import { todayIn } from '../../lib/dates';
import { useRunner, type Run } from '../../lib/useRunner';
import { useProfile } from '../profile/ProfileProvider';
import { HabitRow } from './HabitRow';
import {
  GOAL_AREAS,
  addMilestone,
  removeRow,
  saveGoal,
  saveHabit,
  setGoalStatus,
  setHabitArchived,
  setMilestoneDone,
  useGoals,
  type Goal,
  type GoalsData,
  type Milestone,
} from './api';

const fmtDate = (d: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));

export function GoalsPage() {
  const { data, error, reload } = useGoals();
  const { run, error: actionError, busy } = useRunner(reload);
  const { profile } = useProfile();
  const today = todayIn(profile?.timezone ?? 'Africa/Accra');

  return (
    <div className="space-y-6">
      <header>
        <Link to="/life" className="mb-3 inline-flex items-center gap-1 text-sm text-text-muted hover:text-text">
          <ChevronLeft className="size-4" aria-hidden /> My Life
        </Link>
        <h1 className="text-[28px] font-semibold tracking-tight">Goals & habits</h1>
      </header>
      {error && <Notice tone="danger">{error}</Notice>}
      {actionError && <Notice tone="danger">{actionError}</Notice>}
      {!data && !error && <p className="text-text-muted">Loading…</p>}
      {data && (
        <>
          <Habits data={data} run={run} busy={busy} today={today} />
          <Goals data={data} run={run} busy={busy} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Habits
// ---------------------------------------------------------------------------

function Habits({ data, run, busy, today }: { data: GoalsData; run: Run; busy: boolean; today: string }) {
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const datesByHabit = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const c of data.checkins) (m.get(c.habit_id) ?? m.set(c.habit_id, new Set()).get(c.habit_id)!).add(c.on_date);
    return m;
  }, [data.checkins]);
  const list = data.habits.filter((h) => Boolean(h.archived_at) === showArchived);
  const archived = data.habits.filter((h) => h.archived_at).length;

  return (
    <Panel
      title="Habits"
      action={
        <Button variant="ghost" className="h-9 px-3 text-sm" onClick={() => setAdding((v) => !v)}>
          <Plus className="size-4" aria-hidden /> Add
        </Button>
      }
    >
      {adding && <HabitForm run={run} busy={busy} onDone={() => setAdding(false)} />}
      {data.habits.length === 0 && !adding && (
        <p className="text-[15px] text-text-muted">Small things you want to do regularly — read, exercise, review notes. Tick them off each day.</p>
      )}
      <div className="divide-y divide-border">
        {list.map((h) => (
          <div key={h.id} className="flex items-center gap-1">
            <div className="min-w-0 flex-1">
              <HabitRow habit={h} dates={datesByHabit.get(h.id) ?? new Set()} today={today} run={run} />
            </div>
            <button className="rounded-lg px-2 py-1 text-xs text-text-faint hover:text-text" onClick={() => run(() => setHabitArchived(h.id, !h.archived_at))}>
              {h.archived_at ? 'Restore' : 'Archive'}
            </button>
            {h.archived_at && <ConfirmDelete label={`Delete ${h.name}`} onConfirm={() => run(() => removeRow('habits', h.id))} />}
          </div>
        ))}
      </div>
      {archived > 0 && (
        <button className="mt-3 text-sm text-text-muted hover:text-text" onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? 'Show active' : `Show archived (${archived})`}
        </button>
      )}
    </Panel>
  );
}

function HabitForm({ run, busy, onDone }: { run: Run; busy: boolean; onDone: () => void }) {
  const [name, setName] = useState('');
  const [target, setTarget] = useState('7');
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (await run(() => saveHabit({ name, target_per_week: Number(target) }))) onDone();
  }
  return (
    <form onSubmit={submit} className="mb-4 grid grid-cols-[1fr_auto_auto] items-end gap-3 rounded-xl border border-border p-4">
      <Field label="Habit">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder="Read 20 minutes" />
      </Field>
      <Field label="How often">
        <Select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="7">Every day</option>
          {[6, 5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n}× a week
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" disabled={busy}>
        Save
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

function Goals({ data, run, busy }: { data: GoalsData; run: Run; busy: boolean }) {
  const [adding, setAdding] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const active = data.goals.filter((g) => g.status === 'active');
  const closed = data.goals.filter((g) => g.status !== 'active');
  const list = showClosed ? closed : active;

  return (
    <Panel
      title="Goals"
      action={
        <Button variant="ghost" className="h-9 px-3 text-sm" onClick={() => setAdding((v) => !v)}>
          <Plus className="size-4" aria-hidden /> Add
        </Button>
      }
    >
      {adding && <GoalForm run={run} busy={busy} onDone={() => setAdding(false)} />}
      {data.goals.length === 0 && !adding && (
        <p className="text-[15px] text-text-muted">
          What are you working towards? Break each goal into milestones — progress is milestones done, not a guess.
        </p>
      )}
      <ul className="space-y-3">
        {list.map((g) => (
          <GoalItem key={g.id} goal={g} milestones={data.milestones.filter((m) => m.goal_id === g.id)} run={run} busy={busy} />
        ))}
      </ul>
      {closed.length > 0 && (
        <button className="mt-3 text-sm text-text-muted hover:text-text" onClick={() => setShowClosed((v) => !v)}>
          {showClosed ? 'Show active' : `Show achieved & dropped (${closed.length})`}
        </button>
      )}
    </Panel>
  );
}

function GoalItem({ goal, milestones, run, busy }: { goal: Goal; milestones: Milestone[]; run: Run; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const pct = milestoneProgress(milestones);
  const done = milestones.filter((m) => m.done_at).length;

  async function add(e: FormEvent) {
    e.preventDefault();
    if (await run(() => addMilestone(goal.id, title, due || null))) {
      setTitle('');
      setDue('');
    }
  }

  return (
    <li className="rounded-xl border border-border">
      <button className="flex w-full items-start gap-3 p-4 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <div className="min-w-0 flex-1">
          <p className={`text-[15px] font-medium ${goal.status === 'dropped' ? 'text-text-faint line-through' : ''}`}>{goal.title}</p>
          <p className="mt-0.5 text-xs text-text-faint">
            <span className="capitalize">{goal.area}</span> · {goal.horizon === 'long' ? 'Long-term' : 'Short-term'}
            {goal.target_date && ` · by ${fmtDate(goal.target_date)}`}
            {goal.status === 'achieved' && <span className="text-success"> · Achieved</span>}
          </p>
          {pct !== null && (
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-raised" role="progressbar" aria-label={`${goal.title} progress`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
              </div>
              <span className="tabular text-xs text-text-muted">
                {done}/{milestones.length}
              </span>
            </div>
          )}
        </div>
        <ChevronDown className={`mt-1 size-4 shrink-0 text-text-faint transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          {goal.why && <p className="mb-3 text-sm italic text-text-muted">“{goal.why}”</p>}
          <ul className="mb-3">
            {milestones.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-1.5">
                <button
                  onClick={() => run(() => setMilestoneDone(m.id, !m.done_at))}
                  aria-label={m.done_at ? `Mark ${m.title} not done` : `Mark ${m.title} done`}
                  className={`flex size-5 shrink-0 items-center justify-center rounded border ${m.done_at ? 'border-success bg-success text-bg' : 'border-border hover:border-accent'}`}
                >
                  {m.done_at && <Check className="size-3" aria-hidden />}
                </button>
                <span className={`flex-1 text-[15px] ${m.done_at ? 'text-text-faint line-through' : ''}`}>{m.title}</span>
                {m.due_on && <span className="text-xs text-text-faint">{fmtDate(m.due_on)}</span>}
                <ConfirmDelete label={`Delete ${m.title}`} onConfirm={() => run(() => removeRow('goal_milestones', m.id))} />
              </li>
            ))}
          </ul>
          {goal.status === 'active' && (
            <form onSubmit={add} className="mb-4 flex gap-2">
              <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a milestone" maxLength={120} aria-label="New milestone" />
              <input
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                aria-label="Milestone due date"
                className="h-11 rounded-xl border border-border bg-surface px-2 text-sm text-text-muted focus:border-accent focus:outline-none"
              />
              <Button type="submit" disabled={busy || !title.trim()} aria-label="Add milestone">
                <Plus className="size-4" aria-hidden />
              </Button>
            </form>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {goal.status === 'active' ? (
              <>
                <Button variant="ghost" className="h-9 border border-border px-3 text-sm" onClick={() => run(() => setGoalStatus(goal.id, 'achieved'))}>
                  Mark achieved
                </Button>
                <Button variant="ghost" className="h-9 px-3 text-sm" onClick={() => run(() => setGoalStatus(goal.id, 'dropped'))}>
                  Drop
                </Button>
              </>
            ) : (
              <Button variant="ghost" className="h-9 border border-border px-3 text-sm" onClick={() => run(() => setGoalStatus(goal.id, 'active'))}>
                Reopen
              </Button>
            )}
            <span className="flex-1" />
            <ConfirmDelete label={`Delete goal ${goal.title}`} onConfirm={() => run(() => removeRow('goals', goal.id))} />
          </div>
        </div>
      )}
    </li>
  );
}

function GoalForm({ run, busy, onDone }: { run: Run; busy: boolean; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [why, setWhy] = useState('');
  const [area, setArea] = useState<Goal['area']>('personal');
  const [horizon, setHorizon] = useState<Goal['horizon']>('short');
  const [date, setDate] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (await run(() => saveGoal({ title, why: why.trim() || null, area, horizon, target_date: date || null }))) onDone();
  }
  return (
    <form onSubmit={submit} className="mb-4 space-y-3 rounded-xl border border-border p-4">
      <Field label="Goal">
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} placeholder="Get a first-class this semester" />
      </Field>
      <Field label="Why it matters (optional)">
        <TextInput value={why} onChange={(e) => setWhy(e.target.value)} maxLength={500} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Area">
          <Select value={area} onChange={(e) => setArea(e.target.value as Goal['area'])}>
            {GOAL_AREAS.map((a) => (
              <option key={a} value={a}>
                {a[0]!.toUpperCase() + a.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Horizon">
          <Select value={horizon} onChange={(e) => setHorizon(e.target.value as Goal['horizon'])}>
            <option value="short">Short-term</option>
            <option value="long">Long-term</option>
          </Select>
        </Field>
        <Field label="Target date">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Button type="submit" disabled={busy}>
        Save goal
      </Button>
    </form>
  );
}
