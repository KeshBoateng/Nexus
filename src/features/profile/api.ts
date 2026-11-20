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
  accountability_mode: z.boolean().default(false),
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
    .select('user_id, theme, briefing_time, quiet_hours_start, quiet_hours_end, ai_enabled, accountability_mode')
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
  const [profile, preferences, audit, bands, terms, courses, assessments, accounts, transactions, budgets, savingsGoals, goals, milestones, habits, checkins] = await Promise.all([
    sb.from('profiles').select('*').eq('id', userId).single(),
    sb.from('user_preferences').select('*').eq('user_id', userId).single(),
    sb.from('audit_logs').select('*').eq('user_id', userId).order('created_at'),
    sb.from('grade_bands').select('*').order('min_mark', { ascending: false }),
    sb.from('academic_terms').select('*').order('created_at'),
    sb.from('courses').select('*').order('created_at'),
    sb.from('assessments').select('*').order('created_at'),
    sb.from('financial_accounts').select('*').order('created_at'),
    sb.from('transactions').select('*').order('occurred_on'),
    sb.from('budgets').select('*').order('category'),
    sb.from('savings_goals').select('*').order('created_at'),
    sb.from('goals').select('*').order('created_at'),
    sb.from('goal_milestones').select('*').order('created_at'),
    sb.from('habits').select('*').order('created_at'),
    sb.from('habit_checkins').select('*').order('on_date'),
  ]);
  const [projects, members, tasks, pMilestones, meetings] = await Promise.all([
    sb.from('projects').select('*').order('created_at'),
    sb.from('project_members').select('*').order('created_at'),
    sb.from('project_tasks').select('*').order('created_at'),
    sb.from('project_milestones').select('*').order('created_at'),
    sb.from('meetings').select('*').order('held_on'),
  ]);
  const [memories, aiPermissions, recs, recEvents, recFeedback, briefings] = await Promise.all([
    sb.from('personal_memories').select('*').order('created_at'),
    sb.from('ai_permissions').select('*').order('category'),
    sb.from('recommendations').select('*').order('created_at'),
    sb.from('recommendation_events').select('*').order('created_at'),
    sb.from('recommendation_feedback').select('*').order('created_at'),
    sb.from('daily_briefings').select('*').order('on_date'),
  ]);
  const [skills, skillEvidence, learningResources, learningProgress] = await Promise.all([
    sb.from('skills').select('*').order('created_at'),
    sb.from('skill_evidence').select('*').order('occurred_on'),
    sb.from('learning_resources').select('*').order('created_at'),
    sb.from('learning_progress').select('*').order('created_at'),
  ]);
  const [aiRequests, notifications, notificationPrefs] = await Promise.all([
    sb.from('ai_requests').select('*').order('created_at'),
    sb.from('notifications').select('*').order('created_at'),
    sb.from('notification_preferences').select('*').order('category'),
  ]);
  const [weeklyReviews, opportunities] = await Promise.all([
    sb.from('weekly_reviews').select('*').order('week_key'),
    sb.from('opportunities').select('*').order('created_at'),
  ]);
  const all = [profile, preferences, audit, bands, terms, courses, assessments, accounts, transactions, budgets, savingsGoals, goals, milestones, habits, checkins, projects, members, tasks, pMilestones, meetings, memories, aiPermissions, recs, recEvents, recFeedback, briefings, skills, skillEvidence, learningResources, learningProgress, aiRequests, notifications, notificationPrefs, weeklyReviews, opportunities];
  for (const r of all) if (r.error) throw r.error;
  const doc = {
    format: 'nexus-export',
    version: 11,
    money_note: 'Amounts ending in _minor are integer minor units (e.g. pesewas for GHS).',
    exported_at: new Date().toISOString(),
    data: {
      profile: profile.data,
      user_preferences: preferences.data,
      grade_bands: bands.data,
      academic_terms: terms.data,
      courses: courses.data,
      assessments: assessments.data,
      financial_accounts: accounts.data,
      transactions: transactions.data,
      budgets: budgets.data,
      savings_goals: savingsGoals.data,
      goals: goals.data,
      goal_milestones: milestones.data,
      habits: habits.data,
      habit_checkins: checkins.data,
      projects: projects.data,
      project_members: members.data,
      project_tasks: tasks.data,
      project_milestones: pMilestones.data,
      meetings: meetings.data,
      personal_memories: memories.data,
      ai_permissions: aiPermissions.data,
      recommendations: recs.data,
      recommendation_events: recEvents.data,
      recommendation_feedback: recFeedback.data,
      daily_briefings: briefings.data,
      skills: skills.data,
      skill_evidence: skillEvidence.data,
      learning_resources: learningResources.data,
      learning_progress: learningProgress.data,
      ai_requests: aiRequests.data,
      notifications: notifications.data,
      notification_preferences: notificationPrefs.data,
      weekly_reviews: weeklyReviews.data,
      opportunities: opportunities.data,
      audit_logs: audit.data,
    },
  };
  return new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
}
