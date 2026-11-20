import { describe, expect, it } from 'vitest';
import { describeDue } from './dates';

const now = new Date('2026-11-20T10:00:00Z');

describe('describeDue (Africa/Accra = UTC+0)', () => {
  it('labels overdue items', () => {
    expect(describeDue('2026-11-18T09:00:00Z', now)).toMatchObject({ text: 'Overdue by 2 days', overdue: true });
    expect(describeDue('2026-11-20T08:00:00Z', now)).toMatchObject({ text: 'Overdue · was due 08:00', overdue: true });
  });
  it('labels today, tomorrow and soon', () => {
    expect(describeDue('2026-11-20T14:00:00Z', now)).toMatchObject({ text: 'Today 14:00', soon: true });
    expect(describeDue('2026-11-21T09:30:00Z', now)).toMatchObject({ text: 'Tomorrow 09:30', soon: true });
    expect(describeDue('2026-11-25T09:30:00Z', now)).toMatchObject({ text: 'In 5 days', soon: false });
  });
  it('shows a date beyond a week', () => {
    expect(describeDue('2026-12-10T09:30:00Z', now).text).toBe('10 Dec');
  });
});
