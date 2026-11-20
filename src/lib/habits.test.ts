import { describe, expect, it } from 'vitest';
import { addDays, countThisWeek, currentStreak, milestoneProgress, recentDays, weekStart } from './habits';

const set = (...d: string[]) => new Set(d);
// 2026-11-20 is a Friday.
const today = '2026-11-20';

describe('date helpers', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
  it('finds Monday', () => {
    expect(weekStart('2026-11-20')).toBe('2026-11-16');
    expect(weekStart('2026-11-16')).toBe('2026-11-16');
    expect(weekStart('2026-11-22')).toBe('2026-11-16'); // Sunday
  });
});

describe('daily streak', () => {
  it('counts consecutive days including today', () => {
    expect(currentStreak(set('2026-11-18', '2026-11-19', '2026-11-20'), today, 7)).toEqual({ value: 3, unit: 'day' });
  });
  it('does not break just because today is not done yet', () => {
    expect(currentStreak(set('2026-11-18', '2026-11-19'), today, 7).value).toBe(2);
  });
  it('breaks on a missed day', () => {
    expect(currentStreak(set('2026-11-17', '2026-11-19', '2026-11-20'), today, 7).value).toBe(2);
    expect(currentStreak(set('2026-11-18'), today, 7).value).toBe(0);
  });
});

describe('weekly streak (3× per week)', () => {
  const lastWeek = ['2026-11-09', '2026-11-11', '2026-11-13'];
  const weekBefore = ['2026-11-02', '2026-11-04', '2026-11-06'];
  it('counts completed weeks; current week counts once met', () => {
    expect(currentStreak(set(...weekBefore, ...lastWeek, '2026-11-16', '2026-11-18', '2026-11-20'), today, 3)).toEqual({ value: 3, unit: 'week' });
  });
  it('current week in progress does not break the streak', () => {
    expect(currentStreak(set(...weekBefore, ...lastWeek, '2026-11-16'), today, 3).value).toBe(2);
  });
  it('a short week breaks it', () => {
    expect(currentStreak(set(...weekBefore, '2026-11-09', '2026-11-11'), today, 3).value).toBe(0);
  });
  it('counts this week so far', () => {
    expect(countThisWeek(set('2026-11-15', '2026-11-16', '2026-11-20', '2026-11-21'), today)).toBe(2);
  });
});

describe('recentDays / milestoneProgress', () => {
  it('lists the last 7 days oldest first', () => {
    const r = recentDays(set('2026-11-14', '2026-11-20'), today);
    expect(r.map((x) => x.date)).toEqual(['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']);
    expect(r.filter((x) => x.done)).toHaveLength(2);
  });
  it('computes milestone percent', () => {
    expect(milestoneProgress([])).toBeNull();
    expect(milestoneProgress([{ done_at: 'x' }, { done_at: null }, { done_at: null }])).toBe(33);
    expect(milestoneProgress([{ done_at: 'x' }])).toBe(100);
  });
});
