import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { requireSupabase } from '../../lib/supabase';

export const GOAL_AREAS = ['academic', 'financial', 'career', 'technical', 'leadership', 'business', 'health', 'personal'] as const;

export const GoalSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  why: z.string().nullable(),
  area: z.enum(GOAL_AREAS),
  horizon: z.enum(['short', 'long']),
  target_date: z.string().nullable(),
  status: z.enum(['active', 'achieved', 'dropped']),
  closed_at: z.string().nullable(),
});
export type Goal = z.infer<typeof GoalSchema>;

export const MilestoneSchema = z.object({
  id: z.uuid(),
  goal_id: z.uuid(),
  title: z.string(),
  due_on: z.string().nullable(),
  done_at: z.string().nullable(),
});
export type Milestone = z.infer<typeof MilestoneSchema>;

export const HabitSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  target_per_week: z.number().int(),
  archived_at: z.string().nullable(),
});
export type Habit = z.infer<typeof HabitSchema>;

const CheckinSchema = z.object({ id: z.uuid(), habit_id: z.uuid(), on_date: z.string() });
export type Checkin = z.infer<typeof CheckinSchema>;

export interface GoalsData {
  goals: Goal[];
  milestones: Milestone[];
  habits: Habit[];
  checkins: Checkin[];
}

function ok<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

export async function fetchGoals(): Promise<GoalsData> {
  const sb = requireSupabase();
  // Check-ins: the last ~15 weeks are enough for streaks shown in the UI.
  const since = new Date(Date.now() - 110 * 86_400_000).toISOString().slice(0, 10);
  const [goals, milestones, habits, checkins] = await Promise.all([
    sb.from('goals').select('id, title, why, area, horizon, target_date, status, closed_at').order('created_at'),
    sb.from('goal_milestones').select('id, goal_id, title, due_on, done_at').order('created_at'),
    sb.from('habits').select('id, name, target_per_week, archived_at').order('created_at'),
    sb.from('habit_checkins').select('id, habit_id, on_date').gte('on_date', since),
  ]);
  return {
    goals: z.array(GoalSchema).parse(ok(goals)),
    milestones: z.array(MilestoneSchema).parse(ok(milestones)),
    habits: z.array(HabitSchema).parse(ok(habits)),
    checkins: z.array(CheckinSchema).parse(ok(checkins)),
  };
}

export const GoalInput = z.object({
  title: z.string().trim().min(1).max(120),
  why: z.string().trim().max(500).nullable(),
  area: z.enum(GOAL_AREAS),
  horizon: z.enum(['short', 'long']),
  target_date: z.string().nullable(),
});
export const HabitInput = z.object({
  name: z.string().trim().min(1).max(80),
  target_per_week: z.number().int().min(1).max(7),
});

const sb = () => requireSupabase();

export async function saveGoal(i: z.input<typeof GoalInput>, id?: string) {
  const row = GoalInput.parse(i);
  ok(id ? await sb().from('goals').update(row).eq('id', id) : await sb().from('goals').insert(row));
}

export async function setGoalStatus(id: string, status: Goal['status']) {
  ok(await sb().from('goals').update({ status, closed_at: status === 'active' ? null : new Date().toISOString() }).eq('id', id));
}

export async function addMilestone(goalId: string, title: string, dueOn: string | null) {
  const t = z.string().trim().min(1).max(120).parse(title);
  ok(await sb().from('goal_milestones').insert({ goal_id: goalId, title: t, due_on: dueOn }));
}

export async function setMilestoneDone(id: string, done: boolean) {
  ok(await sb().from('goal_milestones').update({ done_at: done ? new Date().toISOString() : null }).eq('id', id));
}

export async function saveHabit(i: z.input<typeof HabitInput>) {
  ok(await sb().from('habits').insert(HabitInput.parse(i)));
}

export async function setHabitArchived(id: string, archived: boolean) {
  ok(await sb().from('habits').update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', id));
}

/** Toggle a day's check-in. A duplicate insert (double tap) is treated as already done. */
export async function setCheckin(habitId: string, onDate: string, done: boolean) {
  if (done) {
    const { error } = await sb().from('habit_checkins').insert({ habit_id: habitId, on_date: onDate });
    if (error && error.code !== '23505') throw error;
  } else {
    ok(await sb().from('habit_checkins').delete().eq('habit_id', habitId).eq('on_date', onDate));
  }
}

export async function removeRow(table: 'goals' | 'goal_milestones' | 'habits', id: string) {
  ok(await sb().from(table).delete().eq('id', id));
}

export function useGoals() {
  const [data, setData] = useState<GoalsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<() => void> => {
    try {
      const d = await fetchGoals();
      return () => {
        setData(d);
        setError(null);
      };
    } catch (err) {
      return () => setError(err instanceof Error ? err.message : 'Could not load goals.');
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
