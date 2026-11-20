import { describe, expect, it } from 'vitest';
import { PreferencesUpdateSchema, ProfileUpdateSchema } from './api';

describe('client-side write validation', () => {
  it('strips non-whitelisted fields from profile updates', () => {
    const parsed = ProfileUpdateSchema.parse({
      display_name: ' Kwame ',
      timezone: 'Africa/Accra',
      default_currency: 'GHS',
      id: 'someone-else',
    } as never);
    expect(parsed).toEqual({ display_name: 'Kwame', timezone: 'Africa/Accra', default_currency: 'GHS' });
  });

  it('rejects lowercase currency codes', () => {
    expect(() => ProfileUpdateSchema.parse({ display_name: null, timezone: 'UTC', default_currency: 'ghs' })).toThrow();
  });

  it('requires quiet hours to be both set or both empty', () => {
    const base = { theme: 'dark', briefing_time: '06:30', ai_enabled: false } as const;
    expect(() => PreferencesUpdateSchema.parse({ ...base, quiet_hours_start: '22:00', quiet_hours_end: null })).toThrow();
    expect(PreferencesUpdateSchema.parse({ ...base, quiet_hours_start: '22:00', quiet_hours_end: '06:00' })).toBeTruthy();
    expect(PreferencesUpdateSchema.parse({ ...base, quiet_hours_start: null, quiet_hours_end: null })).toBeTruthy();
  });
});
