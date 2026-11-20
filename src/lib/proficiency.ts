/**
 * Proficiency estimate from evidence only (spec §2.3, §8: "Do not automatically classify the
 * user as an expert based on a single activity"). Lessons completed don't count; things done do.
 *
 *   0 None        — no evidence
 *   1 Beginner    — any evidence (a single item can never go higher)
 *   2 Developing  — ≥ 2 items, at least one done independently (strength ≥ 2)
 *   3 Proficient  — ≥ 4 items, ≥ 2 independent, at least one real project or work
 *   4 Advanced    — ≥ 6 items, ≥ 2 led/taught/high-stakes (strength 3), across ≥ 3 kinds
 */

export interface Evidence {
  kind: 'project' | 'assessment' | 'certification' | 'exercise' | 'work' | 'teaching' | 'leadership';
  strength: number;
}

export const LEVEL_LABEL = ['None', 'Beginner', 'Developing', 'Proficient', 'Advanced'] as const;

export function estimateLevel(evidence: readonly Evidence[]): { level: number; next: string | null } {
  const n = evidence.length;
  const independent = evidence.filter((e) => e.strength >= 2).length;
  const strong = evidence.filter((e) => e.strength >= 3).length;
  const real = evidence.some((e) => e.kind === 'project' || e.kind === 'work' || e.kind === 'leadership');
  const kinds = new Set(evidence.map((e) => e.kind)).size;

  if (n >= 6 && strong >= 2 && kinds >= 3) return { level: 4, next: null };
  if (n >= 4 && independent >= 2 && real)
    return { level: 3, next: `For Advanced: ${Math.max(0, 6 - n)} more item(s), ${Math.max(0, 2 - strong)} more you led/taught, ${Math.max(0, 3 - kinds)} more kind(s) of evidence.` };
  if (n >= 2 && independent >= 1)
    return { level: 2, next: `For Proficient: ${Math.max(0, 4 - n)} more item(s), ${Math.max(0, 2 - independent)} more done independently${real ? '' : ', and a real project or work'}.` };
  if (n >= 1) return { level: 1, next: 'For Developing: one more piece of evidence, done independently.' };
  return { level: 0, next: 'Record something you have done with this skill — a project, exercise or result.' };
}
