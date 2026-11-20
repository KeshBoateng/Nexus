import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Check, ChevronLeft, ClipboardCopy, Plus } from 'lucide-react';
import { Button, ConfirmDelete, Field, Notice, Panel, Select, TextInput } from '../../components/ui';
import { nextSteps, projectHealth, summarize, buildAgenda, type NextStep } from '../../lib/projectHealth';
import { HEALTH_STYLE } from './healthStyle';
import { todayIn } from '../../lib/dates';
import { useRunner, type Run } from '../../lib/useRunner';
import { useProfile } from '../profile/ProfileProvider';
import { useAcademics } from '../academics/useAcademics';
import {
  KIND_LABEL,
  PROJECT_KINDS,
  PROJECT_STATUSES,
  STATUS_LABEL,
  addMeeting,
  addMember,
  addMilestone,
  addTask,
  createProject,
  removeRow,
  setMilestoneDone,
  stateOf,
  updateProject,
  updateTask,
  useProjects,
  type Member,
  type Project,
  type ProjectsData,
  type Task,
} from './api';

const fmt = (d: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export function ProjectsListPage() {
  const { data, error, reload } = useProjects();
  const { run, error: actionError, busy } = useRunner(reload);
  const { profile } = useProfile();
  const today = todayIn(profile?.timezone ?? 'Africa/Accra');
  const [adding, setAdding] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  const closed = (p: Project) => p.status === 'done' || p.status === 'cancelled';
  const list = data?.projects.filter((p) => closed(p) === showClosed) ?? [];
  const closedCount = data?.projects.filter(closed).length ?? 0;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-[15px] text-text-muted">Assignments, ventures and team work in one place.</p>
        </div>
        <Button onClick={() => setAdding((v) => !v)}>
          <Plus className="size-4" aria-hidden /> New
        </Button>
      </header>
      {error && <Notice tone="danger">{error}</Notice>}
      {actionError && <Notice tone="danger">{actionError}</Notice>}
      {adding && <NewProject run={run} busy={busy} onDone={() => setAdding(false)} />}
      {data && data.projects.length === 0 && !adding && (
        <Panel>
          <p className="text-[15px] text-text-muted">
            No projects yet. Add a group assignment and its team — NEXUS will track who owns what and flag what needs your attention as the lead.
          </p>
        </Panel>
      )}
      <ul className="space-y-3">
        {data &&
          list.map((p) => {
            const s = stateOf(data, p);
            const h = projectHealth(s, today);
            const x = summarize(s, today);
            const top = nextSteps(s, today, 1)[0];
            return (
              <li key={p.id}>
                <Link to={`/projects/${p.id}`} className="block rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-accent">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[17px] font-semibold tracking-tight">{p.name}</p>
                      <p className="text-xs text-text-faint">
                        {KIND_LABEL[p.kind]} · {STATUS_LABEL[p.status]}
                        {p.due_on && ` · due ${fmt(p.due_on)}`}
                      </p>
                    </div>
                    <span className={`shrink-0 text-sm font-medium ${HEALTH_STYLE[h].cls}`}>{HEALTH_STYLE[h].label}</span>
                  </div>
                  {s.tasks.length > 0 && (
                    <div className="mt-3 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-raised">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${x.percentDone}%` }} />
                      </div>
                      <span className="tabular text-xs text-text-muted">
                        {x.done}/{s.tasks.length}
                      </span>
                    </div>
                  )}
                  {top && <p className="mt-3 text-sm text-text-muted">→ {top.title}</p>}
                </Link>
              </li>
            );
          })}
      </ul>
      {closedCount > 0 && (
        <button className="text-sm text-text-muted hover:text-text" onClick={() => setShowClosed((v) => !v)}>
          {showClosed ? 'Show open projects' : `Show finished (${closedCount})`}
        </button>
      )}
    </div>
  );
}

function NewProject({ run, busy, onDone }: { run: Run; busy: boolean; onDone: () => void }) {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { data: acad } = useAcademics();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Project['kind']>('team');
  const [due, setDue] = useState('');
  const [courseId, setCourseId] = useState('');
  const [description, setDescription] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    let id = '';
    const okay = await run(async () => {
      id = await createProject(
        { name, description: description.trim() || null, kind, status: 'active', due_on: due || null, course_id: courseId || null },
        profile?.display_name ?? 'Me',
      );
    });
    if (okay) {
      onDone();
      navigate(`/projects/${id}`);
    }
  }

  return (
    <Panel title="New project">
      <form onSubmit={submit} className="space-y-3">
        <Field label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} placeholder="DCIT 208 group project" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <Select value={kind} onChange={(e) => setKind(e.target.value as Project['kind'])}>
              {PROJECT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Due">
            <TextInput type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        </div>
        {acad && acad.courses.length > 0 && (
          <Field label="Course (optional)">
            <Select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">—</option>
              {acad.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code ? `${c.code} — ${c.title}` : c.title}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="What is it? (optional)">
          <TextInput value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        </Field>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            Create
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export function ProjectDetailPage() {
  const { id } = useParams();
  const { data, error, reload } = useProjects();
  const { run, error: actionError, busy } = useRunner(reload);
  const { profile } = useProfile();
  const today = todayIn(profile?.timezone ?? 'Africa/Accra');
  const project = data?.projects.find((p) => p.id === id);

  return (
    <div className="space-y-6">
      <Link to="/projects" className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text">
        <ChevronLeft className="size-4" aria-hidden /> Projects
      </Link>
      {error && <Notice tone="danger">{error}</Notice>}
      {actionError && <Notice tone="danger">{actionError}</Notice>}
      {data && !project && <Notice tone="danger">Project not found.</Notice>}
      {data && project && <Detail data={data} project={project} run={run} busy={busy} today={today} />}
    </div>
  );
}

function Detail({ data, project, run, busy, today }: { data: ProjectsData; project: Project; run: Run; busy: boolean; today: string }) {
  const s = stateOf(data, project);
  const health = projectHealth(s, today);
  const steps = nextSteps(s, today);
  const navigate = useNavigate();

  return (
    <>
      <header>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-[26px] font-semibold tracking-tight">{project.name}</h1>
          <span className={`mt-2 shrink-0 text-sm font-medium ${HEALTH_STYLE[health].cls}`}>{HEALTH_STYLE[health].label}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-text-muted">
          <span>{KIND_LABEL[project.kind]}</span>
          <span>·</span>
          <select
            aria-label="Project status"
            value={project.status}
            onChange={(e) => run(() => updateProject(project.id, { ...project, status: e.target.value as Project['status'] }))}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text"
          >
            {PROJECT_STATUSES.map((st) => (
              <option key={st} value={st}>
                {STATUS_LABEL[st]}
              </option>
            ))}
          </select>
          {project.due_on && <span>· due {fmt(project.due_on)}</span>}
        </div>
        {project.description && <p className="mt-3 text-[15px] text-text-muted">{project.description}</p>}
      </header>

      {steps.length > 0 && <NextStepsPanel steps={steps} />}
      <TasksPanel tasks={s.tasks} members={s.members} projectId={project.id} run={run} busy={busy} today={today} />
      <TeamPanel members={s.members} tasks={s.tasks} projectId={project.id} run={run} busy={busy} />
      <MilestonesPanel milestones={s.milestones} projectId={project.id} run={run} busy={busy} today={today} />
      <MeetingsPanel data={data} project={project} run={run} busy={busy} today={today} />

      <div className="flex justify-end">
        <ConfirmDelete
          label={`Delete project ${project.name}`}
          onConfirm={async () => {
            if (await run(() => removeRow('projects', project.id))) navigate('/projects');
          }}
        />
      </div>
    </>
  );
}

function NextStepsPanel({ steps }: { steps: NextStep[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Panel title="What needs your attention">
      <ul className="space-y-3">
        {steps.map((s) => (
          <li key={s.id} className="rounded-xl border border-border p-4">
            <div className="flex items-start gap-3">
              <span
                className={`mt-1.5 size-2 shrink-0 rounded-full ${s.priority === 'high' ? 'bg-danger' : s.priority === 'medium' ? 'bg-accent' : 'bg-text-faint'}`}
                aria-label={`${s.priority} priority`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium">{s.title}</p>
                <p className="mt-1 text-sm text-text-muted">{s.action}</p>
                <button className="mt-2 text-xs text-text-faint hover:text-text" onClick={() => setOpen(open === s.id ? null : s.id)}>
                  {open === s.id ? 'Hide why' : 'Why?'} · ~{s.minutes} min{s.skill && ` · ${s.skill}`}
                </button>
                {open === s.id && (
                  <div className="mt-2 text-sm text-text-muted">
                    <p>{s.why}</p>
                    <ul className="mt-1 list-disc pl-5 text-xs text-text-faint">
                      {s.evidence.map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function TasksPanel({ tasks, members, projectId, run, busy, today }: { tasks: Task[]; members: Member[]; projectId: string; run: Run; busy: boolean; today: string }) {
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('');
  const [due, setDue] = useState('');
  const [showDone, setShowDone] = useState(false);
  const open = tasks.filter((t) => t.status !== 'done');
  const done = tasks.filter((t) => t.status === 'done');

  async function add(e: FormEvent) {
    e.preventDefault();
    if (await run(() => addTask(projectId, title, assignee || null, due || null))) {
      setTitle('');
      setDue('');
    }
  }

  const row = (t: Task) => {
    const overdue = t.status !== 'done' && t.due_on && t.due_on < today;
    return (
      <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
        <button
          onClick={() => run(() => updateTask(t.id, { status: t.status === 'done' ? 'todo' : 'done' }))}
          aria-label={t.status === 'done' ? `Reopen ${t.title}` : `Complete ${t.title}`}
          className={`flex size-6 shrink-0 items-center justify-center rounded-full border ${t.status === 'done' ? 'border-success bg-success text-bg' : 'border-border hover:border-accent'}`}
        >
          {t.status === 'done' && <Check className="size-3.5" aria-hidden />}
        </button>
        <span className={`min-w-0 flex-1 text-[15px] ${t.status === 'done' ? 'text-text-faint line-through' : ''}`}>{t.title}</span>
        {t.status !== 'done' && (
          <button
            onClick={() => run(() => updateTask(t.id, { status: t.status === 'doing' ? 'todo' : 'doing' }))}
            className={`rounded-md px-2 py-0.5 text-xs ${t.status === 'doing' ? 'bg-accent/20 text-accent' : 'text-text-faint hover:text-text'}`}
          >
            {t.status === 'doing' ? 'In progress' : 'To do'}
          </button>
        )}
        <select
          aria-label={`Owner of ${t.title}`}
          value={t.assignee_member_id ?? ''}
          onChange={(e) => run(() => updateTask(t.id, { assignee_member_id: e.target.value || null }))}
          className={`max-w-32 rounded-lg border bg-surface px-2 py-1 text-xs ${t.assignee_member_id ? 'border-border text-text' : 'border-accent/60 text-accent'}`}
        >
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.is_me ? 'Me' : m.name}
            </option>
          ))}
        </select>
        {t.due_on && <span className={`tabular text-xs ${overdue ? 'text-danger' : 'text-text-faint'}`}>{fmt(t.due_on)}</span>}
        <ConfirmDelete label={`Delete ${t.title}`} onConfirm={() => run(() => removeRow('project_tasks', t.id))} />
      </li>
    );
  };

  return (
    <Panel title={`Tasks${tasks.length ? ` · ${done.length}/${tasks.length}` : ''}`}>
      <form onSubmit={add} className="mb-2 grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task" maxLength={160} aria-label="New task" />
        <Select value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Owner">
          <option value="">Owner…</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.is_me ? 'Me' : m.name}
            </option>
          ))}
        </Select>
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          aria-label="Task due date"
          className="h-11 rounded-xl border border-border bg-surface px-2 text-sm text-text-muted focus:border-accent focus:outline-none"
        />
        <Button type="submit" disabled={busy || !title.trim()} aria-label="Add task">
          <Plus className="size-4" aria-hidden />
        </Button>
      </form>
      <ul className="divide-y divide-border">{open.map(row)}</ul>
      {done.length > 0 && (
        <>
          <button className="mt-2 text-sm text-text-muted hover:text-text" onClick={() => setShowDone((v) => !v)}>
            {showDone ? 'Hide completed' : `Show completed (${done.length})`}
          </button>
          {showDone && <ul className="divide-y divide-border">{done.map(row)}</ul>}
        </>
      )}
    </Panel>
  );
}

function TeamPanel({ members, tasks, projectId, run, busy }: { members: Member[]; tasks: Task[]; projectId: string; run: Run; busy: boolean }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  async function add(e: FormEvent) {
    e.preventDefault();
    if (await run(() => addMember(projectId, name, role.trim() || null, null))) {
      setName('');
      setRole('');
    }
  }
  return (
    <Panel title="Team">
      <ul className="mb-3 divide-y divide-border">
        {members.map((m) => {
          const open = tasks.filter((t) => t.assignee_member_id === m.id && t.status !== 'done').length;
          const done = tasks.filter((t) => t.assignee_member_id === m.id && t.status === 'done').length;
          return (
            <li key={m.id} className="flex items-center gap-3 py-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-raised text-sm font-medium">
                {(m.is_me ? 'Me' : m.name).slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px]">{m.is_me ? `${m.name} (you)` : m.name}</p>
                {m.role && <p className="text-xs text-text-faint">{m.role}</p>}
              </div>
              <span className="tabular text-xs text-text-muted">
                {open} open · {done} done
              </span>
              {!m.is_me && <ConfirmDelete label={`Remove ${m.name}`} onConfirm={() => run(() => removeRow('project_members', m.id))} />}
            </li>
          );
        })}
      </ul>
      <form onSubmit={add} className="grid grid-cols-[1fr_1fr_auto] gap-2">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" maxLength={80} aria-label="Member name" />
        <TextInput value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role (optional)" maxLength={60} aria-label="Member role" />
        <Button type="submit" disabled={busy || !name.trim()} aria-label="Add member">
          <Plus className="size-4" aria-hidden />
        </Button>
      </form>
    </Panel>
  );
}

function MilestonesPanel({ milestones, projectId, run, busy, today }: { milestones: ProjectsData['milestones']; projectId: string; run: Run; busy: boolean; today: string }) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  async function add(e: FormEvent) {
    e.preventDefault();
    if (await run(() => addMilestone(projectId, title, due || null))) {
      setTitle('');
      setDue('');
    }
  }
  return (
    <Panel title="Milestones">
      <ul className="mb-3">
        {milestones.map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-1.5">
            <button
              onClick={() => run(() => setMilestoneDone(m.id, !m.done_at))}
              aria-label={m.done_at ? `Reopen ${m.title}` : `Complete ${m.title}`}
              className={`flex size-5 shrink-0 items-center justify-center rounded border ${m.done_at ? 'border-success bg-success text-bg' : 'border-border hover:border-accent'}`}
            >
              {m.done_at && <Check className="size-3" aria-hidden />}
            </button>
            <span className={`flex-1 text-[15px] ${m.done_at ? 'text-text-faint line-through' : ''}`}>{m.title}</span>
            {m.due_on && <span className={`tabular text-xs ${!m.done_at && m.due_on < today ? 'text-danger' : 'text-text-faint'}`}>{fmt(m.due_on)}</span>}
            <ConfirmDelete label={`Delete ${m.title}`} onConfirm={() => run(() => removeRow('project_milestones', m.id))} />
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex gap-2">
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
    </Panel>
  );
}

function MeetingsPanel({ data, project, run, busy, today }: { data: ProjectsData; project: Project; run: Run; busy: boolean; today: string }) {
  const meetings = data.meetings.filter((m) => m.project_id === project.id);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('Team check-in');
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState('');
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function copyAgenda() {
    const text = buildAgenda(stateOf(data, project), today);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setNotes(text);
      setAdding(true);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (await run(() => addMeeting(project.id, date, title, notes.trim() || null))) {
      setAdding(false);
      setNotes('');
    }
  }

  return (
    <Panel
      title="Meetings"
      action={
        <div className="flex gap-1">
          <Button variant="ghost" className="h-9 px-3 text-sm" onClick={copyAgenda} title="Copy an agenda built from this project's tasks">
            <ClipboardCopy className="size-4" aria-hidden /> {copied ? 'Copied' : 'Prepare agenda'}
          </Button>
          <Button variant="ghost" className="h-9 px-3 text-sm" onClick={() => setAdding((v) => !v)}>
            <Plus className="size-4" aria-hidden /> Notes
          </Button>
        </div>
      }
    >
      {copied && <p className="mb-3 text-xs text-text-faint">Agenda copied — paste it into your group chat yourself. NEXUS never sends messages for you.</p>}
      {adding && (
        <form onSubmit={save} className="mb-4 space-y-3 rounded-xl border border-border p-4">
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Field label="Title">
              <TextInput value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
            </Field>
            <Field label="Date">
              <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
          </div>
          <Field label="Notes, decisions, action items">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={10000}
              rows={6}
              className="w-full rounded-xl border border-border bg-surface p-3 text-[15px] text-text focus:border-accent focus:outline-none"
            />
          </Field>
          <Button type="submit" disabled={busy}>
            Save meeting
          </Button>
        </form>
      )}
      {meetings.length === 0 && !adding && <p className="text-[15px] text-text-muted">No meetings recorded.</p>}
      <ul className="divide-y divide-border">
        {meetings.map((m) => (
          <li key={m.id} className="py-3">
            <div className="flex items-center gap-3">
              <button className="min-w-0 flex-1 text-left" onClick={() => setExpanded(expanded === m.id ? null : m.id)} aria-expanded={expanded === m.id}>
                <p className="truncate text-[15px]">{m.title}</p>
                <p className="text-xs text-text-faint">{fmt(m.held_on)}</p>
              </button>
              <ConfirmDelete label={`Delete meeting ${m.title}`} onConfirm={() => run(() => removeRow('meetings', m.id))} />
            </div>
            {expanded === m.id && m.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-text-muted">{m.notes}</p>}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
