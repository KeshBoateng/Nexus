import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Circle, ExternalLink, RotateCcw } from 'lucide-react';
import { Button, Notice } from '../../components/ui';
import { sectionLabel } from '../../lib/studyText';
import { openMaterial, type Material } from './api';
import { PASS_MARK, fetchLearn, nextSection, requestLesson, saveProgress, understoodCount, type LearnData, type Lesson } from './learn';

/** Work through a file section by section: lesson → self-check → progress. */
export function LearnView({ m }: { m: Material }) {
  const [data, setData] = useState<LearnData | null>(null);
  const [current, setCurrent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await fetchLearn(m.id);
    setData(d);
    return d;
  }, [m.id]);

  useEffect(() => {
    let active = true;
    fetchLearn(m.id)
      .then((d) => {
        if (!active) return;
        setData(d);
        setCurrent(nextSection(d) ?? 1);
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : 'Could not load sections.'));
    return () => {
      active = false;
    };
  }, [m.id]);

  const lesson = current ? data?.lessons.get(current) : undefined;

  const generate = useCallback(
    async (section: number) => {
      setError(null);
      setStatus('Preparing this lesson…');
      try {
        await requestLesson(m.id, section, (w) => setStatus(w > 0 ? `AI limit reached — continuing in ${w}s (keep this page open)` : 'Preparing this lesson…'));
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not prepare the lesson.');
      } finally {
        setStatus(null);
      }
    },
    [m.id, load],
  );

  if (error && !data) return <Notice tone="danger">{error}</Notice>;
  if (!data) return <p className="text-sm text-text-muted">Loading sections…</p>;
  if (data.sections.length === 0) return <p className="text-sm text-text-muted">No readable text in this file.</p>;

  const done = understoodCount(data);
  const total = data.sections.length;
  const pct = Math.floor((done * 100) / total);
  const next = nextSection(data);
  const sec = current ? data.sections[current - 1] : undefined;

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex items-baseline justify-between text-sm">
          <span className="font-medium">
            {done} of {total} sections understood
          </span>
          <span className="tabular text-text-muted">{pct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-raised" role="progressbar" aria-label="Sections understood" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
        {next !== null && next !== current && (
          <Button className="mt-3 h-9 px-3 text-sm" onClick={() => setCurrent(next)}>
            Continue: {sectionLabel(data.sections[next - 1]!)}
          </Button>
        )}
        {next === null && <p className="mt-2 text-sm text-success">You’ve worked through every section. Revisit any marked for review before exams.</p>}
      </div>

      <details className="rounded-xl border border-border">
        <summary className="cursor-pointer px-3 py-2 text-sm text-text-muted">All sections</summary>
        <ul className="max-h-64 divide-y divide-border overflow-y-auto">
          {data.sections.map((s) => {
            const p = data.progress.get(s.index);
            return (
              <li key={s.index}>
                <button className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${s.index === current ? 'bg-surface-raised' : ''}`} onClick={() => setCurrent(s.index)}>
                  {p?.status === 'understood' ? (
                    <CheckCircle2 className="size-4 shrink-0 text-success" aria-label="understood" />
                  ) : p?.status === 'review' ? (
                    <RotateCcw className="size-4 shrink-0 text-accent" aria-label="needs review" />
                  ) : (
                    <Circle className="size-4 shrink-0 text-text-faint" aria-label="not started" />
                  )}
                  <span className="flex-1">{sectionLabel(s)}</span>
                  {p?.score !== null && p?.score !== undefined && <span className="tabular text-xs text-text-faint">{p.score}%</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </details>

      {sec && (
        <section className="rounded-xl border border-border p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-text-muted">{sectionLabel(sec)}</p>
            {m.mime === 'application/pdf' && sec.fromPage && (
              <button
                className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text"
                onClick={async () => window.open(`${await openMaterial(m)}#page=${sec.fromPage}`, '_blank', 'noopener')}
              >
                Open PDF at page {sec.fromPage} <ExternalLink className="size-3" aria-hidden />
              </button>
            )}
          </div>
          {lesson ? (
            <LessonBody key={`${current}-${lesson.content.title}`} lesson={lesson} onDone={async (got, total) => {
              const r = await saveProgress(m.id, current!, got, total, data.progress.get(current!));
              const d = await load();
              return { ...r, next: nextSection(d) };
            }} onNext={(n) => setCurrent(n)} />
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-text-muted">This section hasn’t been taught yet. NEXUS will explain it from your file, then check your understanding.</p>
              <Button className="h-9 px-3 text-sm" disabled={Boolean(status)} onClick={() => current && void generate(current)}>
                {status ?? 'Teach me this section'}
              </Button>
            </div>
          )}
          {error && <Notice tone="danger">{error}</Notice>}
        </section>
      )}
    </div>
  );
}

function LessonBody({
  lesson,
  onDone,
  onNext,
}: {
  lesson: Lesson;
  onDone: (got: number, total: number) => Promise<{ score: number; status: string; next: number | null }>;
  onNext: (n: number) => void;
}) {
  const c = lesson.content;
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [marks, setMarks] = useState<Map<number, boolean>>(new Map());
  const [result, setResult] = useState<{ score: number; status: string; next: number | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const allMarked = c.check_questions.length > 0 && marks.size === c.check_questions.length;

  return (
    <div className="space-y-4">
      <h3 className="text-[17px] font-semibold tracking-tight">{c.title}</h3>
      <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{c.explanation}</p>
      {c.key_terms.length > 0 && (
        <dl className="space-y-1.5 rounded-lg bg-surface-raised p-3 text-sm">
          {c.key_terms.map((k) => (
            <div key={k.term}>
              <dt className="font-medium">{k.term}</dt>
              <dd className="text-text-muted">{k.meaning}</dd>
            </div>
          ))}
        </dl>
      )}
      {c.examples.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-faint">Examples from your file</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {c.examples.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {c.check_questions.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-faint">Check your understanding</p>
          <ol className="space-y-3">
            {c.check_questions.map((q, i) => (
              <li key={i} className="rounded-lg border border-border p-3 text-sm">
                <p>
                  {i + 1}. {q.q}
                </p>
                {revealed.has(i) ? (
                  <>
                    <p className="mt-1 text-text-muted">{q.a}</p>
                    <div className="mt-2 flex gap-2" role="group" aria-label={`Did you get question ${i + 1}?`}>
                      {[
                        [true, 'I got it'],
                        [false, 'Not sure'],
                      ].map(([v, label]) => (
                        <button
                          key={String(v)}
                          aria-pressed={marks.get(i) === v}
                          onClick={() => setMarks(new Map(marks).set(i, v as boolean))}
                          className={`rounded-lg px-2.5 py-1 text-xs ${marks.get(i) === v ? 'bg-accent text-on-accent' : 'border border-border text-text-muted'}`}
                        >
                          {label as string}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <button className="mt-1 text-xs text-accent hover:underline" onClick={() => setRevealed(new Set(revealed).add(i))}>
                    Answer it in your head, then show answer
                  </button>
                )}
              </li>
            ))}
          </ol>
          {result ? (
            <div className="mt-3 space-y-2">
              <Notice tone={result.status === 'understood' ? 'success' : 'muted'}>
                {result.score}% — {result.status === 'understood' ? 'marked understood.' : `marked for review (pass mark ${PASS_MARK}%). Re-read the section or open the PDF pages, then try again later.`}
              </Notice>
              {result.next !== null && (
                <Button className="h-9 px-3 text-sm" onClick={() => onNext(result.next!)}>
                  Next section
                </Button>
              )}
            </div>
          ) : (
            <Button
              className="mt-3 h-9 px-3 text-sm"
              disabled={!allMarked || saving}
              onClick={async () => {
                setSaving(true);
                setResult(await onDone([...marks.values()].filter(Boolean).length, c.check_questions.length));
                setSaving(false);
              }}
            >
              {allMarked ? 'Record my result' : `Answer all ${c.check_questions.length} to record your result`}
            </Button>
          )}
        </div>
      )}
      <p className="text-xs text-text-faint">Taught only from this section of your file. Check anything important against your notes.</p>
    </div>
  );
}
