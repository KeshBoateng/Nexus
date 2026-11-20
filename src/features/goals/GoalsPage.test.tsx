import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { GoalsData } from './api';
import { addDays } from '../../lib/habits';
import { todayIn } from '../../lib/dates';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const today = todayIn('Africa/Accra');

const data: GoalsData = {
  goals: [
    { id: id(1), title: 'Pass CCNA', why: 'Network engineering internship', area: 'technical', horizon: 'short', target_date: null, status: 'active', closed_at: null },
  ],
  milestones: [
    { id: id(2), goal_id: id(1), title: 'Subnetting', due_on: null, done_at: '2026-11-01T00:00:00Z' },
    { id: id(3), goal_id: id(1), title: 'Routing', due_on: null, done_at: null },
    { id: id(4), goal_id: id(1), title: 'Mock exam', due_on: null, done_at: null },
    { id: id(5), goal_id: id(1), title: 'Book exam', due_on: null, done_at: null },
  ],
  habits: [{ id: id(10), name: 'Read 20 minutes', target_per_week: 7, archived_at: null }],
  checkins: [0, 1, 2].map((i) => ({ id: id(20 + i), habit_id: id(10), on_date: addDays(today, -i) })),
};

vi.mock('./api', async (orig) => ({
  ...(await orig<typeof import('./api')>()),
  useGoals: () => ({ data, error: null, reload: async () => {} }),
}));
vi.mock('../profile/ProfileProvider', () => ({ useProfile: () => ({ profile: { timezone: 'Africa/Accra' } }) }));

const { GoalsPage } = await import('./GoalsPage');

describe('GoalsPage', () => {
  it('shows habit streak and goal milestone progress', () => {
    render(
      <MemoryRouter>
        <GoalsPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Read 20 minutes')).toBeInTheDocument();
    expect(screen.getByText(/3 days/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo Read 20 minutes for today' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('progressbar', { name: 'Pass CCNA progress' })).toHaveAttribute('aria-valuenow', '25');
    expect(screen.getByText('1/4')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Pass CCNA/ }));
    expect(screen.getByText('Routing')).toBeInTheDocument();
    expect(screen.getByText(/Network engineering internship/)).toBeInTheDocument();
  });
});
