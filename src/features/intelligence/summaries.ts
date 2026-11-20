/**
 * Short, factual summaries per category for the AI context. Only categories the user has
 * allowed are fetched at all; the server filters again. Computed with the same deterministic
 * functions the app uses, so the AI sees the app's numbers — it never computes its own.
 */
import type { AiCategory } from '../../lib/aiContext';
import { computeGpa, formatGpa } from '../../lib/gpa';
import { formatMoney } from '../../lib/money';
import { budgetProgress, monthKey, monthTotals, netWorthByCurrency, spendingByCategory } from '../../lib/finance';
import { milestoneProgress } from '../../lib/habits';
import { projectHealth, summarize } from '../../lib/projectHealth';
import { LEVEL_LABEL, estimateLevel } from '../../lib/proficiency';
import { fetchAcademics } from '../academics/api';
import { fetchFinances } from '../finances/api';
import { fetchGoals } from '../goals/api';
import { fetchProjects, stateOf } from '../projects/api';
import { fetchDev } from '../development/api';

export async function buildSummaries(allowed: Record<AiCategory, boolean>, today: string, currency: string): Promise<Partial<Record<AiCategory, string[]>>> {
  const out: Partial<Record<AiCategory, string[]>> = {};
  const jobs: Promise<void>[] = [];

  if (allowed.academics)
    jobs.push(
      fetchAcademics().then((a) => {
        const lines = [`CGPA: ${formatGpa(computeGpa(a.courses, a.bands).gpa)}`];
        for (const t of a.terms) lines.push(`Term ${t.name}: GPA ${formatGpa(computeGpa(a.courses.filter((c) => c.term_id === t.id), a.bands).gpa)}, ${a.courses.filter((c) => c.term_id === t.id).length} courses`);
        const label = new Map(a.courses.map((c) => [c.id, c.code ?? c.title]));
        for (const x of a.assessments.filter((x) => !x.completed_at && x.due_at).slice(0, 10)) lines.push(`Due ${x.due_at!.slice(0, 10)}: ${label.get(x.course_id)} — ${x.title} (${x.kind})`);
        out.academics = lines;
      }),
    );

  if (allowed.finances)
    jobs.push(
      fetchFinances().then((f) => {
        const byId = new Map(f.accounts.map((x) => [x.id, x]));
        const worth = netWorthByCurrency(f.accounts.map((x) => ({ currency: x.currency, balance_minor: f.balances.get(x.id) ?? 0 })));
        const m = monthKey(today);
        const t = monthTotals(f.transactions, byId, m);
        const lines = Object.entries(worth).map(([c, v]) => `Net worth (${c}): ${formatMoney(v, c)}`);
        lines.push(`This month: in ${formatMoney(t.income[currency] ?? 0, currency)}, out ${formatMoney(t.expense[currency] ?? 0, currency)}`);
        const spend = spendingByCategory(f.transactions, byId, m, currency);
        for (const s of spend.slice(0, 6)) lines.push(`Spent on ${s.category} this month: ${formatMoney(s.amount_minor, currency)}`);
        for (const b of f.budgets.filter((b) => b.currency === currency)) {
          const p = budgetProgress(b.monthly_limit_minor, spend.find((s) => s.category === b.category)?.amount_minor ?? 0);
          lines.push(`Budget ${b.category}: ${p.percent}% used of ${formatMoney(b.monthly_limit_minor, currency)}`);
        }
        out.finances = lines;
      }),
    );

  if (allowed.goals)
    jobs.push(
      fetchGoals().then((g) => {
        const lines = g.goals
          .filter((x) => x.status === 'active')
          .map((x) => {
            const pct = milestoneProgress(g.milestones.filter((m) => m.goal_id === x.id));
            return `Goal (${x.area}, ${x.horizon}-term): ${x.title}${pct === null ? '' : ` — ${pct}% of milestones done`}`;
          });
        for (const h of g.habits.filter((x) => !x.archived_at)) lines.push(`Habit: ${h.name} (${h.target_per_week === 7 ? 'daily' : `${h.target_per_week}x/week`})`);
        out.goals = lines;
      }),
    );

  if (allowed.projects)
    jobs.push(
      fetchProjects().then((p) => {
        out.projects = p.projects
          .filter((x) => x.status === 'active' || x.status === 'planning')
          .map((x) => {
            const s = stateOf(p, x);
            const sum = summarize(s, today);
            return `Project ${x.name} (${x.kind}): ${projectHealth(s, today).replace('_', ' ')}, ${sum.done}/${s.tasks.length} tasks done, ${sum.overdue.length} overdue, ${sum.unassigned.length} unassigned, team of ${s.members.length}`;
          });
      }),
    );

  if (allowed.development)
    jobs.push(
      fetchDev().then((d) => {
        out.development = d.skills.map((s) => `Skill ${s.name} (${s.track}): ${LEVEL_LABEL[estimateLevel(d.evidence.filter((e) => e.skill_id === s.id)).level]} from evidence, target ${LEVEL_LABEL[s.target_level]}`);
      }),
    );

  await Promise.all(jobs);
  return out;
}
