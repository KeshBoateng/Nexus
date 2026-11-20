import { courseStudy } from '../../lib/courseStatus';
import { useCallback, useEffect, useState } from 'react';
import { cached } from '../../lib/offline';
import { z } from 'zod';
import { requireSupabase } from '../../lib/supabase';
import { addDays, currentStreak } from '../../lib/habits';
import { budgetProgress, monthKey, spendingByCategory } from '../../lib/finance';
import { formatMoney } from '../../lib/money';
import { nextSteps } from '../../lib/projectHealth';
import { candidates, feedbackHistory, selectBriefing, type EngineInput } from '../../lib/recommend';
import { fetchAcademics } from '../academics/api';
import { fetchFinances } from '../finances/api';
import { fetchGoals } from '../goals/api';
import { fetchProjects, stateOf } from '../projects/api';
import { fetchDev, learningState } from '../development/api';

export const RecSchema = z.object({
  id: z.uuid(),
  rule_type: z.string(),
  rule_key: z.string(),
  category: z.string(),
  kind: z.string(),
  title: z.string(),
  action: z.string(),
  why: z.string(),
  benefit: z.string().nullable(),
  evidence: z.array(z.string()),
  priority: z.number(),
  est_minutes: z.number().nullable(),
  due_on: z.string().nullable(),
  essential: z.boolean(),
  shown_on: z.string(),
  status: z.enum(['open', 'accepted', 'started', 'completed', 'applied', 'dismissed']),
});
export type Rec = z.infer<typeof RecSchema>;

const Rating = z.enum(['very_useful', 'somewhat_useful', 'not_useful', 'already_know']);
export type Rating = z.infer<typeof Rating>;
const FeedbackRow = z.object({ recommendation_id: z.uuid(), rating: Rating, reason: z.string().nullable(), created_at: z.string() });
const EventRow = z.object({ recommendation_id: z.uuid(), event: z.string(), created_at: z.string() });

const REC_COLS = 'id, rule_type, rule_key, category, kind, title, action, why, benefit, evidence, priority, est_minutes, due_on, essential, shown_on, status';

function ok<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}
const sb = () => requireSupabase();

/** Collect the engine's inputs from every module (deterministic; no AI). */
export async function engineInput(today: string, currency: string): Promise<EngineInput> {
  const [acad, fin, goals, proj, dev, guesses, studyProg, studyLessons, studyMats] = await Promise.all([
    fetchAcademics(),
    fetchFinances(),
    fetchGoals(),
    fetchProjects(),
    fetchDev(),
    sb().from('personal_memories').select('id', { count: 'exact', head: true }).eq('kind', 'hypothesis'),
    sb().from('study_progress').select('material_id, section, status, updated_at').order('updated_at', { ascending: false }).limit(500),
    sb().from('study_lessons').select('material_id, sections_total'),
    sb().from('study_materials').select('id, title, course_id'),
  ]);
  if (guesses.error) throw guesses.error;

  const courseLabel = new Map(acad.courses.map((c) => [c.id, c.code ?? c.title]));
  const accounts = new Map(fin.accounts.map((a) => [a.id, a]));
  const month = monthKey(today);
  const spending = spendingByCategory(fin.transactions, accounts, month, currency);
  const budgetAlerts = fin.budgets
    .filter((b) => b.currency === currency)
    .map((b) => {
      const spent = spending.find((s) => s.category === b.category)?.amount_minor ?? 0;
      const p = budgetProgress(b.monthly_limit_minor, spent);
      return { b, spent, p };
    })
    .filter(({ p }) => p.status !== 'ok')
    .map(({ b, spent, p }) => ({
      category: b.category,
      status: p.status as 'warn' | 'over',
      percent: p.percent,
      text: `${b.category}: ${formatMoney(spent, currency)} of ${formatMoney(b.monthly_limit_minor, currency)} this month`,
    }));

  const datesByHabit = new Map<string, Set<string>>();
  for (const c of goals.checkins) (datesByHabit.get(c.habit_id) ?? datesByHabit.set(c.habit_id, new Set()).get(c.habit_id)!).add(c.on_date);

  return {
    today,
    assessments: acad.assessments.map((a) => ({
      id: a.id,
      title: a.title,
      course: courseLabel.get(a.course_id) ?? 'Course',
      due_on: a.due_at ? a.due_at.slice(0, 10) : null,
      done: Boolean(a.completed_at),
      kind: a.kind,
      courseId: a.course_id,
    })),
    courseStudy: Object.fromEntries(
      courseStudy(
        (studyMats.data ?? []) as { id: string; course_id: string | null }[],
        (studyProg.data ?? []) as { material_id: string; status: string }[],
        (studyLessons.data ?? []) as { material_id: string; sections_total: number }[],
      ),
    ),
    budgetAlerts,
    finance: { hasAccounts: fin.accounts.length > 0, lastRecordedOn: fin.transactions[0]?.occurred_on ?? null },
    habits: goals.habits
      .filter((h) => !h.archived_at)
      .map((h) => {
        const d = datesByHabit.get(h.id) ?? new Set<string>();
        return { id: h.id, name: h.name, doneToday: d.has(today), streak: h.target_per_week >= 7 ? currentStreak(d, today, 7).value : 0 };
      }),
    goals: goals.goals
      .filter((g) => g.status === 'active')
      .map((g) => {
        const ms = goals.milestones.filter((m) => m.goal_id === g.id);
        return {
          id: g.id,
          title: g.title,
          milestonesTotal: ms.length,
          overdueMilestones: ms.filter((m) => !m.done_at && m.due_on && m.due_on < today).map((m) => ({ title: m.title, due_on: m.due_on! })),
        };
      }),
    projectSteps: proj.projects
      .filter((p) => p.status === 'active' || p.status === 'planning')
      .flatMap((p) => nextSteps(stateOf(proj, p), today, 2).map((step) => ({ projectId: p.id, projectName: p.name, step }))),
    pendingGuesses: guesses.count ?? 0,
    hasCourses: acad.courses.length > 0,
    learning: learningState(dev),
    study: studyState(
      (studyProg.data ?? []) as { material_id: string; section: number; status: string; updated_at: string }[],
      (studyLessons.data ?? []) as { material_id: string; sections_total: number }[],
      (studyMats.data ?? []) as { id: string; title: string }[],
    ),
  };
}

async function history(today: string) {
  const since = addDays(today, -90);
  const [recs, fb, ev] = await Promise.all([
    sb().from('recommendations').select(REC_COLS).gte('shown_on', since).order('shown_on', { ascending: false }),
    sb().from('recommendation_feedback').select('recommendation_id, rating, reason, created_at').gte('created_at', `${since}T00:00:00Z`),
    sb().from('recommendation_events').select('recommendation_id, event, created_at').gte('created_at', `${since}T00:00:00Z`),
  ]);
  return {
    recs: z.array(RecSchema).parse(ok(recs)),
    feedback: z.array(FeedbackRow).parse(ok(fb)),
    events: z.array(EventRow).parse(ok(ev)),
  };
}

export interface Briefing {
  date: string;
  items: Rec[];
  ratings: Map<string, Rating>;
}

/** Today's briefing: created once per day from the engine, then stable until refreshed. */
export async function getBriefing(today: string, currency: string, refresh = false): Promise<Briefing> {
  const h = await history(today);
  const existing = ok(await sb().from('daily_briefings').select('id, recommendation_ids').eq('on_date', today).maybeSingle()) as {
    id: string;
    recommendation_ids: string[];
  } | null;

  let ids = existing?.recommendation_ids ?? [];
  if (!existing || refresh) {
    const input = await engineInput(today, currency);
    const fb = feedbackHistory(today, h.recs, h.feedback, h.events);
    const picked = selectBriefing(candidates(input), fb, today);
    const todays = new Map(h.recs.filter((r) => r.shown_on === today).map((r) => [r.rule_key, r.id]));
    const newIds: string[] = [];
    for (const c of picked) {
      const have = todays.get(c.rule_key);
      if (have) {
        newIds.push(have);
        continue;
      }
      const { rule_type, rule_key, category, kind, title, action, why, benefit, evidence, est_minutes, due_on, essential, priority } = c;
      const res = await sb()
        .from('recommendations')
        .insert({ rule_type, rule_key, category, kind, title, action, why, benefit, evidence, est_minutes, due_on, essential, priority, shown_on: today })
        .select('id')
        .single();
      if (res.error && res.error.code !== '23505') throw res.error;
      if (res.data) {
        newIds.push((res.data as { id: string }).id);
        await sb().from('recommendation_events').insert({ recommendation_id: (res.data as { id: string }).id, event: 'viewed' });
      }
    }
    ids = refresh ? [...new Set([...ids.filter((i) => h.recs.some((r) => r.id === i && r.status === 'open')), ...newIds])] : newIds;
    const summary = { generated_by: 'rules-v1', candidates: picked.length };
    if (existing) ok(await sb().from('daily_briefings').update({ recommendation_ids: ids, summary }).eq('id', existing.id));
    else {
      const { error } = await sb().from('daily_briefings').insert({ on_date: today, recommendation_ids: ids, summary });
      if (error && error.code !== '23505') throw error;
    }
  }

  const items = ids.length ? z.array(RecSchema).parse(ok(await sb().from('recommendations').select(REC_COLS).in('id', ids))) : [];
  items.sort((a, b) => b.priority - a.priority);
  const ratings = new Map<string, Rating>();
  for (const f of h.feedback.sort((a, b) => a.created_at.localeCompare(b.created_at))) ratings.set(f.recommendation_id, f.rating);
  return { date: today, items, ratings };
}

export async function act(rec: Rec, event: 'accepted' | 'started' | 'completed' | 'applied' | 'dismissed') {
  ok(await sb().from('recommendation_events').insert({ recommendation_id: rec.id, event }));
  ok(await sb().from('recommendations').update({ status: event }).eq('id', rec.id));
}

export async function rate(rec: Rec, rating: Rating, reason: string | null) {
  ok(await sb().from('recommendation_feedback').insert({ recommendation_id: rec.id, rating, reason: reason?.trim() || null }));
}

export async function fetchHistory(today: string) {
  const h = await history(today);
  const ratings = new Map<string, Rating>();
  for (const f of h.feedback.sort((a, b) => a.created_at.localeCompare(b.created_at))) ratings.set(f.recommendation_id, f.rating);
  return { recs: h.recs, ratings };
}

export function useBriefing(today: string, currency: string) {
  const [data, setData] = useState<Briefing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    async (refresh = false): Promise<() => void> => {
      try {
        const d = refresh ? await getBriefing(today, currency, true) : await cached(`briefing:${today}`, () => getBriefing(today, currency, false));
        return () => {
          setData(d);
          setError(null);
        };
      } catch (err) {
        return () => setError(err instanceof Error ? err.message : 'Could not build your briefing.');
      }
    },
    [today, currency],
  );
  const reload = useCallback(async () => (await load())(), [load]);
  const refresh = useCallback(async () => (await load(true))(), [load]);
  useEffect(() => {
    let active = true;
    load().then((apply) => {
      if (active) apply();
    });
    return () => {
      active = false;
    };
  }, [load]);
  return { data, error, reload, refresh };
}

/** Learn-mode position per file: understood count, next section (review first), last activity. */
export function studyState(
  progress: { material_id: string; section: number; status: string; updated_at: string }[],
  lessons: { material_id: string; sections_total: number }[],
  materials: { id: string; title: string }[],
) {
  const totals = new Map<string, number>();
  for (const l of lessons) totals.set(l.material_id, Math.max(totals.get(l.material_id) ?? 0, l.sections_total));
  const byMat = new Map<string, typeof progress>();
  for (const p of progress) byMat.set(p.material_id, [...(byMat.get(p.material_id) ?? []), p]);
  return [...byMat.entries()].flatMap(([id, rows]) => {
    const total = totals.get(id);
    const title = materials.find((m) => m.id === id)?.title;
    if (!total || !title) return [];
    const status = new Map(rows.map((r) => [r.section, r.status]));
    const review = rows.find((r) => r.status === 'review');
    let next = review?.section ?? 1;
    if (!review) while (status.get(next) === 'understood' && next < total) next++;
    return [{ materialId: id, title, understood: rows.filter((r) => r.status === 'understood').length, total, next, review: Boolean(review), lastStudied: rows[0]!.updated_at }];
  });
}
