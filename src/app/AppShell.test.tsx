import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AppShell } from './AppShell';
import { DESTINATIONS } from './navigation';
import { readEnv } from '../lib/env';

describe('AppShell navigation', () => {
  it('exposes exactly the five primary destinations, with Settings outside them', () => {
    render(
      <MemoryRouter initialEntries={['/projects']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="*" element={<p>content</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    const navs = screen.getAllByRole('navigation', { name: 'Primary' });
    for (const nav of navs) {
      const labels = within(nav).getAllByRole('link').map((a) => a.textContent);
      expect(labels).toEqual(['Home', 'My Life', 'Development', 'Projects', 'Intelligence']);
    }
    expect(DESTINATIONS).toHaveLength(5);
    expect(screen.getAllByRole('link', { name: /settings/i }).length).toBeGreaterThan(0);
    for (const nav of navs) {
      expect(within(nav).getByRole('link', { name: 'Projects' })).toHaveAttribute('aria-current', 'page');
    }
  });
});

describe('readEnv', () => {
  it('returns null when config is missing or malformed', () => {
    expect(readEnv({})).toBeNull();
    expect(readEnv({ VITE_SUPABASE_URL: 'not a url', VITE_SUPABASE_PUBLISHABLE_KEY: 'x'.repeat(30) })).toBeNull();
  });
  it('accepts a valid config', () => {
    expect(
      readEnv({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_' + 'x'.repeat(20) }),
    ).not.toBeNull();
  });
});
