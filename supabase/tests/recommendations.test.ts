// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite, Transaction } from '@electric-sql/pglite';
import { asUser, createTestDb, createUser } from './harness';

let db: PGlite;
let alice: string;
let bob: string;
let rec: string;

const insertRec = (tx: Transaction, key = 'deadline:1', shown = '2026-11-20') =>
  tx.query<{ id: string }>(
    `insert into public.recommendations (rule_type, rule_key, category, kind, title, action, why, evidence, priority, shown_on)
     values ('academic.deadline', $1, 'academic', 'immediate', 'Submit lab', 'Finish it', 'Due tomorrow', '["Lab 2 due 21 Nov"]', 90, $2)
     returning id`,
    [key, shown],
  );

beforeAll(async () => {
  db = await createTestDb();
  alice = await createUser(db, 'alice@example.test');
  bob = await createUser(db, 'bob@example.test');
  rec = await asUser(db, alice, async (tx) => (await insertRec(tx)).rows[0]!.id);
}, 60_000);

describe('recommendations', () => {
  it('stores each rule at most once per day, but again on another day', async () => {
    await expect(asUser(db, alice, (tx) => insertRec(tx))).rejects.toThrow(/recommendations_once_per_day/);
    await expect(asUser(db, alice, (tx) => insertRec(tx, 'deadline:1', '2026-11-21'))).resolves.toBeTruthy();
  });

  it('keeps the original reasoning immutable; only status changes', async () => {
    await asUser(db, alice, (tx) => tx.query(`update public.recommendations set status = 'accepted' where id = $1`, [rec]));
    await expect(
      asUser(db, alice, (tx) => tx.query(`update public.recommendations set why = 'rewritten' where id = $1`, [rec])),
    ).rejects.toThrow(/permission denied/);
  });

  it('requires evidence to be a JSON array and priority 0–100', async () => {
    await expect(
      asUser(db, alice, (tx) =>
        tx.query(`insert into public.recommendations (rule_type, rule_key, category, kind, title, action, why, evidence, priority, shown_on)
                  values ('x','y','academic','immediate','t','a','w','{}',50,'2026-11-20')`),
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      asUser(db, alice, (tx) =>
        tx.query(`insert into public.recommendations (rule_type, rule_key, category, kind, title, action, why, priority, shown_on)
                  values ('x','z','academic','immediate','t','a','w',101,'2026-11-20')`),
      ),
    ).rejects.toThrow(/check constraint/);
  });
});

describe('events and feedback are append-only history', () => {
  it('records lifecycle events and feedback', async () => {
    await asUser(db, alice, async (tx) => {
      await tx.query(`insert into public.recommendation_events (recommendation_id, event) values ($1, 'viewed'), ($1, 'accepted')`, [rec]);
      await tx.query(`insert into public.recommendation_feedback (recommendation_id, rating, reason) values ($1, 'very_useful', 'Saved me')`, [rec]);
    });
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.recommendation_events where recommendation_id = $1`, [rec]);
    expect(rows[0]!.n).toBe(2);
  });

  it('cannot edit or delete events or feedback', async () => {
    await expect(asUser(db, alice, (tx) => tx.query(`update public.recommendation_events set event = 'applied'`))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, alice, (tx) => tx.query(`delete from public.recommendation_feedback`))).rejects.toThrow(/permission denied/);
  });

  it("cannot attach feedback to another user's recommendation", async () => {
    await expect(
      asUser(db, bob, (tx) => tx.query(`insert into public.recommendation_feedback (recommendation_id, rating) values ($1, 'not_useful')`, [rec])),
    ).rejects.toThrow(/foreign key/);
  });

  it('rejects unknown ratings and events', async () => {
    await expect(
      asUser(db, alice, (tx) => tx.query(`insert into public.recommendation_feedback (recommendation_id, rating) values ($1, 'meh')`, [rec])),
    ).rejects.toThrow(/check constraint/);
    await expect(
      asUser(db, alice, (tx) => tx.query(`insert into public.recommendation_events (recommendation_id, event) values ($1, 'clicked')`, [rec])),
    ).rejects.toThrow(/check constraint/);
  });
});

describe('daily briefings and isolation', () => {
  it('one briefing per day', async () => {
    await asUser(db, alice, (tx) => tx.query(`insert into public.daily_briefings (on_date, recommendation_ids) values ('2026-11-20', array[$1]::uuid[])`, [rec]));
    await expect(
      asUser(db, alice, (tx) => tx.query(`insert into public.daily_briefings (on_date) values ('2026-11-20')`)),
    ).rejects.toThrow(/daily_briefings_once_per_day/);
  });

  it.each(['recommendations', 'recommendation_events', 'recommendation_feedback', 'daily_briefings'])('bob sees none of alice’s %s', async (t) => {
    const rows = await asUser(db, bob, async (tx) => (await tx.query(`select 1 from public.${t}`)).rows);
    expect(rows).toEqual([]);
  });
});
