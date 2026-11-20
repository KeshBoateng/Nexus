import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { BookOpen, ChevronLeft, Check, Pencil, Plus } from 'lucide-react';
import { cached } from '../../lib/offline';
import { todayIn } from '../../lib/dates';
import { COURSE_STATUS_LABEL, TERM_STATUS_LABEL, courseStatus, courseStudy, currentTerm, studyLine, termStatus, type CourseStatus, type CourseStudy, type TermStatus } from '../../lib/courseStatus';
import { Button, ConfirmDelete, Field, Notice, Panel, Select, TextInput } from '../../components/ui';
import { useRunner, type Run } from '../../lib/useRunner';
import { computeGpa, formatGpa, resolveGrade, validateBands } from '../../lib/gpa';
import { describeDue, isoToLocalInput, localInputToIso } from '../../lib/dates';
import { courseProgress, progressLine, projectedGpa, requiredBand, type CourseProgress, type Standing } from '../../lib/target';
import { useProfile } from '../profile/ProfileProvider';
import {
  ASSESSMENT_KINDS,
  fetchCourseStudyRows,
  remove,
  saveAssessment,
  saveBand,
  saveCourse,
  saveMarks,
  saveTerm,
  setAssessmentDone,
  type AcademicsData,
  type Assessment,
  type Band,
  type Course,
  type Term,
} from './api';
import { useAcademics } from './useAcademics';



const numOrNull = (v: string): number | null => (v.trim() === '' ? null : Number(v));

export function AcademicsPage() {
  const { data, error, reload } = useAcademics();
  const { run, error: actionError, busy } = useRunner(reload);

  return (
    <div className="space-y-6">
      <header>
        <Link to="/life" className="mb-3 inline-flex items-center gap-1 text-sm text-text-muted hover:text-text">
          <ChevronLeft className="size-4" aria-hidden /> My Life
        </Link>
        <h1 className="text-[28px] font-semibold tracking-tight">Academics</h1>
      </header>

      {error && <Notice tone="danger">{error}</Notice>}
      {actionError && <Notice tone="danger">{actionError}</Notice>}
      {!data && !error && <p className="text-text-muted">Loading…</p>}
      {data && <Content data={data} run={run} busy={busy} />}
    </div>
  );
}

/** Study Library files + Learn progress per course; empty if the library can't be read (offline etc.). */
function useCourseStudy(): Map<string, CourseStudy> {
  const [study, setStudy] = useState<Map<string, CourseStudy>>(new Map());
  useEffect(() => {
    let active = true;
    cached('course-study', fetchCourseStudyRows)
      .then((r) => active && setStudy(courseStudy(r.materials, r.progress, r.lessons)))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return study;
}

const STATUS_TONE: Record<CourseStatus | TermStatus, string> = {
  completed: 'bg-success/15 text-success',
  taking: 'bg-accent/15 text-accent',
  current: 'bg-accent/15 text-accent',
  awaiting: 'border border-dashed border-text-faint text-text-muted',
  upcoming: 'bg-surface-raised text-text-muted',
  empty: 'bg-surface-raised text-text-faint',
};

function StatusBadge({ status, label }: { status: CourseStatus | TermStatus; label: string }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[status]}`}>{label}</span>;
}

function Content({ data, run, busy }: { data: AcademicsData; run: Run; busy: boolean }) {
  const { profile } = useProfile();
  const today = todayIn(profile?.timezone ?? 'Africa/Accra');
  const study = useCourseStudy();
  const term = currentTerm(data.terms, today);
  const past = data.terms.filter((t) => t.id !== term?.id);

  if (!term) {
    return (
      <Panel title="Start this semester">
        <p className="mb-4 text-[15px] text-text-muted">
          NEXUS tracks the semester you’re in now. Add your courses, then marks as you get them back, and it shows whether you’re on course for your target GPA.
        </p>
        <TermForm run={run} busy={busy} onDone={() => undefined} />
      </Panel>
    );
  }

  return (
    <>
      <SemesterPanel term={term} data={data} run={run} busy={busy} today={today} study={study} />
      <Deadlines data={data} courses={data.courses.filter((c) => c.term_id === term.id)} run={run} busy={busy} />

      {past.length > 0 && (
        <details className="rounded-2xl border border-border bg-surface px-4 py-3">
          <summary className="cursor-pointer text-[15px] font-medium">Other semesters ({past.length})</summary>
          <div className="mt-3 space-y-4">
            {past.map((t) => (
              <SemesterPanel key={t.id} term={t} data={data} run={run} busy={busy} today={today} study={study} compact />
            ))}
          </div>
        </details>
      )}

      <AddTerm run={run} busy={busy} />
      <ScalePanel bands={data.bands} run={run} busy={busy} />
    </>
  );
}

function Stat({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3">
      <p className="text-xs text-text-faint">{label}</p>
      <p className={`tabular mt-1 font-semibold tracking-tight ${emphasis ? 'text-[26px] text-accent' : 'text-[22px]'}`}>{value}</p>
    </div>
  );
}

const STANDING_TONE: Record<Standing, string> = {
  final: 'text-text-muted',
  no_data: 'text-text-muted',
  on_track: 'text-success',
  behind: 'text-accent',
  out_of_reach: 'text-danger',
};

// ---------------------------------------------------------------------------
// Deadlines and marks
// ---------------------------------------------------------------------------

function Deadlines({ data, courses, run, busy }: { data: AcademicsData; courses: Course[]; run: Run; busy: boolean }) {
  const { profile } = useProfile();
  const tz = profile?.timezone ?? 'Africa/Accra';
  const [showDone, setShowDone] = useState(false);
  const [adding, setAdding] = useState(false);
  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);

  const mine = data.assessments.filter((a) => courseById.has(a.course_id));
  const open = mine.filter((a) => !a.completed_at);
  const done = mine.filter((a) => a.completed_at);
  const list = showDone ? done : open;

  return (
    <Panel
      title="Deadlines & marks"
      action={
        courses.length > 0 && (
          <Button variant="ghost" className="h-9 px-3 text-sm" onClick={() => setAdding((v) => !v)}>
            <Plus className="size-4" aria-hidden /> Add
          </Button>
        )
      }
    >
      {adding && <AssessmentForm courses={courses} run={run} busy={busy} onDone={() => setAdding(false)} />}
      {courses.length === 0 && <p className="text-[15px] text-text-muted">Add your courses first.</p>}
      {courses.length > 0 && list.length === 0 && !adding && (
        <p className="text-[15px] text-text-muted">
          {showDone ? 'Nothing completed yet.' : 'Nothing due. Add assignments, quizzes, midsems and exams, with how much each is worth, as you hear about them.'}
        </p>
      )}
      <ul className="divide-y divide-border">
        {list.map((a) => (
          <AssessmentRow key={a.id} a={a} course={courseById.get(a.course_id)} tz={tz} run={run} busy={busy} />
        ))}
      </ul>
      {done.length > 0 && (
        <button className="mt-3 text-sm text-text-muted hover:text-text" onClick={() => setShowDone((v) => !v)}>
          {showDone ? 'Show open' : `Show completed (${done.length})`}
        </button>
      )}
    </Panel>
  );
}

function AssessmentRow({ a, course, tz, run, busy }: { a: Assessment; course?: Course; tz: string; run: Run; busy: boolean }) {
  const due = a.due_at ? describeDue(a.due_at, new Date(), tz) : null;
  const done = Boolean(a.completed_at);
  const [marking, setMarking] = useState(false);
  const hasMark = a.score !== null && a.max_score !== null;
  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <button
          onClick={() => run(() => setAssessmentDone(a.id, !done))}
          aria-label={done ? `Mark ${a.title} not done` : `Mark ${a.title} done`}
          className={`flex size-6 shrink-0 items-center justify-center rounded-full border ${
            done ? 'border-success bg-success text-bg' : 'border-border hover:border-accent'
          }`}
        >
          {done && <Check className="size-3.5" aria-hidden />}
        </button>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-[15px] ${done && !hasMark ? 'text-text-faint line-through' : ''}`}>{a.title}</p>
          <p className="text-xs text-text-faint">
            {course?.code ?? course?.title ?? 'Course'} · {a.kind}
            {a.weight !== null && ` · worth ${a.weight}%`}
            {hasMark && (
              <span className="text-text-muted">
                {' '}
                · got {a.score}/{a.max_score}
              </span>
            )}
          </p>
        </div>
        {due && !done && (
          <span className={`shrink-0 text-xs tabular ${due.overdue ? 'text-danger' : due.soon ? 'text-accent' : 'text-text-muted'}`}>{due.text}</span>
        )}
        <button className="shrink-0 rounded-lg px-2 py-1 text-xs text-accent hover:bg-surface-raised" onClick={() => setMarking((v) => !v)}>
          {hasMark ? 'Edit mark' : 'Add mark'}
        </button>
        <ConfirmDelete label={`Delete ${a.title}`} onConfirm={() => run(() => remove('assessments', a.id))} />
      </div>
      {marking && <MarkForm a={a} run={run} busy={busy} onDone={() => setMarking(false)} />}
    </li>
  );
}

function MarkForm({ a, run, busy, onDone }: { a: Assessment; run: Run; busy: boolean; onDone: () => void }) {
  const [score, setScore] = useState(a.score?.toString() ?? '');
  const [max, setMax] = useState(a.max_score?.toString() ?? '');
  const [weight, setWeight] = useState(a.weight?.toString() ?? '');
  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await run(() => saveMarks(a.id, { score: numOrNull(score), max_score: numOrNull(max), weight: numOrNull(weight) }, Boolean(a.completed_at)));
    if (ok) onDone();
  }
  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-xl border border-border p-3">
      <div className="grid grid-cols-3 gap-3">
        <Field label="You got">
          <TextInput type="number" min={0} step={0.01} value={score} onChange={(e) => setScore(e.target.value)} />
        </Field>
        <Field label="Out of">
          <TextInput type="number" min={0.01} step={0.01} value={max} onChange={(e) => setMax(e.target.value)} />
        </Field>
        <Field label="Worth (% of course)">
          <TextInput type="number" min={0} max={100} step={0.01} value={weight} onChange={(e) => setWeight(e.target.value)} />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>Save</Button>
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

function AssessmentForm({ courses, run, busy, onDone }: { courses: Course[]; run: Run; busy: boolean; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '');
  const [kind, setKind] = useState<(typeof ASSESSMENT_KINDS)[number]>('assignment');
  const [due, setDue] = useState(isoToLocalInput(null));
  const [weight, setWeight] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await run(() => saveAssessment({ title, course_id: courseId, kind, due_at: localInputToIso(due), weight: numOrNull(weight) }));
    if (ok) onDone();
  }

  return (
    <form onSubmit={submit} className="mb-4 space-y-3 rounded-xl border border-border p-4">
      <Field label="What is it?">
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} placeholder="e.g. Midsem exam" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Course">
          <Select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code ? `${c.code} — ${c.title}` : c.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Type">
          <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            {ASSESSMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Due">
          <TextInput type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Worth (% of course)" hint="e.g. midsem 30, final exam 60. Optional.">
          <TextInput type="number" min={0} max={100} step={0.01} value={weight} onChange={(e) => setWeight(e.target.value)} />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>Save</Button>
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// The semester: target, projection, courses
// ---------------------------------------------------------------------------

function SemesterPanel({
  term,
  data,
  run,
  busy,
  today,
  study,
  compact,
}: {
  term: Term;
  data: AcademicsData;
  run: Run;
  busy: boolean;
  today: string;
  study: Map<string, CourseStudy>;
  compact?: boolean;
}) {
  const courses = data.courses.filter((c) => c.term_id === term.id);
  const band = requiredBand(term.target_gpa, data.bands);
  const rows = courses.map((c) => ({
    ...c,
    status: courseStatus(c, term, today),
    progress: courseProgress(
      c,
      data.assessments.filter((a) => a.course_id === c.id),
      band?.min_mark ?? 0,
    ),
  }));
  const finalGpa = computeGpa(courses, data.bands).gpa;
  const projected = projectedGpa(rows, data.bands);
  const onTrack = rows.filter((r) => r.progress.standing === 'on_track' || (r.progress.standing === 'final' && (r.final_mark ?? 0) >= (band?.min_mark ?? 0))).length;
  const graded = rows.filter((r) => r.progress.standing !== 'no_data').length;
  const tStatus = termStatus(rows.map((r) => r.status), term, today);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);

  return (
    <div className="space-y-4">
      {!compact && (
        <section className="grid grid-cols-3 gap-3">
          <Stat label="Target GPA" value={term.target_gpa.toFixed(2)} emphasis />
          <Stat label={tStatus === 'completed' ? 'Semester GPA' : 'Projected GPA'} value={formatGpa(tStatus === 'completed' ? finalGpa : projected)} />
          <Stat label="Courses on track" value={graded ? `${onTrack}/${courses.length}` : '—'} />
        </section>
      )}
      <Panel
        title={renaming ? undefined : term.name}
        action={
          !renaming && (
            <div className="flex items-center gap-2">
              <StatusBadge status={tStatus} label={TERM_STATUS_LABEL[tStatus]} />
              <button className="rounded-lg p-1.5 text-text-faint hover:text-text" onClick={() => setRenaming(true)} aria-label={`Edit ${term.name}`}>
                <Pencil className="size-4" aria-hidden />
              </button>
              <ConfirmDelete label={`Delete ${term.name} and its courses`} onConfirm={() => run(() => remove('academic_terms', term.id))} />
            </div>
          )
        }
      >
        {renaming && <TermForm term={term} run={run} busy={busy} onDone={() => setRenaming(false)} />}

        {!renaming && band && (
          <p className="mb-3 text-sm text-text-muted">
            {compact && finalGpa !== null ? `GPA ${formatGpa(finalGpa)} · ` : ''}
            Target {term.target_gpa.toFixed(2)} means aiming for <span className="font-medium text-text">{band.letter} ({band.min_mark}+)</span> in every course.
            {!compact && graded === 0 && courses.length > 0 && ' Record marks on Deadlines as you get them back and the projection fills in.'}
          </p>
        )}

        {courses.length === 0 && !adding && <p className="mb-3 text-[15px] text-text-muted">Add the courses you’re taking this semester.</p>}

        <div className="-mx-1 mb-3 space-y-1">
          {rows.map((r) =>
            editingId === r.id ? (
              <CourseForm key={r.id} termId={term.id} course={r} bands={data.bands} run={run} busy={busy} onDone={() => setEditingId(null)} />
            ) : (
              <CourseRow key={r.id} c={r} bands={data.bands} status={r.status} progress={r.progress} band={band} study={study.get(r.id)} onEdit={() => setEditingId(r.id)} run={run} />
            ),
          )}
        </div>

        {adding ? (
          <CourseForm termId={term.id} bands={data.bands} run={run} busy={busy} onDone={() => setAdding(false)} />
        ) : (
          <Button variant="ghost" className="h-9 px-3 text-sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden /> Add course
          </Button>
        )}
      </Panel>
    </div>
  );
}

function CourseRow({
  c,
  bands,
  status,
  progress,
  band,
  study,
  onEdit,
  run,
}: {
  c: Course;
  bands: Band[];
  status: CourseStatus;
  progress: CourseProgress;
  band: Band | null;
  study?: CourseStudy;
  onEdit: () => void;
  run: Run;
}) {
  const grade = resolveGrade(c, bands);
  return (
    <div className="flex items-start gap-3 rounded-lg px-1 py-2 text-[15px] hover:bg-surface-raised">
      <div className="min-w-0 flex-1">
        <p className="truncate">{c.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <StatusBadge status={status} label={COURSE_STATUS_LABEL[status]} />
          <span className="text-xs text-text-faint">
            {c.code ? `${c.code} · ` : ''}
            {c.credit_hours} credit{c.credit_hours === 1 ? '' : 's'}
          </span>
        </div>
        <p className={`mt-1 text-xs ${STANDING_TONE[progress.standing]}`}>
          {progress.standing === 'final' ? `Final: ${c.final_mark ?? c.final_letter}${grade ? ` → ${grade.letter}` : ''}` : progressLine(progress, band)}
        </p>
        <Link to={`/life/study?course=${c.id}`} className="mt-1 inline-flex items-center gap-1 text-xs text-text-muted hover:text-accent">
          <BookOpen className="size-3" aria-hidden />
          {studyLine(study)}
        </Link>
      </div>
      <span className="flex shrink-0">
        <button className="rounded-lg p-1.5 text-text-faint hover:text-text" onClick={onEdit} aria-label={`Edit ${c.title}`}>
          <Pencil className="size-4" aria-hidden />
        </button>
        <ConfirmDelete label={`Delete ${c.title}`} onConfirm={() => run(() => remove('courses', c.id))} />
      </span>
    </div>
  );
}

function CourseForm({
  termId,
  course,
  bands,
  run,
  busy,
  onDone,
}: {
  termId: string;
  course?: Course;
  bands: Band[];
  run: Run;
  busy: boolean;
  onDone: () => void;
}) {
  const [code, setCode] = useState(course?.code ?? '');
  const [title, setTitle] = useState(course?.title ?? '');
  const [credits, setCredits] = useState(String(course?.credit_hours ?? 3));
  const [mark, setMark] = useState(course?.final_mark?.toString() ?? '');
  const [letter, setLetter] = useState(course?.final_letter ?? '');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await run(() =>
      saveCourse(
        {
          term_id: termId,
          code: code.trim() || null,
          title,
          credit_hours: Number(credits),
          final_mark: numOrNull(mark),
          final_letter: mark.trim() ? null : letter || null,
        },
        course?.id,
      ),
    );
    if (ok) onDone();
  }

  return (
    <form onSubmit={submit} className="my-2 space-y-3 rounded-xl border border-border p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
        <Field label="Code">
          <TextInput value={code} onChange={(e) => setCode(e.target.value)} maxLength={20} placeholder="DCIT 201" />
        </Field>
        <Field label="Title">
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
        </Field>
        <Field label="Credits">
          <TextInput type="number" min={1} max={12} step={1} value={credits} onChange={(e) => setCredits(e.target.value)} required />
        </Field>
      </div>
      {course && (
        <details open={Boolean(course.final_mark !== null || course.final_letter)}>
          <summary className="cursor-pointer text-sm text-text-muted">Final result (when it’s out)</summary>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Final mark">
              <TextInput type="number" min={0} max={100} step={0.01} value={mark} onChange={(e) => setMark(e.target.value)} />
            </Field>
            <Field label="…or grade">
              <Select value={mark.trim() ? '' : letter} onChange={(e) => setLetter(e.target.value)} disabled={Boolean(mark.trim())}>
                <option value="">—</option>
                {bands.map((b) => (
                  <option key={b.id} value={b.letter}>
                    {b.letter}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </details>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>Save</Button>
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

function TermForm({ term, run, busy, onDone }: { term?: Term; run: Run; busy: boolean; onDone: () => void }) {
  const [name, setName] = useState(term?.name ?? '');
  const [start, setStart] = useState(term?.starts_on ?? '');
  const [end, setEnd] = useState(term?.ends_on ?? '');
  const [target, setTarget] = useState(String(term?.target_gpa ?? 4));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await run(() => saveTerm({ name, starts_on: start || null, ends_on: end || null, target_gpa: Number(target) }, term?.id));
    if (ok) onDone();
  }

  return (
    <form onSubmit={submit} className="mb-3 space-y-3">
      <Field label="Semester">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder="Level 200 · Semester 1" />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Starts">
          <TextInput type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Ends">
          <TextInput type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
        <Field label="Target GPA">
          <TextInput type="number" min={0} max={4} step={0.01} value={target} onChange={(e) => setTarget(e.target.value)} required />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>Save</Button>
        {term && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

function AddTerm({ run, busy }: { run: Run; busy: boolean }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button variant="ghost" className="border border-border" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden /> Start next semester
      </Button>
    );
  }
  return (
    <Panel title="Next semester">
      <TermForm run={run} busy={busy} onDone={() => setOpen(false)} />
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Grading scale
// ---------------------------------------------------------------------------

function ScalePanel({ bands, run, busy }: { bands: Band[]; run: Run; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const issues = validateBands(bands);
  return (
    <Panel
      title="Grading scale"
      action={
        <button className="text-sm text-text-muted hover:text-text" onClick={() => setOpen((v) => !v)}>
          {open ? 'Close' : 'View / edit'}
        </button>
      }
    >
      {issues.length > 0 && (
        <div className="mb-3">
          {issues.map((i) => (
            <Notice key={i} tone="danger">{i}</Notice>
          ))}
        </div>
      )}
      {open ? (
        <div className="space-y-1">
          <div className="grid grid-cols-4 gap-2 pb-1 text-xs text-text-faint">
            <span>Grade</span>
            <span>From</span>
            <span>To</span>
            <span>Points</span>
          </div>
          {bands.map((b) => (
            <BandRow key={b.id} band={b} run={run} busy={busy} />
          ))}
        </div>
      ) : (
        <p className="tabular text-sm text-text-muted">
          {bands.map((b) => `${b.letter} ${b.points.toFixed(1)}`).join(' · ')}
        </p>
      )}
    </Panel>
  );
}

function BandRow({ band, run, busy }: { band: Band; run: Run; busy: boolean }) {
  const [min, setMin] = useState(String(band.min_mark));
  const [max, setMax] = useState(String(band.max_mark));
  const [pts, setPts] = useState(String(band.points));
  const dirty = Number(min) !== band.min_mark || Number(max) !== band.max_mark || Number(pts) !== band.points;
  const cell = (v: string, set: (s: string) => void, label: string, step: string, maxV: number): ReactNode => (
    <input
      aria-label={`${band.letter} ${label}`}
      type="number"
      min={0}
      max={maxV}
      step={step}
      value={v}
      onChange={(e) => set(e.target.value)}
      className="tabular h-9 w-full rounded-lg border border-border bg-surface px-2 text-[15px] focus:border-accent focus:outline-none"
    />
  );
  return (
    <div className="grid grid-cols-4 items-center gap-2">
      <span className="font-semibold">{band.letter}</span>
      {cell(min, setMin, 'from', '0.01', 100)}
      {cell(max, setMax, 'to', '0.01', 100)}
      <div className="flex items-center gap-1">
        {cell(pts, setPts, 'points', '0.01', 4)}
        {dirty && (
          <button
            disabled={busy}
            onClick={() =>
              run(() => saveBand(band.id, { letter: band.letter, min_mark: Number(min), max_mark: Number(max), points: Number(pts) }))
            }
            className="rounded-lg p-1.5 text-accent hover:bg-surface-raised"
            aria-label={`Save ${band.letter}`}
          >
            <Check className="size-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
