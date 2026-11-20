// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('ai-chat Edge Function', () => {
  it('uses exactly the same context filter as the app preview', () => {
    const app = readFileSync(join(process.cwd(), 'src/lib/aiContext.ts'), 'utf8');
    const fn = readFileSync(join(process.cwd(), 'supabase/functions/ai-chat/aiContext.ts'), 'utf8');
    expect(fn).toBe(app);
  });

  it('enforces consent, auth, limits and keeps the key server-side', () => {
    const src = readFileSync(join(process.cwd(), 'supabase/functions/ai-chat/index.ts'), 'utf8');
    expect(src).toContain('auth.getUser(token)');
    expect(src).toContain("if (!prefs.data.ai_enabled)");
    expect(src).toContain('buildAiContext(');
    expect(src).toContain('DAILY_LIMIT');
    expect(src).toContain("Deno.env.get('AI_API_KEY')");
    expect(src).not.toMatch(/gsk_[A-Za-z0-9]{10,}/); // no Groq key committed
  });
});

describe('notify Edge Function', () => {
  it('uses exactly the same reminder rules as the app', () => {
    const app = readFileSync(join(process.cwd(), 'src/lib/reminders.ts'), 'utf8');
    const fn = readFileSync(join(process.cwd(), 'supabase/functions/notify/reminders.ts'), 'utf8');
    expect(fn).toBe(app);
  });
  it('requires the cron token for runs and a signed-in user otherwise', () => {
    const src = readFileSync(join(process.cwd(), 'supabase/functions/notify/index.ts'), 'utf8');
    expect(src).toContain("secret(sb, 'cron_token')");
    expect(src).toContain("if (!expected || diff !== 0) return json({ error: 'Forbidden' }, 403, origin);");
    expect(src).toContain("if (!userId) return json({ error: 'Sign in required' }, 401, origin);");
  });
});

describe('study-analyze Edge Function', () => {
  it('uses the same chunking helpers as the app', () => {
    const app = readFileSync(join(process.cwd(), 'src/lib/studyText.ts'), 'utf8');
    const fn = readFileSync(join(process.cwd(), 'supabase/functions/study-analyze/studyText.ts'), 'utf8');
    expect(fn).toBe(app);
  });
  it('requires the AI switch and the study permission, and shares the daily cap', () => {
    const src = readFileSync(join(process.cwd(), 'supabase/functions/study-analyze/index.ts'), 'utf8');
    expect(src).toContain("if (!prefs.data?.ai_enabled || !perm.data?.allowed)");
    expect(src).toContain('DAILY_LIMIT = 50');
    expect(src).toContain("categories: ['study']");
    expect(src).not.toMatch(/personal_memories|financial_accounts|profiles/); // only the document goes out
  });
});
