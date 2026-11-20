import { Link } from 'react-router';
import { ChevronRight, GraduationCap } from 'lucide-react';
import { DESTINATIONS } from '../../app/navigation';
import { useProfile } from '../profile/ProfileProvider';
import { Panel } from '../../components/ui';
import { useAcademics } from '../academics/useAcademics';
import { computeGpa, formatGpa } from '../../lib/gpa';
import { describeDue } from '../../lib/dates';

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

export function MyLifePage() {
  const { data } = useAcademics();
  const cgpa = data ? formatGpa(computeGpa(data.courses, data.bands).gpa) : '…';
  const open = data?.assessments.filter((a) => !a.completed_at).length ?? 0;
  return (
    <div className="space-y-4">
      <PageHeader path="/life" />
      <Link
        to="/life/academics"
        className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-accent"
      >
        <GraduationCap className="size-6 text-accent" strokeWidth={1.75} aria-hidden />
        <div className="flex-1">
          <p className="text-[17px] font-semibold tracking-tight">Academics</p>
          <p className="text-sm text-text-muted">
            {open > 0 ? `${open} open deadline${open === 1 ? '' : 's'}` : 'Terms, courses, deadlines'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-text-faint">CGPA</p>
          <p className="tabular text-[22px] font-semibold">{cgpa}</p>
        </div>
        <ChevronRight className="size-5 text-text-faint" aria-hidden />
      </Link>
      <Panel>
        <Coming
          items={[
            { name: 'Finances — accounts, transactions, budgets (GHS)', phase: 2 },
            { name: 'Goals and habits', phase: 2 },
          ]}
        />
      </Panel>
    </div>
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
