/**
 * The single gate between the user's data and any AI provider (spec §3, §14, §15).
 * Phase 4's AI calls must build their context ONLY through this function, so the Memory
 * Centre's "what AI would see" preview is exactly what would be sent.
 */

export const AI_CATEGORIES = ['profile', 'memories', 'academics', 'finances', 'goals', 'projects', 'development'] as const;
export type AiCategory = (typeof AI_CATEGORIES)[number];

export interface MemoryItem {
  id: string;
  content: string;
  kind: 'fact' | 'preference' | 'pattern' | 'temporary' | 'hypothesis';
  topic: string;
  ai_visible: boolean;
  sensitive: boolean;
  expires_on: string | null;
  confirmed_at: string | null;
  source: string;
}

export interface ContextInput {
  aiEnabled: boolean;
  permissions: Partial<Record<AiCategory, boolean>>;
  today: string;
  memories: readonly MemoryItem[];
  /** Pre-summarised, non-identifying lines per category (built by each module). */
  summaries?: Partial<Record<Exclude<AiCategory, 'memories'>, string[]>>;
}

export interface ContextOutput {
  enabled: boolean;
  sections: { category: AiCategory; lines: string[] }[];
  withheld: { sensitive: number; hidden: number; expired: number; categoriesOff: AiCategory[] };
}

const KIND_PREFIX: Record<MemoryItem['kind'], string> = {
  fact: '',
  preference: 'Preference: ',
  pattern: 'Observed pattern: ',
  temporary: 'Currently: ',
  hypothesis: 'Unconfirmed guess: ',
};

export function buildAiContext(input: ContextInput): ContextOutput {
  const withheld = { sensitive: 0, hidden: 0, expired: 0, categoriesOff: [] as AiCategory[] };
  if (!input.aiEnabled) {
    return { enabled: false, sections: [], withheld: { ...withheld, categoriesOff: [...AI_CATEGORIES] } };
  }
  const allowed = (c: AiCategory) => input.permissions[c] === true;
  const sections: ContextOutput['sections'] = [];

  for (const c of AI_CATEGORIES) {
    if (!allowed(c)) {
      withheld.categoriesOff.push(c);
      continue;
    }
    if (c === 'memories') {
      const lines: string[] = [];
      for (const m of input.memories) {
        if (m.sensitive) withheld.sensitive++;
        else if (!m.ai_visible) withheld.hidden++;
        else if (m.kind === 'temporary' && m.expires_on && m.expires_on < input.today) withheld.expired++;
        else lines.push(`${KIND_PREFIX[m.kind]}${m.content}`);
      }
      if (lines.length) sections.push({ category: c, lines });
    } else {
      const lines = input.summaries?.[c] ?? [];
      if (lines.length) sections.push({ category: c, lines: [...lines] });
    }
  }
  return { enabled: true, sections, withheld };
}

/** Plain text form, as it would be sent. */
export function renderContext(out: ContextOutput): string {
  if (!out.enabled || out.sections.length === 0) return '';
  return out.sections.map((s) => `## ${s.category}\n${s.lines.map((l) => `- ${l}`).join('\n')}`).join('\n\n');
}
