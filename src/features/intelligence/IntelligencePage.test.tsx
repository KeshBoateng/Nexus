import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { IntelData } from './api';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const mem = (n: number, o: Partial<IntelData['memories'][number]>) => ({
  id: id(n),
  content: `Memory ${n}`,
  kind: 'fact' as const,
  topic: 'personal' as const,
  source: 'user',
  confidence: null,
  confirmed_at: null,
  expires_on: null,
  ai_visible: true,
  sensitive: false,
  created_at: '2026-11-20T00:00:00Z',
  ...o,
});

const data: IntelData = {
  memories: [
    mem(1, { content: 'Long-term ambition: run a tech company', topic: 'ambition' }),
    mem(2, { content: 'Studies best late at night', kind: 'hypothesis', source: 'ai', confidence: 60 }),
    mem(3, { content: 'Has asthma', sensitive: true, ai_visible: false }),
  ],
  permissions: { profile: false, memories: true, academics: false, finances: false, goals: false, projects: false, development: false },
};

let aiEnabled = true;
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), useIntel: () => ({ data, error: null, reload: async () => {} }) }));
vi.mock('../profile/ProfileProvider', () => ({
  useProfile: () => ({
    profile: { timezone: 'Africa/Accra', display_name: 'Kesh', default_currency: 'GHS' },
    preferences: { user_id: id(99), ai_enabled: aiEnabled, theme: 'dark', briefing_time: '06:30', quiet_hours_start: null, quiet_hours_end: null },
    reload: async () => {},
  }),
}));

const { IntelligencePage } = await import('./IntelligencePage');

describe('IntelligencePage', () => {
  it('labels guesses, offers confirm/reject, and the preview withholds sensitive items', () => {
    render(
      <MemoryRouter>
        <IntelligencePage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/1 guess waiting/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'That’s right' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sensitive — never shared/ })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Preview exactly what would be sent'));
    const pre = document.querySelector('pre')!.textContent!;
    expect(pre).toContain('run a tech company');
    expect(pre).toContain('Unconfirmed guess: Studies best late at night');
    expect(pre).not.toContain('asthma');
    expect(screen.getByText(/Withheld: 1 sensitive/)).toBeInTheDocument();
  });

  it('with AI off, the preview is empty and toggles are disabled', () => {
    aiEnabled = false;
    render(
      <MemoryRouter>
        <IntelligencePage />
      </MemoryRouter>,
    );
    expect(screen.getByText('AI features off')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Allow AI to see Personal memory' })).toBeDisabled();
    fireEvent.click(screen.getByText('Preview exactly what would be sent'));
    expect(screen.getByText(/Nothing — AI is off/)).toBeInTheDocument();
  });
});
