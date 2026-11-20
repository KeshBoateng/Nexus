import { useState, type FormEvent } from 'react';
import { ChevronDown, ExternalLink, Plus } from 'lucide-react';
import { Button, ConfirmDelete, Field, Notice, Panel, Select, TextInput } from '../../components/ui';
import { CATALOG, SUGGESTED_SKILLS, VERIFIED_ON, learningPlan, type Track } from '../../lib/catalog';
import { LEVEL_LABEL, estimateLevel } from '../../lib/proficiency';
import { todayIn } from '../../lib/dates';
import { useRunner, type Run } from '../../lib/useRunner';
import { useProfile } from '../profile/ProfileProvider';
import {
  EVIDENCE_KINDS,
  addEvidence,
  addResource,
  addSkill,
  removeRow,
  setProgress,
  setTarget,
  useDev,
  type DevData,
  type Progress,
  type Skill,
} from './api';

const TRACKS: { id: Track; label: string; blurb: string }[] = [
  { id: 'technical', label: 'Technical', blurb: 'Engineering, security, AI, architecture' },
  { id: 'leadership', label: 'Leadership', blurb: 'Leading teams, communication, decisions' },
  { id: 'entrepreneurship', label: 'Business', blurb: 'Building and running a business' },
];

const STRENGTH_LABEL = ['', 'With help', 'Independently', 'Led / taught / real stakes'];

export function DevelopmentPage() {
  const { data, error, reload } = useDev();
  const { run, error: actionError, busy } = useRunner(reload);
  const [track, setTrack] = useState<Track>('technical');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[28px] font-semibold tracking-tight">Development</h1>
        <p className="mt-1 text-[15px] text-text-muted">Skills measured by what you have actually done — not lessons ticked off.</p>
      </header>
      <div className="flex gap-1 rounded-xl border border-border p-1" role="tablist">
        {TRACKS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={track === t.id}
            onClick={() => setTrack(t.id)}
            className={`h-9 flex-1 rounded-lg text-sm font-medium ${track === t.id ? 'bg-surface-raised text-text' : 'text-text-muted hover:text-text'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
      {actionError && <Notice tone="danger">{actionError}</Notice>}
      {!data && !error && <p className="text-text-muted">Loading…</p>}
      {data && <TrackView key={track} track={track} data={data} run={run} busy={busy} />}
    </div>
  );
}

function TrackView({ track, data, run, busy }: { track: Track; data: DevData; run: Run; busy: boolean }) {
  const skills = data.skills.filter((s) => s.track === track);
  const [adding, setAdding] = useState(skills.length === 0);
  return (
    <>
      <Panel
        title={TRACKS.find((t) => t.id === track)!.blurb}
        action={
          <Button variant="ghost" className="h-9 px-3 text-sm" onClick={() => setAdding((v) => !v)}>
            <Plus className="size-4" aria-hidden /> Skill
          </Button>
        }
      >
        {adding && <AddSkill track={track} existing={skills.map((s) => s.name)} run={run} busy={busy} onDone={() => setAdding(false)} />}
        {skills.length === 0 && !adding && <p className="text-[15px] text-text-muted">No skills in this track yet.</p>}
        <ul className="space-y-3">
          {skills.map((s) => (
            <SkillCard key={s.id} skill={s} data={data} run={run} busy={busy} />
          ))}
        </ul>
      </Panel>
      <OwnResources track={track} data={data} run={run} busy={busy} />
      <p className="text-xs text-text-faint">
        Built-in resources were checked to be live on {VERIFIED_ON}. Links you add yourself are labelled “not verified by NEXUS”.
      </p>
    </>
  );
}

function AddSkill({ track, existing, run, busy, onDone }: { track: Track; existing: string[]; run: Run; busy: boolean; onDone: () => void }) {
  const [custom, setCustom] = useState('');
  const [target, setTargetLevel] = useState('3');
  const suggestions = SUGGESTED_SKILLS[track].filter((s) => !existing.includes(s));
  return (
    <div className="mb-4 space-y-3 rounded-xl border border-border p-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-text-muted">Target level</span>
        <Select value={target} onChange={(e) => setTargetLevel(e.target.value)} aria-label="Target level">
          {[1, 2, 3, 4].map((l) => (
            <option key={l} value={l}>
              {LEVEL_LABEL[l]}
            </option>
          ))}
        </Select>
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              disabled={busy}
              onClick={() => run(() => addSkill(track, s, Number(target)))}
              className="rounded-full border border-border px-3 py-1 text-sm text-text-muted hover:border-accent hover:text-text"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => addSkill(track, custom, Number(target)))) {
            setCustom('');
            onDone();
          }
        }}
      >
        <TextInput value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Or name your own skill" maxLength={80} aria-label="Custom skill" />
        <Button type="submit" disabled={busy || !custom.trim()}>
          Add
        </Button>
      </form>
    </div>
  );
}

function SkillCard({ skill, data, run, busy }: { skill: Skill; data: DevData; run: Run; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const evidence = data.evidence.filter((e) => e.skill_id === skill.id);
  const est = estimateLevel(evidence);
  const progressByKey = new Map(data.progress.map((p) => [p.resource_key, p]));
  const done = new Set(data.progress.filter((p) => p.status === 'completed').map((p) => p.resource_key.replace(/^catalog:/, '')));
  const plan = learningPlan(skill.name, est.level, done);
  const finished = CATALOG.filter((r) => r.skills.includes(skill.name) && done.has(r.id));
  const own = data.resources.filter((r) => r.skill_id === skill.id);

  return (
    <li className="rounded-xl border border-border">
      <button className="flex w-full items-center gap-3 p-4 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium">{skill.name}</p>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex flex-1 gap-1" aria-label={`Estimated ${LEVEL_LABEL[est.level]}, target ${LEVEL_LABEL[skill.target_level]}`}>
              {[1, 2, 3, 4].map((l) => (
                <span
                  key={l}
                  className={`h-1.5 flex-1 rounded-full ${l <= est.level ? 'bg-accent' : l <= skill.target_level ? 'bg-surface-raised ring-1 ring-inset ring-border' : 'bg-surface-raised opacity-40'}`}
                />
              ))}
            </div>
            <span className="shrink-0 text-xs text-text-muted">
              {LEVEL_LABEL[est.level]} → {LEVEL_LABEL[skill.target_level]}
            </span>
          </div>
          <p className="mt-1 text-xs text-text-faint">
            {evidence.length} piece{evidence.length === 1 ? '' : 's'} of evidence
          </p>
        </div>
        <ChevronDown className={`size-4 shrink-0 text-text-faint transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open && (
        <div className="space-y-5 border-t border-border px-4 pb-4 pt-3">
          {est.next && <p className="text-sm text-text-muted">{est.next}</p>}

          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-faint">Evidence</h3>
            <ul className="mb-2 space-y-1.5">
              {evidence.map((e) => (
                <li key={e.id} className="flex items-start gap-2 text-sm">
                  <span className="min-w-0 flex-1">
                    {e.description}
                    <span className="block text-xs text-text-faint">
                      {e.kind} · {STRENGTH_LABEL[e.strength]} · {e.occurred_on}
                      {e.link && (
                        <>
                          {' · '}
                          <a href={e.link} target="_blank" rel="noopener noreferrer" className="underline">
                            link
                          </a>
                        </>
                      )}
                    </span>
                  </span>
                  <ConfirmDelete label="Delete evidence" onConfirm={() => run(() => removeRow('skill_evidence', e.id))} />
                </li>
              ))}
            </ul>
            <EvidenceForm skillId={skill.id} run={run} busy={busy} />
          </section>

          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-faint">Learning plan{est.level >= 2 ? ' — basics skipped (you have shown them)' : ''}</h3>
            {plan.length === 0 && own.length === 0 && <p className="text-sm text-text-muted">No built-in resources match this skill. Add your own below.</p>}
            <ul className="space-y-2">
              {plan.map((r) => (
                <ResourceRow
                  key={r.id}
                  rkey={`catalog:${r.id}`}
                  title={r.title}
                  url={r.url}
                  meta={`${r.source} · ${r.format} · ${r.difficulty}`}
                  objective={r.objective}
                  exercise={r.exercise}
                  verified
                  progress={progressByKey.get(`catalog:${r.id}`)}
                  run={run}
                />
              ))}
              {own.map((r) => (
                <ResourceRow key={r.id} rkey={`user:${r.id}`} title={r.title} url={r.url} meta={`${r.kind} · ${r.difficulty}`} objective={r.objective} progress={progressByKey.get(`user:${r.id}`)} run={run} />
              ))}
            </ul>
            {finished.length > 0 && <p className="mt-2 text-xs text-text-faint">Completed: {finished.map((r) => r.title).join(', ')}</p>}
          </section>

          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm text-text-muted">
              Target
              <select
                value={skill.target_level}
                onChange={(e) => run(() => setTarget(skill.id, Number(e.target.value)))}
                className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text"
              >
                {[1, 2, 3, 4].map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_LABEL[l]}
                  </option>
                ))}
              </select>
            </label>
            <ConfirmDelete label={`Delete skill ${skill.name}`} onConfirm={() => run(() => removeRow('skills', skill.id))} />
          </div>
        </div>
      )}
    </li>
  );
}

function ResourceRow({
  rkey,
  title,
  url,
  meta,
  objective,
  exercise,
  verified,
  progress,
  run,
}: {
  rkey: string;
  title: string;
  url: string;
  meta: string;
  objective: string | null;
  exercise?: string;
  verified?: boolean;
  progress?: Progress;
  run: Run;
}) {
  const status = progress?.status ?? null;
  return (
    <li className="rounded-lg bg-surface-raised p-3">
      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[15px] font-medium hover:underline">
        {title} <ExternalLink className="size-3.5 text-text-faint" aria-hidden />
      </a>
      <p className="text-xs text-text-faint">
        {meta} · {verified ? 'link verified' : 'not verified by NEXUS'}
      </p>
      {objective && <p className="mt-1 text-sm text-text-muted">{objective}</p>}
      {exercise && <p className="mt-1 text-sm text-text-muted">Practice: {exercise}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {status !== 'completed' ? (
          <>
            {status !== 'in_progress' && (
              <button className="rounded-lg border border-border px-2.5 py-1 text-xs hover:border-accent" onClick={() => run(() => setProgress(rkey, { status: 'in_progress' }, progress))}>
                Start
              </button>
            )}
            <button className="rounded-lg border border-border px-2.5 py-1 text-xs hover:border-accent" onClick={() => run(() => setProgress(rkey, { status: 'completed' }, progress))}>
              Finished
            </button>
            {status === 'in_progress' && <span className="text-xs text-accent">In progress</span>}
          </>
        ) : (
          <>
            <span className="text-xs text-success">Finished</span>
            <span className="text-xs text-text-faint">How well did it land?</span>
            {[1, 2, 3].map((u) => (
              <button
                key={u}
                aria-pressed={progress?.understood === u}
                onClick={() => run(() => setProgress(rkey, { understood: u }, progress))}
                className={`rounded-lg px-2 py-1 text-xs ${progress?.understood === u ? 'bg-accent text-on-accent' : 'border border-border text-text-muted'}`}
              >
                {['', 'Shaky', 'Understood', 'Could teach it'][u]}
              </button>
            ))}
            <label className="flex items-center gap-1 text-xs text-text-muted">
              <input type="checkbox" checked={progress?.applied ?? false} onChange={(e) => run(() => setProgress(rkey, { applied: e.target.checked }, progress))} className="accent-[var(--accent)]" />
              Applied it
            </label>
          </>
        )}
      </div>
    </li>
  );
}

function EvidenceForm({ skillId, run, busy }: { skillId: string; run: Run; busy: boolean }) {
  const { profile } = useProfile();
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState('');
  const [kind, setKind] = useState<(typeof EVIDENCE_KINDS)[number]>('project');
  const [strength, setStrength] = useState('2');
  const [link, setLink] = useState('');
  const [date, setDate] = useState(todayIn(profile?.timezone ?? 'Africa/Accra'));
  if (!open)
    return (
      <button className="text-sm text-accent hover:underline" onClick={() => setOpen(true)}>
        + Record evidence
      </button>
    );
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (await run(() => addEvidence(skillId, { kind, description: desc, link: link.trim() || null, occurred_on: date, strength: Number(strength) }))) {
      setDesc('');
      setLink('');
      setOpen(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-border p-3">
      <Field label="What did you do?">
        <TextInput value={desc} onChange={(e) => setDesc(e.target.value)} required maxLength={300} placeholder="Set up VLANs for the lab network in Packet Tracer" />
      </Field>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Kind">
          <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            {EVIDENCE_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="How">
          <Select value={strength} onChange={(e) => setStrength(e.target.value)}>
            {[1, 2, 3].map((s) => (
              <option key={s} value={s}>
                {STRENGTH_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="When">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
      </div>
      <Field label="Link (optional)" hint="GitHub repo, certificate, write-up — https only.">
        <TextInput value={link} onChange={(e) => setLink(e.target.value)} maxLength={500} placeholder="https://" />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          Save evidence
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function OwnResources({ track, data, run, busy }: { track: Track; data: DevData; run: Run; busy: boolean }) {
  const skills = data.skills.filter((s) => s.track === track);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [skillId, setSkillId] = useState('');
  const [kind, setKind] = useState('video');
  const [difficulty, setDifficulty] = useState('intro');
  if (skills.length === 0) return null;
  return (
    <Panel
      title="Add your own resource"
      action={
        <button className="text-sm text-text-muted hover:text-text" onClick={() => setOpen((v) => !v)}>
          {open ? 'Close' : 'Open'}
        </button>
      }
    >
      {!open ? (
        <p className="text-[15px] text-text-muted">A YouTube video or article you found — it joins that skill’s plan, marked as not verified by NEXUS.</p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => addResource({ skill_id: skillId || skills[0]!.id, title, url, kind, difficulty, objective: null }))) {
              setTitle('');
              setUrl('');
            }
          }}
        >
          <Field label="Title">
            <TextInput value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={160} />
          </Field>
          <Field label="Link">
            <TextInput value={url} onChange={(e) => setUrl(e.target.value)} required maxLength={500} placeholder="https://" />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Skill">
              <Select value={skillId || skills[0]!.id} onChange={(e) => setSkillId(e.target.value)}>
                {skills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Type">
              <Select value={kind} onChange={(e) => setKind(e.target.value)}>
                {['video', 'course', 'docs', 'article', 'book', 'exercise', 'paper', 'lab'].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </Select>
            </Field>
            <Field label="Level">
              <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                {['intro', 'intermediate', 'advanced'].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Button type="submit" disabled={busy}>
            Add resource
          </Button>
        </form>
      )}
      {data.resources.filter((r) => skills.some((s) => s.id === r.skill_id)).length > 0 && open && (
        <ul className="mt-3 divide-y divide-border">
          {data.resources
            .filter((r) => skills.some((s) => s.id === r.skill_id))
            .map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="truncate">{r.title}</span>
                <ConfirmDelete label={`Delete ${r.title}`} onConfirm={() => run(() => removeRow('learning_resources', r.id))} />
              </li>
            ))}
        </ul>
      )}
    </Panel>
  );
}
