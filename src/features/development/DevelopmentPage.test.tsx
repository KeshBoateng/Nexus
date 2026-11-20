import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { DevData } from './api';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const data: DevData = {
  skills: [{ id: id(1), track: 'technical', name: 'Data structures & algorithms', target_level: 3 }],
  evidence: [
    { id: id(2), skill_id: id(1), kind: 'exercise', description: 'Solved 20 array problems', link: null, occurred_on: '2026-11-01', strength: 2 },
    { id: id(3), skill_id: id(1), kind: 'assessment', description: 'Got A in DCIT 205 midterm', link: null, occurred_on: '2026-10-20', strength: 2 },
  ],
  resources: [{ id: id(4), skill_id: id(1), title: 'My YouTube playlist', url: 'https://youtube.com/x', kind: 'video', difficulty: 'intermediate', objective: null }],
  progress: [{ id: id(5), resource_key: 'catalog:neetcode', status: 'in_progress', understood: null, applied: false }],
};

vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), useDev: () => ({ data, error: null, reload: async () => {} }) }));
vi.mock('../profile/ProfileProvider', () => ({ useProfile: () => ({ profile: { timezone: 'Africa/Accra' } }) }));

const { DevelopmentPage } = await import('./DevelopmentPage');

describe('DevelopmentPage', () => {
  it('estimates level from evidence and adapts the plan (no intro material once Developing)', () => {
    render(<DevelopmentPage />);
    expect(screen.getByText('Developing → Proficient')).toBeInTheDocument();
    expect(screen.getByText('2 pieces of evidence')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Data structures & algorithms/ }));
    expect(screen.getByText(/basics skipped/)).toBeInTheDocument();
    expect(screen.getByText('NeetCode roadmap')).toBeInTheDocument();
    expect(screen.queryByText("CS50's Introduction to Computer Science")).not.toBeInTheDocument();
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getAllByText(/link verified/).length).toBeGreaterThan(0);
    expect(screen.getByText(/intermediate · not verified by NEXUS/)).toBeInTheDocument();
  });
});
