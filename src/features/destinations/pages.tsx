import { Link } from 'react-router';
import { ChevronRight, GraduationCap, Target, Wallet, type LucideIcon } from 'lucide-react';
import { useGoals } from '../goals/api';
import { HabitRow } from '../goals/HabitRow';
import { useRunner } from '../../lib/useRunner';
import { stateOf, useProjects } from '../projects/api';
import { nextSteps, projectHealth } from '../../lib/projectHealth';
import { HEALTH_STYLE } from '../projects/healthStyle';
import { BriefingPanel } from '../briefing/BriefingPanel';
import { DESTINATIONS } from '../../app/navigation';
import { useProfile } from '../profile/ProfileProvider';
import { Panel } from '../../components/ui';
import { useAcademics } from '../academics/useAcademics';
import { useFinances } from '../finances/api';
import { computeGpa, formatGpa } from '../../lib/gpa';
import { describeDue, todayIn } from '../../lib/dates';
import { budgetProgress, monthKey, monthTotals, netWorthByCurrency, spendingByCategory } from '../../lib/finance';
import { formatMoney } from '../../lib/money';

/**
 * Phase 1 destinations. They are honest about what exists: no sample data, no fake charts.
 * Each lists what the destination will hold and which roadmap phase delivers it.
 */

function PageHeader({ path, title }: { path: string; title?: string }) {
  const d = DESTINATIONS.find((x) => x.path === path)!;
  return (
    <header className="mb-8">
      <h1 className="text-[28px] font-semibold tracking-tight">{title ?? d.label}</h1>
      <p className="mt-1 text-[15px] text-text-muted">{d.purpose}</p>
    </header>
  );
}

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function HomePage() {
  const { profile, error } = useProfile();
  const now = new Date();
  const tz = profile?.timezone ?? 'Africa/Accra';
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: tz }).format(now));
  const date = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).format(now);
  const name = profile?.display_name;

  return (
    <div className="space-y-6">
      <header className="mb-2">
        <p className="text-sm text-text-faint">{date}</p>
        <h1 className="mt-1 text-[28px] font-semibold tracking-tight">
          {greeting(hour)}
          {name ? `, ${name}` : ''}.
        </h1>
      </header>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      <BriefingPanel today={todayIn(tz)} currency={profile?.default_currency ?? 'GHS'} />
      <TodayPanel tz={tz} />
      <ProjectsPanel tz={tz} />
      <HabitsPanel tz={tz} />
      <MoneyPanel tz={tz} currency={profile?.default_currency ?? 'GHS'} />

      {!name && (
        <Panel title="Finish your profile">
          <p className="text-[15px] text-text-muted">
            Tell NEXUS your name, timezone and currency in{' '}
            <Link to="/settings" className="text-accent hover:underline">Settings</Link>.
          </p>
        </Panel>
      )}
    </div>
  );
}

/** Deterministic "what needs attention": overdue + due within 7 days, from recorded assessments. */
function TodayPanel({ tz }: { tz: string }) {
  const { data, error } = useAcademics();
  if (error) return <p role="alert" className="text-sm text-danger">{error}</p>;
  if (!data) return null;

  const now = new Date();
  const horizon = now.getTime() + 7 * 86_400_000;
  const courseById = new Map(data.courses.map((c) => [c.id, c]));
  const due = data.assessments
    .filter((a) => !a.completed_at && a.due_at && Date.parse(a.due_at) <= horizon)
    .slice(0, 5);
  const cgpa = computeGpa(data.courses, data.bands).gpa;

  if (data.courses.length === 0) {
    return (
      <Panel title="Get started">
        <p className="text-[15px] leading-relaxed text-text-muted">
          NEXUS briefs you from what you record. Add your current semester and courses in{' '}
          <Link to="/life/academics" className="text-accent hover:underline">Academics</Link>.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Upcoming deadlines"
      action={
        <Link to="/life/academics" className="text-sm text-text-muted hover:text-text">
          CGPA <span className="tabular font-semibold text-text">{formatGpa(cgpa)}</span>
        </Link>
      }
    >
      {due.length === 0 ? (
        <p className="text-[15px] text-text-muted">Nothing due in the next 7 days.</p>
      ) : (
        <ul className="divide-y divide-border">
          {due.map((a) => {
            const d = describeDue(a.due_at!, now, tz);
            const c = courseById.get(a.course_id);
            return (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px]">{a.title}</p>
                  <p className="text-xs text-text-faint">{c?.code ?? c?.title}</p>
                </div>
                <span className={`shrink-0 text-xs tabular ${d.overdue ? 'text-danger' : d.soon ? 'text-accent' : 'text-text-muted'}`}>
                  {d.text}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function ModuleCard({ to, icon: Icon, title, sub, figureLabel, figure }: { to: string; icon: LucideIcon; title: string; sub: string; figureLabel: string; figure: string }) {
  return (
    <Link to={to} className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-accent">
      <Icon className="size-6 shrink-0 text-accent" strokeWidth={1.75} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[17px] font-semibold tracking-tight">{title}</p>
        <p className="truncate text-sm text-text-muted">{sub}</p>
      </div>
      <div className="text-right">
        <p className="text-xs text-text-faint">{figureLabel}</p>
        <p className="tabular text-[19px] font-semibold">{figure}</p>
      </div>
      <ChevronRight className="size-5 shrink-0 text-text-faint" aria-hidden />
    </Link>
  );
}

export function MyLifePage() {
  const { data } = useAcademics();
  const { data: fin } = useFinances();
  const { data: goals } = useGoals();
  const { profile } = useProfile();
  const currency = profile?.default_currency ?? 'GHS';
  const cgpa = data ? formatGpa(computeGpa(data.courses, data.bands).gpa) : '…';
  const open = data?.assessments.filter((a) => !a.completed_at).length ?? 0;
  const worth = fin
    ? formatMoney(
        netWorthByCurrency(fin.accounts.map((a) => ({ currency: a.currency, balance_minor: fin.balances.get(a.id) ?? 0 })))[currency] ?? 0,
        currency,
      )
    : '…';
  return (
    <div className="space-y-4">
      <PageHeader path="/life" />
      <ModuleCard
        to="/life/academics"
        icon={GraduationCap}
        title="Academics"
        sub={open > 0 ? `${open} open deadline${open === 1 ? '' : 's'}` : 'Terms, courses, deadlines'}
        figureLabel="CGPA"
        figure={cgpa}
      />
      <ModuleCard
        to="/life/finances"
        icon={Wallet}
        title="Finances"
        sub={fin && fin.accounts.length > 0 ? `${fin.accounts.filter((a) => !a.archived_at).length} accounts` : 'Accounts, spending, budgets'}
        figureLabel="Net worth"
        figure={worth}
      />
      <ModuleCard
        to="/life/goals"
        icon={Target}
        title="Goals & habits"
        sub={goals ? `${goals.habits.filter((h) => !h.archived_at).length} habits` : 'Goals, milestones, habits'}
        figureLabel="Active goals"
        figure={goals ? String(goals.goals.filter((g) => g.status === 'active').length) : '…'}
      />
    </div>
  );
}

/** Projects that are at risk or off track, with their top next step, plus your own tasks due this week. */
function ProjectsPanel({ tz }: { tz: string }) {
  const { data } = useProjects();
  if (!data) return null;
  const today = todayIn(tz);
  const week = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
  const open = data.projects.filter((p) => p.status === 'active' || p.status === 'planning');
  const flagged = open
    .map((p) => ({ p, s: stateOf(data, p) }))
    .map(({ p, s }) => ({ p, h: projectHealth(s, today), step: nextSteps(s, today, 1)[0] }))
    .filter((x) => x.h === 'at_risk' || x.h === 'off_track');
  const meIds = new Set(data.members.filter((m) => m.is_me).map((m) => m.id));
  const myTasks = data.tasks
    .filter((t) => t.status !== 'done' && t.assignee_member_id && meIds.has(t.assignee_member_id) && t.due_on && t.due_on <= week)
    .sort((a, b) => (a.due_on! < b.due_on! ? -1 : 1))
    .slice(0, 5);
  if (flagged.length === 0 && myTasks.length === 0) return null;
  const name = (id: string) => data.projects.find((p) => p.id === id)?.name ?? '';

  return (
    <Panel title="Projects">
      {flagged.length > 0 && (
        <ul className="space-y-2">
          {flagged.map(({ p, h, step }) => (
            <li key={p.id}>
              <Link to={`/projects/${p.id}`} className="block rounded-lg py-1 hover:bg-surface-raised">
                <p className="text-[15px]">
                  {p.name} <span className={`text-xs ${HEALTH_STYLE[h].cls}`}>· {HEALTH_STYLE[h].label}</span>
                </p>
                {step && <p className="text-sm text-text-muted">→ {step.title}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {myTasks.length > 0 && (
        <>
          <p className={`text-xs text-text-faint ${flagged.length ? 'mt-4' : ''}`}>Your tasks this week</p>
          <ul className="divide-y divide-border">
            {myTasks.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[15px]">{t.title}</p>
                  <p className="truncate text-xs text-text-faint">{name(t.project_id)}</p>
                </div>
                <span className={`tabular shrink-0 text-xs ${t.due_on! < today ? 'text-danger' : 'text-text-muted'}`}>{t.due_on}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

/** Today's habits with one-tap check-off. */
function HabitsPanel({ tz }: { tz: string }) {
  const { data, reload } = useGoals();
  const { run } = useRunner(reload);
  if (!data) return null;
  const habits = data.habits.filter((h) => !h.archived_at);
  if (habits.length === 0) return null;
  const today = todayIn(tz);
  const done = habits.filter((h) => data.checkins.some((c) => c.habit_id === h.id && c.on_date === today)).length;
  return (
    <Panel
      title="Today's habits"
      action={
        <span className="tabular text-sm text-text-muted">
          {done}/{habits.length}
        </span>
      }
    >
      <div className="divide-y divide-border">
        {habits.map((h) => (
          <HabitRow
            key={h.id}
            habit={h}
            dates={new Set(data.checkins.filter((c) => c.habit_id === h.id).map((c) => c.on_date))}
            today={today}
            run={run}
            compact
          />
        ))}
      </div>
    </Panel>
  );
}

/** Month spending and budgets at or over 80%, from recorded transactions only. */
function MoneyPanel({ tz, currency }: { tz: string; currency: string }) {
  const { data } = useFinances();
  if (!data || data.accounts.length === 0) return null;
  const month = monthKey(todayIn(tz));
  const byId = new Map(data.accounts.map((a) => [a.id, a]));
  const totals = monthTotals(data.transactions, byId, month);
  const spending = spendingByCategory(data.transactions, byId, month, currency);
  const alerts = data.budgets
    .filter((b) => b.currency === currency)
    .map((b) => ({ b, p: budgetProgress(b.monthly_limit_minor, spending.find((s) => s.category === b.category)?.amount_minor ?? 0) }))
    .filter(({ p }) => p.status !== 'ok');
  return (
    <Panel
      title="Money this month"
      action={
        <Link to="/life/finances" className="text-sm text-text-muted hover:text-text">
          Open
        </Link>
      }
    >
      <p className="tabular text-[15px]">
        <span className="text-text-muted">Spent </span>
        {formatMoney(totals.expense[currency] ?? 0, currency)}
        <span className="text-text-muted"> · In </span>
        {formatMoney(totals.income[currency] ?? 0, currency)}
      </p>
      {alerts.length > 0 && (
        <ul className="mt-3 space-y-1">
          {alerts.map(({ b, p }) => (
            <li key={b.id} className={`text-sm ${p.status === 'over' ? 'text-danger' : 'text-accent'}`}>
              {b.category}: {p.status === 'over' ? `over budget by ${formatMoney(-p.remaining_minor, currency)}` : `${p.percent}% of budget used`}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
