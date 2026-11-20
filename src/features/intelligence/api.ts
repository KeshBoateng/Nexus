import { useCallback, useEffect, useState } from 'react';
import { cached } from '../../lib/offline';
import { z } from 'zod';
import { requireSupabase } from '../../lib/supabase';
import { AI_CATEGORIES, type AiCategory } from '../../lib/aiContext';

export const MEMORY_KINDS = ['fact', 'preference', 'pattern', 'temporary', 'hypothesis'] as const;
export const MEMORY_TOPICS = ['ambition', 'academic', 'career', 'technical', 'financial', 'learning', 'productivity', 'leadership', 'business', 'personal', 'other'] as const;

export const KIND_LABEL: Record<(typeof MEMORY_KINDS)[number], string> = {
  fact: 'Fact',
  preference: 'Preference',
  pattern: 'Pattern',
  temporary: 'For now',
  hypothesis: 'Guess',
};

export const MemorySchema = z.object({
  id: z.uuid(),
  content: z.string(),
  kind: z.enum(MEMORY_KINDS),
  topic: z.enum(MEMORY_TOPICS),
  source: z.string(),
  confidence: z.number().nullable(),
  confirmed_at: z.string().nullable(),
  expires_on: z.string().nullable(),
  ai_visible: z.boolean(),
  sensitive: z.boolean(),
  created_at: z.string(),
});
export type Memory = z.infer<typeof MemorySchema>;

const PermRow = z.object({ category: z.string(), allowed: z.boolean() });

export interface IntelData {
  memories: Memory[];
  permissions: Record<AiCategory, boolean>;
  /** Study Library permission — separate from chat context categories. */
  studyAllowed: boolean;
}

/**
 * Read permission rows tolerantly: categories this screen doesn't know about (e.g. 'study',
 * added later) must never break the page. Missing known categories default to not allowed.
 */
export function parsePermissions(raw: unknown): { permissions: Record<AiCategory, boolean>; studyAllowed: boolean; missing: AiCategory[] } {
  const rows = z.array(PermRow).parse(raw);
  const known = new Set<string>(AI_CATEGORIES);
  const missing = AI_CATEGORIES.filter((c) => !rows.some((r) => r.category === c));
  const permissions = Object.fromEntries(
    AI_CATEGORIES.map((c) => [c, rows.find((r) => r.category === c && known.has(r.category))?.allowed ?? false]),
  ) as Record<AiCategory, boolean>;
  return { permissions, studyAllowed: rows.some((r) => r.category === 'study' && r.allowed), missing };
}

function ok<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}
const sb = () => requireSupabase();

export async function fetchIntel(): Promise<IntelData> {
  const [mem, perms] = await Promise.all([
    sb().from('personal_memories').select('id, content, kind, topic, source, confidence, confirmed_at, expires_on, ai_visible, sensitive, created_at').order('created_at', { ascending: false }),
    sb().from('ai_permissions').select('category, allowed'),
  ]);
  const { permissions, studyAllowed, missing } = parsePermissions(ok(perms));
  if (missing.length) {
    const { error } = await sb().from('ai_permissions').insert(missing.map((category) => ({ category })));
    if (error && error.code !== '23505') throw error;
  }
  return { memories: z.array(MemorySchema).parse(ok(mem)), permissions, studyAllowed };
}

export const MemoryInput = z.object({
  content: z.string().trim().min(1).max(1000),
  kind: z.enum(MEMORY_KINDS),
  topic: z.enum(MEMORY_TOPICS),
  expires_on: z.string().nullable(),
  sensitive: z.boolean(),
});

export async function addMemory(i: z.input<typeof MemoryInput>, source: 'user' | 'onboarding' = 'user') {
  const row = MemoryInput.parse(i);
  ok(
    await sb()
      .from('personal_memories')
      .insert({ ...row, expires_on: row.kind === 'temporary' ? row.expires_on : null, ai_visible: !row.sensitive, source }),
  );
}

export async function addMemories(items: z.input<typeof MemoryInput>[], source: 'onboarding') {
  const rows = items.map((i) => {
    const r = MemoryInput.parse(i);
    return { ...r, expires_on: null, ai_visible: !r.sensitive, source };
  });
  if (rows.length) ok(await sb().from('personal_memories').insert(rows));
}

export async function updateMemory(id: string, patch: Partial<Pick<Memory, 'content' | 'kind' | 'topic' | 'expires_on' | 'ai_visible' | 'sensitive' | 'confirmed_at'>>) {
  const row = { ...patch };
  if (row.sensitive === true) row.ai_visible = false;
  ok(await sb().from('personal_memories').update(row).eq('id', id));
}

/** The user confirms a guess: it becomes a fact with a confirmation timestamp. */
export const confirmMemory = (id: string) => updateMemory(id, { kind: 'fact', confirmed_at: new Date().toISOString() });

export async function deleteMemory(id: string) {
  ok(await sb().from('personal_memories').delete().eq('id', id));
}

export async function setPermission(category: AiCategory, allowed: boolean) {
  ok(await sb().from('ai_permissions').update({ allowed }).eq('category', category));
}

export function useIntel() {
  const [data, setData] = useState<IntelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (): Promise<() => void> => {
    try {
      const d = await cached('intelligence', fetchIntel);
      return () => {
        setData(d);
        setError(null);
      };
    } catch (err) {
      return () => setError(err instanceof Error ? err.message : 'Could not load your memory.');
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
