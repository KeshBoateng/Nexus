import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readEnv } from './env';

const env = readEnv();

/** Null when the app is not configured yet (see docs/SETUP.md). */
export const supabase: SupabaseClient | null = env
  ? createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}
