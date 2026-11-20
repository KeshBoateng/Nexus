import { BrainCircuit, FolderKanban, House, Sprout, UserRound, type LucideIcon } from 'lucide-react';

export interface Destination {
  path: string;
  label: string;
  icon: LucideIcon;
  /** One line describing the destination's purpose (shown on its page). */
  purpose: string;
}

/** The five primary destinations (spec §2). Settings deliberately sits outside this list. */
export const DESTINATIONS: readonly Destination[] = [
  { path: '/', label: 'Home', icon: House, purpose: 'Your daily command centre.' },
  { path: '/life', label: 'My Life', icon: UserRound, purpose: 'Academics, finances, goals and habits.' },
  { path: '/development', label: 'Development', icon: Sprout, purpose: 'Technical, leadership and entrepreneurship growth.' },
  { path: '/projects', label: 'Projects', icon: FolderKanban, purpose: 'Assignments, ventures and team work in one place.' },
  { path: '/intelligence', label: 'Intelligence', icon: BrainCircuit, purpose: 'Talk to NEXUS, review insights and memory.' },
];
