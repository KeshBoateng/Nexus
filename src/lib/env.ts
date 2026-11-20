import { z } from 'zod';

const EnvSchema = z.object({
  VITE_SUPABASE_URL: z.url({ protocol: /^https?$/ }),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
});

export type AppEnv = z.infer<typeof EnvSchema>;

/**
 * Returns validated public config, or null when it is missing/invalid so the app can show
 * setup instructions instead of crashing. Only PUBLIC values may ever live in VITE_* vars.
 */
export function readEnv(source: Record<string, unknown> = import.meta.env): AppEnv | null {
  const parsed = EnvSchema.safeParse(source);
  return parsed.success ? parsed.data : null;
}
