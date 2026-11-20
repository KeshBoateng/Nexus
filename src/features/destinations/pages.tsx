import { Link } from 'react-router';
import { ChevronRight, GraduationCap, Target, Wallet, type LucideIcon } from 'lucide-react';
import { useGoals } from '../goals/api';
import { HabitRow } from '../goals/HabitRow';
import { useRunner } from '../../lib/useRunner';
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

function Coming({ items }: { items: { name: string; phase: number }[] }) {
  return (
    <ul className="divide-y divide-border">
      {items.map((i) => (
        <li key={i.name} className="flex items-center justify-between py-3 text-[15px]">
          <span>{i.name}</span>
          <span className="text-xs text-text-faint tabular">Phase {i.phase}</span>
        </li>
      ))}
    </ul>
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

      <TodayPanel tz={tz} />
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
      title="Needs attention"
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

export function DevelopmentPage() {
  return (
    <>
      <PageHeader path="/development" />
      <Panel>
        <Coming
          items={[
            { name: 'Technical track', phase: 4 },
            { name: 'Leadership and management track', phase: 4 },
            { name: 'Entrepreneurship and business track', phase: 4 },
          ]}
        />
      </Panel>
    </>
  );
}

export function ProjectsPage() {
  return (
    <>
      <PageHeader path="/projects" />
      <Panel>
        <Coming
          items={[
            { name: 'Projects, tasks and milestones', phase: 2 },
            { name: 'Team members and responsibility tracking', phase: 2 },
            { name: 'Leadership coaching', phase: 4 },
          ]}
        />
      </Panel>
    </>
  );
}

export function IntelligencePage() {
  return (
    <>
      <PageHeader path="/intelligence" />
      <Panel>
        <Coming
          items={[
            { name: 'Personal Memory Centre', phase: 3 },
            { name: 'NEXUS assistant and recommendations', phase: 4 },
            { name: 'Opportunity Radar', phase: 6 },
          ]}
        />
      </Panel>
    </>
  );
}
