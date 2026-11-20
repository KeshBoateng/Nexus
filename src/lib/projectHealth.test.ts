import { describe, expect, it } from 'vitest';
import { buildAgenda, nextSteps, projectHealth, summarize, type ProjectState, type PTask } from './projectHealth';

const today = '2026-11-20';
const me = { id: 'me', name: 'Me', is_me: true };
const ama = { id: 'ama', name: 'Ama', is_me: false };
const kofi = { id: 'kofi', name: 'Kofi', is_me: false };
const t = (id: string, o: Partial<PTask> = {}): PTask => ({ id, title: `Task ${id}`, assignee_member_id: null, status: 'todo', due_on: null, ...o });

const base = (o: Partial<ProjectState> = {}): ProjectState => ({
  project: { name: 'DCIT 208 group work', kind: 'team', status: 'active', due_on: '2026-12-15' },
  tasks: [],
  members: [me, ama, kofi],
  milestones: [],
  meetings: [{ held_on: '2026-11-15' }],
  ...o,
});

describe('summarize', () => {
  it('counts overdue, unassigned, due soon and percent done', () => {
    const s = summarize(
      base({ tasks: [t('1', { status: 'done' }), t('2', { due_on: '2026-11-18', assignee_member_id: 'ama' }), t('3', { due_on: '2026-11-25' }), t('4')] }),
      today,
    );
    expect(s.overdue.map((x) => x.id)).toEqual(['2']);
    expect(s.unassigned.map((x) => x.id)).toEqual(['3', '4']);
    expect(s.dueSoon.map((x) => x.id)).toEqual(['3']);
    expect(s.percentDone).toBe(25);
    expect(s.daysLeft).toBe(25);
  });
});

describe('projectHealth', () => {
  it('is on track with assigned future work', () => {
    expect(projectHealth(base({ tasks: [t('1', { assignee_member_id: 'ama', due_on: '2026-12-01' })] }), today)).toBe('on_track');
  });
  it('is at risk with one overdue task', () => {
    expect(projectHealth(base({ tasks: [t('1', { assignee_member_id: 'ama', due_on: '2026-11-19' }), t('2', { assignee_member_id: 'ama' })] }), today)).toBe('at_risk');
  });
  it('is at risk when an unassigned task is due within a week', () => {
    expect(projectHealth(base({ tasks: [t('1', { due_on: '2026-11-24' })] }), today)).toBe('at_risk');
  });
  it('is off track when half the open work is overdue or the deadline passed', () => {
    expect(projectHealth(base({ tasks: [t('1', { due_on: '2026-11-01' }), t('2', { due_on: '2026-11-02' }), t('3')] }), today)).toBe('off_track');
    expect(projectHealth(base({ tasks: [t('1', { due_on: '2026-11-01' }), t('2')] }), today)).toBe('at_risk');
    expect(projectHealth(base({ project: { name: 'x', kind: 'team', status: 'active', due_on: '2026-11-19' }, tasks: [t('1')] }), today)).toBe('off_track');
  });
  it('is closed when done', () => {
    expect(projectHealth(base({ project: { name: 'x', kind: 'team', status: 'done', due_on: null } }), today)).toBe('closed');
  });
});

describe('nextSteps', () => {
  it('suggests clarifying ownership when deliverables are unassigned (spec §2.4 example)', () => {
    const steps = nextSteps(base({ tasks: [t('1', { title: 'Report', due_on: '2026-11-23' }), t('2', { title: 'Slides' })] }), today);
    const s = steps.find((x) => x.id === 'assign-owners')!;
    expect(s.priority).toBe('high');
    expect(s.title).toBe('Clarify ownership of 2 tasks');
    expect(s.evidence[0]).toContain('Report, Slides');
    expect(s.skill).toBe('delegation');
  });

  it('names the people to check in with for overdue work', () => {
    const steps = nextSteps(base({ tasks: [t('1', { assignee_member_id: 'ama', due_on: '2026-11-10' }), t('2', { assignee_member_id: 'me', due_on: '2026-11-11' })] }), today);
    const s = steps.find((x) => x.id === 'overdue')!;
    expect(s.action).toContain('Check in with Ama');
    expect(s.action).toContain('finish your own');
  });

  it('asks for a kickoff when no meeting is recorded, check-in after 14 days', () => {
    expect(nextSteps(base({ meetings: [], tasks: [t('1', { assignee_member_id: 'ama' })] }), today).some((s) => s.title === 'Hold a kickoff meeting')).toBe(true);
    expect(nextSteps(base({ meetings: [{ held_on: '2026-11-01' }], tasks: [t('1', { assignee_member_id: 'ama' })] }), today).some((s) => s.id === 'check-in')).toBe(true);
    expect(nextSteps(base({ tasks: [t('1', { assignee_member_id: 'ama' })] }), today).some((s) => s.id === 'check-in')).toBe(false);
  });

  it('flags tight deadlines with low progress', () => {
    const s = nextSteps(
      base({ project: { name: 'x', kind: 'team', status: 'active', due_on: '2026-11-23' }, tasks: [t('1', { status: 'done', assignee_member_id: 'ama' }), t('2', { assignee_member_id: 'ama' }), t('3', { assignee_member_id: 'kofi' })] }),
      today,
    ).find((x) => x.id === 'deadline-scope')!;
    expect(s.title).toBe('Due in 3 days with 33% done');
  });

  it('spots when the leader is doing most of the work', () => {
    const tasks = ['1', '2', '3', '4', '5'].map((id, i) => t(id, { assignee_member_id: i < 4 ? 'me' : 'ama' }));
    const s = nextSteps(base({ tasks }), today).find((x) => x.id === 'workload')!;
    expect(s.title).toBe('Workload imbalance: you hold 4 of 5 open tasks');
    expect(s.action).toMatch(/Delegate/);
  });

  it('does not nag about ownership on a solo personal project', () => {
    const steps = nextSteps(base({ project: { name: 'x', kind: 'personal', status: 'active', due_on: null }, members: [me], meetings: [], tasks: [t('1')] }), today);
    expect(steps.map((s) => s.id)).toEqual([]);
  });

  it('caps the list and puts high priority first', () => {
    const steps = nextSteps(base({ meetings: [], tasks: [t('1', { due_on: '2026-11-01' }), t('2')] }), today, 2);
    expect(steps).toHaveLength(2);
    expect(steps.every((s) => s.priority === 'high')).toBe(true);
  });
});

describe('buildAgenda', () => {
  it('builds an agenda from recorded state', () => {
    const a = buildAgenda(
      base({
        tasks: [t('1', { title: 'Report', assignee_member_id: 'ama', due_on: '2026-11-18' }), t('2', { title: 'Slides' }), t('3', { title: 'Demo', assignee_member_id: 'kofi', due_on: '2026-11-22' })],
        milestones: [{ id: 'm', title: 'Draft submitted', due_on: '2026-11-30', done_at: null }],
      }),
      today,
    );
    expect(a).toContain('Progress: 0/3 tasks done');
    expect(a).toContain('- Report (Ama, was due 2026-11-18)');
    expect(a).toContain('Agree owners for:\n   - Slides');
    expect(a).toContain('- Demo (Kofi, 2026-11-22)');
    expect(a).toContain('Next milestone: Draft submitted (2026-11-30)');
  });
});
