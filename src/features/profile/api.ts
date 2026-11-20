import { z } from 'zod';
import { requireSupabase } from '../../lib/supabase';

/** Server rows are validated on the way in — the client never trusts response shapes blindly. */

const timeString = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);

export const ProfileSchema = z.object({
  id: z.uuid(),
  display_name: z.string().nullable(),
  timezone: z.string(),
  default_currency: z.string().length(3),
  onboarded_at: z.string().nullable(),
  created_at: z.string(),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const PreferencesSchema = z.object({
  user_id: z.uuid(),
  theme: z.enum(['dark', 'light', 'system']),
  briefing_time: timeString,
  quiet_hours_start: timeString.nullable(),
  quiet_hours_end: timeString.nullable(),
  ai_enabled: z.boolean(),
});
export type Preferences = z.infer<typeof PreferencesSchema>;

/** Only these fields may be written by the client (mirrors the column grants in migration 0001). */
export const ProfileUpdateSchema = z.object({
  display_name: z.string().trim().min(1).max(80).nullable(),
  timezone: z.string().min(1).max(64),
  default_currency: z.string().regex(/^[A-Z]{3}$/),
});
export type ProfileUpdate = z.infer<typeof ProfileUpdateSchema>;

export const PreferencesUpdateSchema = z
  .object({
    theme: z.enum(['dark', 'light', 'system']),
    briefing_time: timeString,
    quiet_hours_start: timeString.nullable(),
    quiet_hours_end: timeString.nullable(),
    ai_enabled: z.boolean(),
  })
  .refine((p) => (p.quiet_hours_start === null) === (p.quiet_hours_end === null), {
    message: 'Set both quiet-hours times, or neither.',
  });
export type PreferencesUpdate = z.infer<typeof PreferencesUpdateSchema>;

export async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await requireSupabase()
    .from('profiles')
    .select('id, display_name, timezone, default_currency, onboarded_at, created_at')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return ProfileSchema.parse(data);
}

export async function fetchPreferences(userId: string): Promise<Preferences> {
  const { data, error } = await requireSupabase()
    .from('user_preferences')
    .select('user_id, theme, briefing_time, quiet_hours_start, quiet_hours_end, ai_enabled')
    .eq('user_id', userId)
    .single();
  if (error) throw error;
  return PreferencesSchema.parse(data);
}

export async function updateProfile(userId: string, patch: ProfileUpdate): Promise<void> {
  const clean = ProfileUpdateSchema.parse(patch);
  const { error } = await requireSupabase().from('profiles').update(clean).eq('id', userId);
  if (error) throw error;
}

export async function updatePreferences(userId: string, patch: PreferencesUpdate): Promise<void> {
  const clean = PreferencesUpdateSchema.parse(patch);
  const { error } = await requireSupabase().from('user_preferences').update(clean).eq('user_id', userId);
  if (error) throw error;
}

/** Everything the user owns, as one JSON document. Extended as modules are added. */
export async function exportMyData(userId: string): Promise<Blob> {
  const sb = requireSupabase();
  const [profile, preferences, audit, bands, terms, courses, assessments] = await Promise.all([
    sb.from('profiles').select('*').eq('id', userId).single(),
    sb.from('user_preferences').select('*').eq('user_id', userId).single(),
    sb.from('audit_logs').select('*').eq('user_id', userId).order('created_at'),
    sb.from('grade_bands').select('*').order('min_mark', { ascending: false }),
    sb.from('academic_terms').select('*').order('created_at'),
    sb.from('courses').select('*').order('created_at'),
    sb.from('assessments').select('*').order('created_at'),
  ]);
  for (const r of [profile, preferences, audit, bands, terms, courses, assessments]) if (r.error) throw r.error;
  const doc = {
    format: 'nexus-export',
    version: 2,
    exported_at: new Date().toISOString(),
    data: {
      profile: profile.data,
      user_preferences: preferences.data,
      grade_bands: bands.data,
      academic_terms: terms.data,
      courses: courses.data,
      assessments: assessments.data,
      audit_logs: audit.data,
    },
  };
  return new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
}
