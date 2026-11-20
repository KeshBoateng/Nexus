// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite, Transaction } from '@electric-sql/pglite';
import { asUser, createTestDb, createUser } from './harness';

let db: PGlite;
let alice: string;
let bob: string;
let p1: string;
let p2: string;
let ama: string; // member of p1
let kofi: string; // member of p2

const one = async (tx: Transaction, sql: string, params: unknown[] = []) =>
  (await tx.query<{ id: string }>(sql, params)).rows[0]!.id;

beforeAll(async () => {
  db = await createTestDb();
  alice = await createUser(db, 'alice@example.test');
  bob = await createUser(db, 'bob@example.test');
  await asUser(db, alice, async (tx) => {
    p1 = await one(tx, `insert into public.projects (name, kind) values ('DCIT 208 group work', 'team') returning id`);
    p2 = await one(tx, `insert into public.projects (name) values ('Side project') returning id`);
    ama = await one(tx, `insert into public.project_members (project_id, name, role) values ($1, 'Ama', 'Research') returning id`, [p1]);
    kofi = await one(tx, `insert into public.project_members (project_id, name) values ($1, 'Kofi') returning id`, [p2]);
  });
}, 60_000);

describe('responsibility tracking', () => {
  it('assigns a task to a member of the same project', async () => {
    const t = await asUser(db, alice, (tx) =>
      one(tx, `insert into public.project_tasks (project_id, title, assignee_member_id) values ($1, 'Literature review', $2) returning id`, [p1, ama]),
    );
    expect(t).toBeTruthy();
  });

  it('refuses an assignee from a different project', async () => {
    await expect(
      asUser(db, alice, (tx) =>
        tx.query(`insert into public.project_tasks (project_id, title, assignee_member_id) values ($1, 'x', $2)`, [p1, kofi]),
      ),
    ).rejects.toThrow(/project_tasks_assignee_same_project/);
  });

  it('removing a member unassigns their tasks instead of deleting them', async () => {
    const [m, t] = await asUser(db, alice, async (tx) => {
      const m = await one(tx, `insert into public.project_members (project_id, name) values ($1, 'Yaw') returning id`, [p1]);
      const t = await one(tx, `insert into public.project_tasks (project_id, title, assignee_member_id) values ($1, 'Slides', $2) returning id`, [p1, m]);
      await tx.query(`delete from public.project_members where id = $1`, [m]);
      return [m, t];
    });
    const { rows } = await db.query<{ assignee_member_id: string | null; user_id: string; project_id: string }>(
      'select assignee_member_id, user_id, project_id from public.project_tasks where id = $1',
      [t],
    );
    expect(m).toBeTruthy();
    expect(rows[0]).toEqual({ assignee_member_id: null, user_id: alice, project_id: p1 });
  });

  it('allows only one "me" per project', async () => {
    await asUser(db, alice, (tx) => tx.query(`insert into public.project_members (project_id, name, is_me) values ($1, 'Me', true)`, [p1]));
    await expect(
      asUser(db, alice, (tx) => tx.query(`insert into public.project_members (project_id, name, is_me) values ($1, 'Me again', true)`, [p1])),
    ).rejects.toThrow(/project_members_one_me/);
  });

  it('keeps done status and completed_at consistent', async () => {
    await expect(
      asUser(db, alice, (tx) => tx.query(`insert into public.project_tasks (project_id, title, status) values ($1, 'x', 'done')`, [p1])),
    ).rejects.toThrow(/project_tasks_done_consistent/);
  });

  it('cannot move a task to another project (project_id not updatable)', async () => {
    await expect(
      asUser(db, alice, (tx) => tx.query(`update public.project_tasks set project_id = $1`, [p2])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('course link', () => {
  it('links to own course and clears only course_id when the course is deleted', async () => {
    const [course, proj] = await asUser(db, alice, async (tx) => {
      const term = await one(tx, `insert into public.academic_terms (name) values ('t') returning id`);
      const course = await one(tx, `insert into public.courses (term_id, title, credit_hours) values ($1, 'DCIT 208', 3) returning id`, [term]);
      const proj = await one(tx, `insert into public.projects (name, course_id) values ('Assignment 1', $1) returning id`, [course]);
      await tx.query(`delete from public.courses where id = $1`, [course]);
      return [course, proj];
    });
    expect(course).toBeTruthy();
    const { rows } = await db.query<{ course_id: string | null; user_id: string }>('select course_id, user_id from public.projects where id = $1', [proj]);
    expect(rows[0]).toEqual({ course_id: null, user_id: alice });
  });

  it("refuses linking to another user's course", async () => {
    const bobCourse = await asUser(db, bob, async (tx) => {
      const term = await one(tx, `insert into public.academic_terms (name) values ('b') returning id`);
      return one(tx, `insert into public.courses (term_id, title, credit_hours) values ($1, 'B', 3) returning id`, [term]);
    });
    await expect(
      asUser(db, alice, (tx) => tx.query(`insert into public.projects (name, course_id) values ('x', $1)`, [bobCourse])),
    ).rejects.toThrow(/foreign key/);
  });
});

describe('isolation and cascade', () => {
  it.each(['projects', 'project_members', 'project_tasks', 'project_milestones', 'meetings'])('bob sees none of alice’s %s', async (t) => {
    const rows = await asUser(db, bob, async (tx) => (await tx.query(`select 1 from public.${t} where user_id <> $1`, [bob])).rows);
    expect(rows).toEqual([]);
  });

  it("bob cannot add a member to alice's project", async () => {
    await expect(
      asUser(db, bob, (tx) => tx.query(`insert into public.project_members (project_id, name) values ($1, 'x')`, [p1])),
    ).rejects.toThrow(/foreign key/);
  });

  it('deleting a project removes its members, tasks, milestones and meetings', async () => {
    const p = await asUser(db, alice, async (tx) => {
      const p = await one(tx, `insert into public.projects (name) values ('tmp') returning id`);
      const m = await one(tx, `insert into public.project_members (project_id, name) values ($1, 'm') returning id`, [p]);
      await tx.query(`insert into public.project_tasks (project_id, title, assignee_member_id) values ($1, 't', $2)`, [p, m]);
      await tx.query(`insert into public.project_milestones (project_id, title) values ($1, 'ms')`, [p]);
      await tx.query(`insert into public.meetings (project_id, title) values ($1, 'kickoff')`, [p]);
      await tx.query(`delete from public.projects where id = $1`, [p]);
      return p;
    });
    const { rows } = await db.query<{ n: number }>(
      `select ((select count(*) from public.project_members where project_id = $1)
             + (select count(*) from public.project_tasks where project_id = $1)
             + (select count(*) from public.project_milestones where project_id = $1)
             + (select count(*) from public.meetings where project_id = $1))::int as n`,
      [p],
    );
    expect(rows[0]!.n).toBe(0);
  });
});
