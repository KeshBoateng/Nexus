import { Link } from 'react-router';
import { DESTINATIONS } from '../../app/navigation';
import { useProfile } from '../profile/ProfileProvider';
import { Panel } from '../../components/ui';

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

      <Panel title="Your briefing">
        <p className="text-[15px] leading-relaxed text-text-muted">
          NEXUS builds your daily briefing from what you record — courses, deadlines, money, projects and goals.
          Nothing is recorded yet, so there is nothing to brief. Start in{' '}
          <Link to="/life" className="text-accent hover:underline">My Life</Link> once Phase 2 lands.
        </p>
      </Panel>

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

export function MyLifePage() {
  return (
    <>
      <PageHeader path="/life" />
      <Panel>
        <Coming
          items={[
            { name: 'Academics — courses, GPA/CGPA, assessments', phase: 2 },
            { name: 'Finances — accounts, transactions, budgets (GHS)', phase: 2 },
            { name: 'Goals and habits', phase: 2 },
          ]}
        />
      </Panel>
    </>
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
