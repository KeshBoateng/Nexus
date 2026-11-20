// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite, Transaction } from '@electric-sql/pglite';
import { asUser, createTestDb, createUser } from './harness';

let db: PGlite;
let alice: string;
let bob: string;
let goal: string;
let habit: string;

const one = async (tx: Transaction, sql: string, params: unknown[] = []) =>
  (await tx.query<{ id: string }>(sql, params)).rows[0]!.id;

beforeAll(async () => {
  db = await createTestDb();
  alice = await createUser(db, 'alice@example.test');
  bob = await createUser(db, 'bob@example.test');
  await asUser(db, alice, async (tx) => {
    goal = await one(tx, `insert into public.goals (title, area) values ('Finish CCNA', 'technical') returning id`);
    habit = await one(tx, `insert into public.habits (name) values ('Read 20 min') returning id`);
  });
}, 60_000);

describe('goals and milestones', () => {
  it('requires closed_at exactly when a goal is not active', async () => {
    await expect(
      asUser(db, alice, (tx) => tx.query(`update public.goals set status = 'achieved' where id = $1`, [goal])),
    ).rejects.toThrow(/goals_closed_consistent/);
    await asUser(db, alice, (tx) => tx.query(`update public.goals set status = 'achieved', closed_at = now() where id = $1`, [goal]));
    await asUser(db, alice, (tx) => tx.query(`update public.goals set status = 'active', closed_at = null where id = $1`, [goal]));
  });

  it("cannot add a milestone to another user's goal", async () => {
    await expect(
      asUser(db, bob, (tx) => tx.query(`insert into public.goal_milestones (goal_id, title) values ($1, 'x')`, [goal])),
    ).rejects.toThrow(/foreign key/);
  });

  it('deleting a goal removes its milestones', async () => {
    const g = await asUser(db, alice, (tx) => one(tx, `insert into public.goals (title) values ('temp') returning id`));
    await asUser(db, alice, (tx) => tx.query(`insert into public.goal_milestones (goal_id, title) values ($1, 'm')`, [g]));
    await asUser(db, alice, (tx) => tx.query(`delete from public.goals where id = $1`, [g]));
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.goal_milestones where goal_id = $1`, [g]);
    expect(rows[0]!.n).toBe(0);
  });
});

describe('habits and check-ins', () => {
  it('allows one check-in per habit per day', async () => {
    await asUser(db, alice, (tx) => tx.query(`insert into public.habit_checkins (habit_id, on_date) values ($1, '2026-11-20')`, [habit]));
    await expect(
      asUser(db, alice, (tx) => tx.query(`insert into public.habit_checkins (habit_id, on_date) values ($1, '2026-11-20')`, [habit])),
    ).rejects.toThrow(/habit_checkins_once_per_day/);
  });

  it('check-ins cannot be edited, only removed', async () => {
    await expect(
      asUser(db, alice, (tx) => tx.query(`update public.habit_checkins set on_date = '2026-11-19' where habit_id = $1`, [habit])),
    ).rejects.toThrow(/permission denied/);
  });

  it("cannot check in on another user's habit", async () => {
    await expect(
      asUser(db, bob, (tx) => tx.query(`insert into public.habit_checkins (habit_id, on_date) values ($1, '2026-11-21')`, [habit])),
    ).rejects.toThrow(/foreign key/);
  });

  it('rejects target_per_week outside 1–7', async () => {
    await expect(
      asUser(db, alice, (tx) => tx.query(`insert into public.habits (name, target_per_week) values ('x', 8)`)),
    ).rejects.toThrow(/check constraint/);
  });
});

describe('isolation', () => {
  it.each(['goals', 'goal_milestones', 'habits', 'habit_checkins'])('bob sees none of alice’s %s', async (t) => {
    const rows = await asUser(db, bob, async (tx) => (await tx.query(`select 1 from public.${t}`)).rows);
    expect(rows).toEqual([]);
  });

  it.each(['goals', 'habits'])('anon cannot read %s', async (t) => {
    await expect(asUser(db, null, (tx) => tx.query(`select * from public.${t}`))).rejects.toThrow(/permission denied/);
  });
});
