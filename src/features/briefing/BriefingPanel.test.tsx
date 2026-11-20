import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Briefing, Rec } from './api';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const rec = (n: number, o: Partial<Rec>): Rec => ({
  id: id(n),
  rule_type: 'academic.deadline',
  rule_key: `k${n}`,
  category: 'academic',
  kind: 'immediate',
  title: `Rec ${n}`,
  action: 'Do it',
  why: 'Because',
  benefit: null,
  evidence: ['DCIT 201 · Lab 2 · due 2026-11-21'],
  priority: 85,
  est_minutes: 60,
  due_on: '2026-11-21',
  essential: true,
  shown_on: '2026-11-20',
  status: 'open',
  ...o,
});

const data: Briefing = {
  date: '2026-11-20',
  items: [
    rec(1, { title: 'Due in 1 day: Lab 2' }),
    rec(2, { title: 'DCIT 208: Clarify ownership of 2 tasks', category: 'leadership', kind: 'preventive', priority: 60, essential: false, status: 'completed' }),
  ],
  ratings: new Map([[id(2), 'very_useful' as const]]),
};

const act = vi.fn(async () => {});
const rate = vi.fn(async () => {});
vi.mock('./api', async (orig) => ({
  ...(await orig<typeof import('./api')>()),
  useBriefing: () => ({ data, error: null, reload: async () => {}, refresh: async () => {} }),
  act: (...a: unknown[]) => act(...(a as [])),
  rate: (...a: unknown[]) => rate(...(a as [])),
}));

const { BriefingPanel } = await import('./BriefingPanel');

describe('BriefingPanel', () => {
  it('shows reasoning with evidence and records lifecycle and feedback separately', async () => {
    render(<BriefingPanel today="2026-11-20" currency="GHS" />);
    expect(screen.getByText('Due in 1 day: Lab 2')).toBeInTheDocument();

    fireEvent.click(screen.getAllByText(/^Why\?/)[0]!);
    expect(screen.getByText('DCIT 201 · Lab 2 · due 2026-11-21')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Done' })[0]!);
    await vi.waitFor(() => expect(act).toHaveBeenCalledWith(expect.objectContaining({ id: id(1) }), 'completed'));

    // "Not useful" asks for an optional reason before sending
    fireEvent.click(screen.getAllByRole('button', { name: 'Not useful' })[0]!);
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason' }), { target: { value: 'I already submitted it' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await vi.waitFor(() => expect(rate).toHaveBeenCalledWith(expect.objectContaining({ id: id(1) }), 'not_useful', 'I already submitted it'));

    // Completed leadership item offers "applied" (distinct from done), and shows its rating
    expect(screen.getByRole('button', { name: /I applied this/ })).toBeInTheDocument();
    expect(screen.getByText('You rated this: Very useful')).toBeInTheDocument();
  });
});
