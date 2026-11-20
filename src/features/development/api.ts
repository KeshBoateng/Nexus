import { useCallback, useEffect, useState } from 'react';
import { cached } from '../../lib/offline';
import { z } from 'zod';
import { requireSupabase } from '../../lib/supabase';
import { CATALOG, learningPlan, type Track } from '../../lib/catalog';
import { estimateLevel } from '../../lib/proficiency';

export const SkillSchema = z.object({ id: z.uuid(), track: z.enum(['technical', 'leadership', 'entrepreneurship']), name: z.string(), target_level: z.number().int() });
export type Skill = z.infer<typeof SkillSchema>;

export const EVIDENCE_KINDS = ['project', 'exercise', 'assessment', 'certification', 'work', 'teaching', 'leadership'] as const;
export const EvidenceSchema = z.object({
  id: z.uuid(),
  skill_id: z.uuid(),
  kind: z.enum(EVIDENCE_KINDS),
  description: z.string(),
  link: z.string().nullable(),
  occurred_on: z.string(),
  strength: z.number().int(),
});
export type EvidenceRow = z.infer<typeof EvidenceSchema>;

export const UserResourceSchema = z.object({
  id: z.uuid(),
  skill_id: z.uuid().nullable(),
  title: z.string(),
  url: z.string(),
  kind: z.string(),
  difficulty: z.enum(['intro', 'intermediate', 'advanced']),
  objective: z.string().nullable(),
});
export type UserResource = z.infer<typeof UserResourceSchema>;

export const ProgressSchema = z.object({
  id: z.uuid(),
  resource_key: z.string(),
  status: z.enum(['planned', 'in_progress', 'completed']),
  understood: z.number().int().nullable(),
  applied: z.boolean(),
});
export type Progress = z.infer<typeof ProgressSchema>;

export interface DevData {
  skills: Skill[];
  evidence: EvidenceRow[];
  resources: UserResource[];
  progress: Progress[];
}

function ok<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}
const sb = () => requireSupabase();

export async function fetchDev(): Promise<DevData> {
  const [skills, evidence, resources, progress] = await Promise.all([
    sb().from('skills').select('id, track, name, target_level').order('created_at'),
    sb().from('skill_evidence').select('id, skill_id, kind, description, link, occurred_on, strength').order('occurred_on', { ascending: false }),
    sb().from('learning_resources').select('id, skill_id, title, url, kind, difficulty, objective').order('created_at'),
    sb().from('learning_progress').select('id, resource_key, status, understood, applied'),
  ]);
  return {
    skills: z.array(SkillSchema).parse(ok(skills)),
    evidence: z.array(EvidenceSchema).parse(ok(evidence)),
    resources: z.array(UserResourceSchema).parse(ok(resources)),
    progress: z.array(ProgressSchema).parse(ok(progress)),
  };
}

export async function addSkill(track: Track, name: string, target: number) {
  ok(await sb().from('skills').insert({ track, name: z.string().trim().min(1).max(80).parse(name), target_level: target }));
}
export async function setTarget(id: string, target: number) {
  ok(await sb().from('skills').update({ target_level: target }).eq('id', id));
}
export async function addEvidence(skillId: string, i: { kind: EvidenceRow['kind']; description: string; link: string | null; occurred_on: string; strength: number }) {
  const row = z
    .object({
      kind: z.enum(EVIDENCE_KINDS),
      description: z.string().trim().min(1).max(300),
      link: z.string().trim().regex(/^https:\/\//i, 'Links must start with https://').max(500).nullable(),
      occurred_on: z.string(),
      strength: z.number().int().min(1).max(3),
    })
    .parse(i);
  ok(await sb().from('skill_evidence').insert({ skill_id: skillId, ...row }));
}
export async function addResource(i: { skill_id: string | null; title: string; url: string; kind: string; difficulty: string; objective: string | null }) {
  const row = z
    .object({
      skill_id: z.uuid().nullable(),
      title: z.string().trim().min(1).max(160),
      url: z.string().trim().regex(/^https:\/\//i, 'Links must start with https://').max(500),
      kind: z.enum(['video', 'course', 'docs', 'article', 'book', 'exercise', 'paper', 'lab']),
      difficulty: z.enum(['intro', 'intermediate', 'advanced']),
      objective: z.string().trim().max(300).nullable(),
    })
    .parse(i);
  ok(await sb().from('learning_resources').insert(row));
}

/** Upsert-free progress update: create the row on first touch, then update. */
export async function setProgress(key: string, patch: { status?: Progress['status']; understood?: number | null; applied?: boolean }, existing?: Progress) {
  const row: Record<string, unknown> = { ...patch };
  if (patch.status) row.completed_at = patch.status === 'completed' ? new Date().toISOString() : null;
  if (existing) ok(await sb().from('learning_progress').update(row).eq('id', existing.id));
  else ok(await sb().from('learning_progress').insert({ resource_key: key, ...row }));
}

export async function removeRow(table: 'skills' | 'skill_evidence' | 'learning_resources', id: string) {
  ok(await sb().from(table).delete().eq('id', id));
}

/** Engine input: each skill's estimate, target and next step in its adaptive plan. */
export function learningState(d: DevData) {
  const done = new Set(d.progress.filter((p) => p.status === 'completed').map((p) => p.resource_key.replace(/^catalog:/, '')));
  const inProgress = new Set(d.progress.filter((p) => p.status === 'in_progress').map((p) => p.resource_key.replace(/^catalog:/, '')));
  return d.skills.map((s) => {
    const estimate = estimateLevel(d.evidence.filter((e) => e.skill_id === s.id)).level;
    const plan = learningPlan(s.name, estimate, done);
    const pick = plan.find((r) => inProgress.has(r.id)) ?? plan[0];
    return {
      skill: s.name,
      estimate,
      target: s.target_level,
      next: pick ? { id: pick.id, title: pick.title, source: pick.source, objective: pick.objective, exercise: pick.exercise, inProgress: inProgress.has(pick.id) } : null,
    };
  });
}

export const catalogById = new Map(CATALOG.map((r) => [r.id, r]));

export function useDev() {
  const [data, setData] = useState<DevData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (): Promise<() => void> => {
    try {
      const d = await cached('development', fetchDev);
      return () => {
        setData(d);
        setError(null);
      };
    } catch (err) {
      return () => setError(err instanceof Error ? err.message : 'Could not load development.');
    }
  }, []);
  const reload = useCallback(async () => (await load())(), [load]);
  useEffect(() => {
    let active = true;
    load().then((apply) => {
      if (active) apply();
    });
    return () => {
      active = false;
    };
  }, [load]);
  return { data, error, reload };
}
