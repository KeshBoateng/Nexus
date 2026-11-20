import { describe, expect, it } from 'vitest';
import { activeSources, isQuiet, isoWeek, localParts, reminders, shouldPush, type ReminderInput } from './reminders';

// 2026-11-20 is a Friday; Africa/Accra is UTC+0.
const base: ReminderInput = {
  now: '2026-11-20T10:00:00Z',
  timeZone: 'Africa/Accra',
  briefingTime: '06:30:00',
  accountability: false,
  assessments: [],
  habits: [],
  myTasks: [],
  budgetsOver: [],
  weekDone: 0,
};
const keys = (i: Partial<ReminderInput>) => reminders({ ...base, ...i }).map((r) => r.dedupe_key);

describe('time helpers', () => {
  it('reads local date/time in the user timezone', () => {
    expect(localParts('2026-11-20T23:30:00Z', 'Africa/Accra')).toMatchObject({ date: '2026-11-20', minutes: 23 * 60 + 30, weekday: 5 });
    expect(localParts('2026-11-20T23:30:00Z', 'Africa/Lagos')).toMatchObject({ date: '2026-11-21', minutes: 30, weekday: 6 });
  });
  it('handles quiet hours across midnight', () => {
    expect(isQuiet(23 * 60, '22:00', '06:30')).toBe(true);
    expect(isQuiet(5 * 60, '22:00:00', '06:30:00')).toBe(true);
    expect(isQuiet(7 * 60, '22:00', '06:30')).toBe(false);
    expect(isQuiet(13 * 60, '12:00', '14:00')).toBe(true);
    expect(isQuiet(13 * 60, null, null)).toBe(false);
  });
  it('computes ISO weeks', () => {
    expect(isoWeek('2026-11-20')).toBe('2026-W47');
    expect(isoWeek('2027-01-01')).toBe('2026-W53');
    expect(isoWeek('2026-01-01')).toBe('2026-W01');
  });
});

describe('reminders', () => {
  it('warns about assessments due within 24 h, high priority inside 6 h, and overdue once', () => {
    const r = reminders({
      ...base,
      assessments: [
        { id: 'a', title: 'Lab 2', course: 'DCIT 201', due_at: '2026-11-20T14:00:00Z', completed: false },
        { id: 'b', title: 'Essay', course: 'UGRC', due_at: '2026-11-21T08:00:00Z', completed: false },
        { id: 'c', title: 'Quiz', course: 'MATH', due_at: '2026-11-19T08:00:00Z', completed: false },
        { id: 'd', title: 'Far', course: 'X', due_at: '2026-11-25T08:00:00Z', completed: false },
        { id: 'e', title: 'Done', course: 'X', due_at: '2026-11-20T12:00:00Z', completed: true },
      ],
    });
    expect(r.map((x) => [x.dedupe_key, x.priority])).toEqual([
      ['assessment:a:due24', 'high'],
      ['assessment:b:due24', 'normal'],
      ['assessment:c:overdue', 'high'],
    ]);
  });

  it('announces the briefing only in the 3 hours after briefing time', () => {
    expect(keys({ now: '2026-11-20T06:00:00Z' })).not.toContain('briefing:2026-11-20');
    expect(keys({ now: '2026-11-20T06:45:00Z' })).toContain('briefing:2026-11-20');
    expect(keys({ now: '2026-11-20T10:00:00Z' })).not.toContain('briefing:2026-11-20');
  });

  it('nudges about unfinished daily habits in the evening only', () => {
    const habits = [
      { id: 'h1', name: 'Read', daily: true, doneToday: false },
      { id: 'h2', name: 'Gym', daily: false, doneToday: false },
      { id: 'h3', name: 'Pray', daily: true, doneToday: true },
    ];
    expect(keys({ habits, now: '2026-11-20T15:00:00Z' })).toEqual([]);
    const r = reminders({ ...base, habits, now: '2026-11-20T19:30:00Z' });
    expect(r).toEqual([expect.objectContaining({ dedupe_key: 'habits:2026-11-20', title: '1 habit left today', body: 'Read' })]);
  });

  it('reminds about my project tasks due today or tomorrow', () => {
    const myTasks = [
      { id: 't1', title: 'Slides', project: 'DCIT 208', due_on: '2026-11-20', done: false },
      { id: 't2', title: 'Report', project: 'DCIT 208', due_on: '2026-11-21', done: false },
      { id: 't3', title: 'Later', project: 'X', due_on: '2026-11-25', done: false },
    ];
    expect(reminders({ ...base, myTasks }).map((r) => [r.dedupe_key, r.title])).toEqual([
      ['task:t1:due', 'Slides — due today'],
      ['task:t2:due', 'Report — due tomorrow'],
    ]);
  });

  it('accountability mode: daily overdue summary at briefing time and a Sunday check-in, constructive wording', () => {
    const input = {
      accountability: true,
      assessments: [{ id: 'c', title: 'Quiz', course: 'M', due_at: '2026-11-19T08:00:00Z', completed: false }],
      myTasks: [{ id: 't', title: 'x', project: 'p', due_on: '2026-11-18', done: false }],
    };
    const morning = reminders({ ...base, ...input, now: '2026-11-20T07:00:00Z' }).find((r) => r.dedupe_key === 'accountability:2026-11-20')!;
    expect(morning.title).toBe('2 commitments are overdue');
    expect(morning.body).not.toMatch(/fail|lazy|should have/i);
    expect(keys({ ...input, accountability: false, now: '2026-11-20T07:00:00Z' })).not.toContain('accountability:2026-11-20');
    const sunday = reminders({ ...base, ...input, weekDone: 4, now: '2026-11-22T18:30:00Z' }).find((r) => r.dedupe_key.startsWith('weekly:'))!;
    expect(sunday.body).toContain('completed 4 tasks');
    expect(sunday.link).toBe('/review');
  });
});

describe('opportunity deadlines', () => {
  it('reminds 7 days and 1 day before, only while still open', () => {
    const opportunities = [
      { id: 'o1', title: 'MTN internship', deadline: '2026-11-25', open: true },
      { id: 'o2', title: 'Scholarship', deadline: '2026-11-21', open: true },
      { id: 'o3', title: 'Applied already', deadline: '2026-11-21', open: false },
      { id: 'o4', title: 'Far away', deadline: '2026-12-30', open: true },
    ];
    expect(reminders({ ...base, opportunities }).map((r) => [r.dedupe_key, r.title, r.link])).toEqual([
      ['opportunity:o1:d7', 'MTN internship closes in 5 days', '/radar'],
      ['opportunity:o2:d1', 'Scholarship closes tomorrow', '/radar'],
    ]);
    expect(activeSources({ ...base, opportunities }).has('opportunity:o3')).toBe(false);
  });
});

describe('suppression and push decisions', () => {
  it('treats completed items as inactive sources', () => {
    const s = activeSources({
      ...base,
      assessments: [
        { id: 'a', title: 'x', course: 'c', due_at: null, completed: false },
        { id: 'b', title: 'x', course: 'c', due_at: null, completed: true },
      ],
    });
    expect(s.has('assessment:a')).toBe(true);
    expect(s.has('assessment:b')).toBe(false);
  });

  const n = { category: 'academic' as const, created_at: '2026-11-20T09:00:00Z', pushed_at: null, read_at: null, dismissed_at: null, snoozed_until: null };
  it('pushes fresh, unread, allowed items outside quiet hours', () => {
    expect(shouldPush(n, true, false, '2026-11-20T10:00:00Z')).toBe(true);
  });
  it('holds during quiet hours, snooze, or when push is off for the category', () => {
    expect(shouldPush(n, true, true, '2026-11-20T10:00:00Z')).toBe(false);
    expect(shouldPush(n, false, false, '2026-11-20T10:00:00Z')).toBe(false);
    expect(shouldPush({ ...n, snoozed_until: '2026-11-20T11:00:00Z' }, true, false, '2026-11-20T10:00:00Z')).toBe(false);
  });
  it('never pushes twice, after reading, or stale items', () => {
    expect(shouldPush({ ...n, pushed_at: 'x' }, true, false, '2026-11-20T10:00:00Z')).toBe(false);
    expect(shouldPush({ ...n, read_at: 'x' }, true, false, '2026-11-20T10:00:00Z')).toBe(false);
    expect(shouldPush(n, true, false, '2026-11-21T10:00:00Z')).toBe(false);
  });
});
