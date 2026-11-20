// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, createTestDb, createUser } from './harness';

let db: PGlite;
let alice: string;
let bob: string;
let opp: string;

beforeAll(async () => {
  db = await createTestDb();
  alice = await createUser(db, 'alice@example.test');
  bob = await createUser(db, 'bob@example.test');
  opp = await asUser(db, alice, async (tx) =>
    (await tx.query<{ id: string }>(`insert into public.opportunities (title, kind, url, deadline) values ('MTN internship', 'internship', 'https://example.com/a', '2026-12-01') returning id`)).rows[0]!.id,
  );
}, 60_000);

describe('weekly_reviews', () => {
  it('one review per ISO week, valid week keys only', async () => {
    await asUser(db, alice, (tx) => tx.query(`insert into public.weekly_reviews (week_key, wins, energy, stats) values ('2026-W47', 'Finished lab', 4, '{"tasksDone":3}')`));
    await expect(asUser(db, alice, (tx) => tx.query(`insert into public.weekly_reviews (week_key) values ('2026-W47')`))).rejects.toThrow(/weekly_reviews_once/);
    await expect(asUser(db, alice, (tx) => tx.query(`insert into public.weekly_reviews (week_key) values ('2026-47')`))).rejects.toThrow(/check constraint/);
    await expect(asUser(db, alice, (tx) => tx.query(`insert into public.weekly_reviews (week_key, energy) values ('2026-W48', 6)`))).rejects.toThrow(/check constraint/);
  });
});

describe('opportunities', () => {
  it('https links only', async () => {
    await expect(asUser(db, alice, (tx) => tx.query(`insert into public.opportunities (title, url) values ('x', 'http://insecure')`))).rejects.toThrow(/check constraint/);
  });

  it('users cannot mark their own links as verified', async () => {
    await expect(asUser(db, alice, (tx) => tx.query(`update public.opportunities set link_status = 'ok' where id = $1`, [opp]))).rejects.toThrow(/permission denied/);
  });

  it('changing the URL resets a previous verification', async () => {
    await db.query(`update public.opportunities set link_status = 'ok', link_checked_at = now() where id = $1`, [opp]); // as the server
    await asUser(db, alice, (tx) => tx.query(`update public.opportunities set title = 'MTN internship 2027' where id = $1`, [opp]));
    expect((await db.query<{ link_status: string }>('select link_status from public.opportunities where id = $1', [opp])).rows[0]!.link_status).toBe('ok');
    await asUser(db, alice, (tx) => tx.query(`update public.opportunities set url = 'https://evil.example/x' where id = $1`, [opp]));
    const { rows } = await db.query<{ link_status: string; link_checked_at: string | null }>('select link_status, link_checked_at from public.opportunities where id = $1', [opp]);
    expect(rows[0]).toEqual({ link_status: 'unchecked', link_checked_at: null });
  });

  it.each(['weekly_reviews', 'opportunities'])('bob sees none of alice’s %s', async (t) => {
    const rows = await asUser(db, bob, async (tx) => (await tx.query(`select 1 from public.${t}`)).rows);
    expect(rows).toEqual([]);
  });
});
