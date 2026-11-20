// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, createTestDb, createUser } from './harness';

let db: PGlite;
let alice: string;
let bob: string;
let aliceTerm: string;
let aliceCourse: string;
let bobTerm: string;

beforeAll(async () => {
  db = await createTestDb();
  alice = await createUser(db, 'alice@example.test');
  bob = await createUser(db, 'bob@example.test');

  aliceTerm = await asUser(db, alice, async (tx) =>
    (await tx.query<{ id: string }>(`insert into public.academic_terms (name) values ('Year 1 Sem 1') returning id`))
      .rows[0]!.id,
  );
  aliceCourse = await asUser(db, alice, async (tx) =>
    (
      await tx.query<{ id: string }>(
        `insert into public.courses (term_id, code, title, credit_hours, final_mark) values ($1, 'DCIT101', 'Intro', 3, 82) returning id`,
        [aliceTerm],
      )
    ).rows[0]!.id,
  );
  bobTerm = await asUser(db, bob, async (tx) =>
    (await tx.query<{ id: string }>(`insert into public.academic_terms (name) values ('Bob term') returning id`))
      .rows[0]!.id,
  );
}, 60_000);

describe('ownership', () => {
  it('fills user_id from the session', async () => {
    const { rows } = await db.query<{ user_id: string }>('select user_id from public.courses where id = $1', [aliceCourse]);
    expect(rows[0]!.user_id).toBe(alice);
  });

  it('does not let a client set user_id', async () => {
    await expect(
      asUser(db, alice, (tx) => tx.query(`insert into public.academic_terms (name, user_id) values ('x', $1)`, [bob])),
    ).rejects.toThrow(/permission denied/);
  });

  it("refuses to attach a course to another user's term", async () => {
    await expect(
      asUser(db, alice, (tx) =>
        tx.query(`insert into public.courses (term_id, title, credit_hours) values ($1, 'sneaky', 3)`, [bobTerm]),
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it("refuses to attach an assessment to another user's course", async () => {
    await expect(
      asUser(db, bob, (tx) =>
        tx.query(`insert into public.assessments (course_id, title) values ($1, 'sneaky')`, [aliceCourse]),
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it.each(['academic_terms', 'courses', 'assessments', 'grade_bands'])('isolates %s between users', async (table) => {
    const rows = await asUser(db, bob, async (tx) => (await tx.query<{ user_id: string }>(`select user_id from public.${table}`)).rows);
    expect(rows.every((r) => r.user_id === bob)).toBe(true);
  });

  it("cannot update or delete another user's course", async () => {
    const [upd, del] = await asUser(db, bob, async (tx) => [
      (await tx.query(`update public.courses set final_mark = 0 where id = $1`, [aliceCourse])).affectedRows,
      (await tx.query(`delete from public.courses where id = $1`, [aliceCourse])).affectedRows,
    ]);
    expect([upd, del]).toEqual([0, 0]);
  });

  it('gives anonymous callers nothing', async () => {
    await expect(asUser(db, null, (tx) => tx.query('select * from public.courses'))).rejects.toThrow(/permission denied/);
  });
});

describe('constraints', () => {
  it.each([
    [`insert into public.courses (term_id, title, credit_hours) values ($1, 'x', 0)`],
    [`insert into public.courses (term_id, title, credit_hours, final_mark) values ($1, 'x', 3, 100.5)`],
    [`insert into public.courses (term_id, title, credit_hours, final_letter) values ($1, 'x', 3, 'a')`],
  ])('rejects invalid course data: %s', async (sql) => {
    await expect(asUser(db, alice, (tx) => tx.query(sql, [aliceTerm]))).rejects.toThrow(/check constraint/);
  });

  it('rejects score above max_score', async () => {
    await expect(
      asUser(db, alice, (tx) =>
        tx.query(`insert into public.assessments (course_id, title, score, max_score) values ($1, 'q', 11, 10)`, [aliceCourse]),
      ),
    ).rejects.toThrow(/assessments_score_le_max/);
  });

  it('rejects grade points above 4.0 and duplicate letters', async () => {
    await expect(
      asUser(db, alice, (tx) =>
        tx.query(`insert into public.grade_bands (letter, min_mark, max_mark, points) values ('A', 80, 100, 4.5)`),
      ),
    ).rejects.toThrow(/check constraint/);
    await asUser(db, alice, (tx) =>
      tx.query(`insert into public.grade_bands (letter, min_mark, max_mark, points) values ('A', 80, 100, 4.0)`),
    );
    await expect(
      asUser(db, alice, (tx) =>
        tx.query(`insert into public.grade_bands (letter, min_mark, max_mark, points) values ('A', 70, 79, 3.0)`),
      ),
    ).rejects.toThrow(/grade_bands_letter_unique/);
  });
});

describe('audit and cascade', () => {
  it('audits grade changes', async () => {
    await asUser(db, alice, (tx) => tx.query(`update public.courses set final_mark = 75 where id = $1`, [aliceCourse]));
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from public.audit_logs where table_name = 'courses' and record_id = $1 and action = 'UPDATE'`,
      [aliceCourse],
    );
    expect(rows[0]!.n).toBe(1);
  });

  it('deleting a term removes its courses and assessments', async () => {
    const term = await asUser(db, alice, async (tx) =>
      (await tx.query<{ id: string }>(`insert into public.academic_terms (name) values ('temp') returning id`)).rows[0]!.id,
    );
    await asUser(db, alice, async (tx) => {
      const c = await tx.query<{ id: string }>(
        `insert into public.courses (term_id, title, credit_hours) values ($1, 't', 2) returning id`,
        [term],
      );
      await tx.query(`insert into public.assessments (course_id, title) values ($1, 'a')`, [c.rows[0]!.id]);
      await tx.query(`delete from public.academic_terms where id = $1`, [term]);
    });
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.courses where term_id = $1`, [term]);
    expect(rows[0]!.n).toBe(0);
  });

  it('account deletion cascades through academics without audit errors', async () => {
    const carol = await createUser(db, 'carol@example.test');
    await asUser(db, carol, async (tx) => {
      const t = await tx.query<{ id: string }>(`insert into public.academic_terms (name) values ('c') returning id`);
      await tx.query(`insert into public.courses (term_id, title, credit_hours, final_mark) values ($1, 'c', 3, 90)`, [t.rows[0]!.id]);
      await tx.query(`insert into public.grade_bands (letter, min_mark, max_mark, points) values ('A', 80, 100, 4)`);
    });
    await db.query('delete from auth.users where id = $1', [carol]);
    const { rows } = await db.query<{ n: number }>(
      `select ((select count(*) from public.courses where user_id = $1)
             + (select count(*) from public.audit_logs where user_id = $1))::int as n`,
      [carol],
    );
    expect(rows[0]!.n).toBe(0);
  });
});
