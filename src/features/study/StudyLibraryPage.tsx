import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { BookOpen, ChevronDown, ChevronLeft, ExternalLink, Search, Sparkles, Upload } from 'lucide-react';
import { Button, ConfirmDelete, Notice, Panel, Select, TextInput } from '../../components/ui';
import { cached } from '../../lib/offline';
import { useAuth } from '../auth/AuthProvider';
import { analyse, deleteMaterial, fetchStudy, openMaterial, searchStudy, setStudyPermission, updateMaterial, uploadMaterial, type Analysis, type Material, type StudyData, type UploadStep } from './api';

const STEP_LABEL: Record<UploadStep, string> = { reading: 'Reading text…', uploading: 'Uploading…', saving: 'Saving…', done: 'Added', error: 'Failed' };
const fmtSize = (b: number) => (b < 1024 * 1024 ? `${Math.ceil(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

export function StudyLibraryPage() {
  const { session } = useAuth();
  const [data, setData] = useState<StudyData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<{ name: string; step: UploadStep; error?: string }[]>([]);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<string[] | null>(null);

  const reload = useCallback(async () => {
    try {
      setData(await cached('study', fetchStudy));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your library.');
    }
  }, []);
  useEffect(() => {
    let active = true;
    cached('study', fetchStudy)
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e instanceof Error ? e.message : 'Could not load your library.'));
    return () => {
      active = false;
    };
  }, []);

  async function onFiles(files: FileList | null) {
    if (!files || !session || !data) return;
    const list = [...files];
    setQueue(list.map((f) => ({ name: f.name, step: 'reading' as UploadStep })));
    for (let i = 0; i < list.length; i++) {
      const setStep = (step: UploadStep, err?: string) => setQueue((qq) => qq.map((x, j) => (j === i ? { ...x, step, error: err } : x)));
      try {
        await uploadMaterial(list[i]!, session.user.id, data.courses, (s) => setStep(s));
      } catch (e) {
        setStep('error', e instanceof Error ? e.message : 'Upload failed');
      }
    }
    await reload();
  }

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return setHits(null);
    try {
      setHits(await searchStudy(q.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed.');
    }
  }

  const groups = useMemo(() => {
    if (!data) return [];
    const list = hits ? hits.map((id) => data.materials.find((m) => m.id === id)).filter((m): m is Material => Boolean(m)) : data.materials;
    const byCourse = new Map<string, Material[]>();
    for (const m of list) {
      const k = m.course_id ?? 'unsorted';
      byCourse.set(k, [...(byCourse.get(k) ?? []), m]);
    }
    const label = (k: string) => {
      if (k === 'unsorted') return 'Not linked to a course';
      const c = data.courses.find((x) => x.id === k);
      return c ? (c.code ? `${c.code} — ${c.title}` : c.title) : 'Course';
    };
    return [...byCourse.entries()].map(([k, items]) => ({ key: k, label: label(k), items })).sort((a, b) => (a.key === 'unsorted' ? 1 : b.key === 'unsorted' ? -1 : a.label.localeCompare(b.label)));
  }, [data, hits]);

  return (
    <div className="space-y-6">
      <header>
        <Link to="/life" className="mb-3 inline-flex items-center gap-1 text-sm text-text-muted hover:text-text">
          <ChevronLeft className="size-4" aria-hidden /> My Life
        </Link>
        <h1 className="text-[28px] font-semibold tracking-tight">Study Library</h1>
        <p className="mt-1 text-[15px] text-text-muted">Your lecture notes, slides and readings — organised by course, searchable, and turned into study packs.</p>
      </header>
      {error && <Notice tone="danger">{error}</Notice>}

      <Panel>
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-8 text-center hover:border-accent">
          <Upload className="size-6 text-accent" aria-hidden />
          <span className="text-[15px] font-medium">Add study materials</span>
          <span className="text-sm text-text-muted">PDF, Word, PowerPoint, .txt or .md · up to 25 MB each · several at once</span>
          <input type="file" multiple accept=".pdf,.docx,.pptx,.txt,.md" className="sr-only" onChange={(e) => void onFiles(e.target.files)} disabled={!data} />
        </label>
        {queue.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {queue.map((x, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="truncate">{x.name}</span>
                <span className={x.step === 'error' ? 'text-danger' : x.step === 'done' ? 'text-success' : 'text-text-muted'}>{x.error ?? STEP_LABEL[x.step]}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-text-faint">Text is read on your phone. Files are stored privately — only your account can open them.</p>
      </Panel>

      {data && <AiConsent data={data} onChange={reload} />}

      <form onSubmit={runSearch} className="flex gap-2">
        <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your materials (e.g. recursion base case)" aria-label="Search materials" />
        <Button type="submit" aria-label="Search">
          <Search className="size-4" aria-hidden />
        </Button>
      </form>
      {hits && (
        <p className="-mt-3 text-sm text-text-muted">
          {hits.length} result{hits.length === 1 ? '' : 's'}.{' '}
          <button className="text-accent hover:underline" onClick={() => { setHits(null); setQ(''); }}>
            Clear
          </button>
        </p>
      )}

      {data && data.materials.length === 0 && <p className="text-[15px] text-text-muted">Nothing here yet.</p>}
      {data &&
        groups.map((g) => (
          <Panel key={g.key} title={g.label}>
            <ul className="space-y-2">
              {g.items.map((m) => (
                <MaterialRow key={m.id} m={m} data={data} analysis={data.analyses.get(m.id)} onChange={reload} />
              ))}
            </ul>
          </Panel>
        ))}
    </div>
  );
}

function AiConsent({ data, onChange }: { data: StudyData; onChange: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  if (!data.aiEnabled)
    return (
      <p className="rounded-xl border border-border px-4 py-3 text-sm text-text-muted">
        Study packs use your AI assistant, which is off. Turn it on in <Link to="/intelligence" className="text-accent hover:underline">Intelligence → What AI may see</Link>.
      </p>
    );
  return (
    <label className="flex items-start gap-3 rounded-xl border border-border px-4 py-3">
      <input
        type="checkbox"
        checked={data.studyAllowed}
        disabled={busy}
        onChange={async (e) => {
          setBusy(true);
          await setStudyPermission(e.target.checked).catch(() => undefined);
          await onChange();
          setBusy(false);
        }}
        className="mt-1 size-4 accent-[var(--accent)]"
      />
      <span className="text-sm">
        <span className="block font-medium">Allow AI to read study materials</span>
        <span className="text-text-muted">Only the text of the file you choose to analyse is sent — nothing else about you.</span>
      </span>
    </label>
  );
}

function MaterialRow({ m, data, analysis, onChange }: { m: Material; data: StudyData; analysis?: Analysis; onChange: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null);
  const [topic, setTopic] = useState(m.topic ?? '');

  async function run(fn: () => Promise<string | void>) {
    setBusy(true);
    setMsg(null);
    try {
      const t = await fn();
      if (t) setMsg({ tone: 'success', text: t });
      await onChange();
    } catch (e) {
      setMsg({ tone: 'danger', text: e instanceof Error ? e.message : 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-xl border border-border">
      <button className="flex w-full items-start gap-3 p-3 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <BookOpen className="mt-0.5 size-4 shrink-0 text-text-faint" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium">{m.title}</p>
          <p className="truncate text-xs text-text-faint">
            {m.topic ?? 'No topic'} · {m.page_count ? `${m.page_count} ${m.mime.includes('presentation') ? 'slides' : 'pages'} · ` : ''}
            {fmtSize(m.size_bytes)}
            {m.status === 'no_text' && ' · no readable text (scanned?)'}
            {analysis && ' · study pack ready'}
          </p>
        </div>
        <ChevronDown className={`mt-1 size-4 shrink-0 text-text-faint transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div className="space-y-4 border-t border-border p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Select value={m.course_id ?? ''} onChange={(e) => run(() => updateMaterial(m.id, { course_id: e.target.value || null }))} aria-label="Course" disabled={busy}>
              <option value="">Not linked to a course</option>
              {data.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code ? `${c.code} — ${c.title}` : c.title}
                </option>
              ))}
            </Select>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void run(() => updateMaterial(m.id, { topic: topic.trim() || null })); }}>
              <TextInput value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={120} placeholder="Topic" aria-label="Topic" />
              <Button type="submit" variant="ghost" className="border border-border" disabled={busy}>
                Save
              </Button>
            </form>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" className="h-9 border border-border px-3 text-sm" onClick={() => run(async () => { window.open(await openMaterial(m), '_blank', 'noopener'); })} disabled={busy}>
              <ExternalLink className="size-4" aria-hidden /> Open file
            </Button>
            {m.status !== 'no_text' && data.aiEnabled && data.studyAllowed && (
              <Button className="h-9 px-3 text-sm" disabled={busy} onClick={() => run(async () => { const r = await analyse(m.id); return r.partial ? 'Study pack ready (long file: first part only).' : 'Study pack ready.'; })}>
                <Sparkles className="size-4" aria-hidden /> {busy ? 'Working…' : analysis ? 'Rebuild study pack' : 'Make study pack'}
              </Button>
            )}
            <span className="flex-1" />
            <ConfirmDelete label={`Delete ${m.title}`} onConfirm={() => run(() => deleteMaterial(m))} />
          </div>
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
          {analysis && <StudyPack a={analysis} />}
        </div>
      )}
    </li>
  );
}

export function StudyPack({ a }: { a: Analysis }) {
  const [card, setCard] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [shown, setShown] = useState<Set<number>>(new Set());
  const fc = a.flashcards[card];
  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-text-faint">Summary</h3>
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{a.summary}</p>
      </section>
      {a.key_concepts.length > 0 && (
        <section>
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-text-faint">Key concepts</h3>
          <dl className="space-y-1.5 text-sm">
            {a.key_concepts.map((k) => (
              <div key={k.term}>
                <dt className="font-medium">{k.term}</dt>
                <dd className="text-text-muted">{k.explanation}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {fc && (
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-faint">
            Flashcards · {card + 1}/{a.flashcards.length}
          </h3>
          <button
            onClick={() => setFlipped((v) => !v)}
            className="flex min-h-28 w-full items-center justify-center rounded-xl border border-border bg-surface-raised p-4 text-center text-[15px]"
            aria-label={flipped ? 'Flashcard: show question' : 'Flashcard: show answer'}
          >
            {flipped ? fc.a : fc.q}
          </button>
          <div className="mt-2 flex justify-between text-sm">
            <button disabled={card === 0} onClick={() => { setCard(card - 1); setFlipped(false); }} className="text-text-muted disabled:opacity-30">
              ← Previous
            </button>
            <span className="text-xs text-text-faint">Tap the card to flip</span>
            <button disabled={card === a.flashcards.length - 1} onClick={() => { setCard(card + 1); setFlipped(false); }} className="text-text-muted disabled:opacity-30">
              Next →
            </button>
          </div>
        </section>
      )}
      {a.questions.length > 0 && (
        <section>
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-text-faint">Practice questions</h3>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            {a.questions.map((x, i) => (
              <li key={i}>
                <p>{x.q}</p>
                {shown.has(i) ? (
                  <p className="mt-1 text-text-muted">{x.a}</p>
                ) : (
                  <button className="mt-1 text-xs text-accent hover:underline" onClick={() => setShown(new Set([...shown, i]))}>
                    Show answer
                  </button>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
      <p className="text-xs text-text-faint">Generated from this file only. Check anything important against your notes.</p>
    </div>
  );
}
