// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, createTestDb, createUser } from './harness';

let db: PGlite;
let alice: string;
let bob: string;
let note: string;

beforeAll(async () => {
  db = await createTestDb();
  alice = await createUser(db, 'alice@example.test');
  bob = await createUser(db, 'bob@example.test');
  // The server job (superuser here, service role in production) creates notifications.
  note = (
    await db.query<{ id: string }>(
      `insert into public.notifications (user_id, category, title, link, dedupe_key, source_key)
       values ($1, 'academic', 'Lab 2 due tomorrow', '/life/academics', 'assessment:x:due24', 'assessment:x') returning id`,
      [alice],
    )
  ).rows[0]!.id;
  await db.query(`insert into public.app_secrets (name, value) values ('vapid_private', 'secret-material')`);
}, 60_000);

describe('notifications', () => {
  it('cannot be created by users (only the server job)', async () => {
    await expect(
      asUser(db, alice, (tx) => tx.query(`insert into public.notifications (user_id, category, title, dedupe_key) values ($1, 'system', 'x', 'y')`, [alice])),
    ).rejects.toThrow(/permission denied/);
  });

  it('are deduplicated per user', async () => {
    await expect(
      db.query(`insert into public.notifications (user_id, category, title, dedupe_key) values ($1, 'academic', 'again', 'assessment:x:due24')`, [alice]),
    ).rejects.toThrow(/notifications_dedupe/);
  });

  it('only allow internal links', async () => {
    await expect(
      db.query(`insert into public.notifications (user_id, category, title, dedupe_key, link) values ($1, 'system', 'x', 'l1', 'https://evil.example')`, [alice]),
    ).rejects.toThrow(/check constraint/);
    // Protocol-relative URLs would leave the app.
    await expect(
      db.query(`insert into public.notifications (user_id, category, title, dedupe_key, link) values ($1, 'system', 'x', 'l2', '//evil.example')`, [alice]),
    ).rejects.toThrow(/check constraint/);
    await expect(
      db.query(`insert into public.notifications (user_id, category, title, dedupe_key, link) values ($1, 'system', 'x', 'l3', '/life/academics')`, [alice]),
    ).resolves.toBeTruthy();
  });

  it('owner can mark read, snooze and dismiss, but not rewrite content', async () => {
    await asUser(db, alice, (tx) => tx.query(`update public.notifications set read_at = now(), snoozed_until = now() + interval '1 hour' where id = $1`, [note]));
    await expect(asUser(db, alice, (tx) => tx.query(`update public.notifications set title = 'x' where id = $1`, [note]))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, alice, (tx) => tx.query(`update public.notifications set pushed_at = now() where id = $1`, [note]))).rejects.toThrow(/permission denied/);
  });

  it("isolates users and hides other people's notifications", async () => {
    const rows = await asUser(db, bob, async (tx) => (await tx.query('select 1 from public.notifications')).rows);
    expect(rows).toEqual([]);
    const upd = await asUser(db, bob, async (tx) => (await tx.query(`update public.notifications set dismissed_at = now() where id = $1`, [note])).affectedRows);
    expect(upd).toBe(0);
  });
});

describe('push subscriptions and preferences', () => {
  it('stores https endpoints only, one row per endpoint', async () => {
    await asUser(db, alice, (tx) => tx.query(`insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://fcm.googleapis.com/fcm/send/abc', 'k', 'a')`));
    await expect(
      asUser(db, alice, (tx) => tx.query(`insert into public.push_subscriptions (endpoint, p256dh, auth) values ('http://insecure/x', 'k', 'a')`)),
    ).rejects.toThrow(/check constraint/);
    await expect(
      asUser(db, bob, (tx) => tx.query(`insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://fcm.googleapis.com/fcm/send/abc', 'k', 'a')`)),
    ).rejects.toThrow(/push_subscriptions_endpoint/);
  });

  it('one preference row per category', async () => {
    await asUser(db, alice, (tx) => tx.query(`insert into public.notification_preferences (category, push) values ('habit', false)`));
    await expect(asUser(db, alice, (tx) => tx.query(`insert into public.notification_preferences (category) values ('habit')`))).rejects.toThrow(/notification_preferences_unique/);
  });

  it('accountability mode is user-editable', async () => {
    const n = await asUser(db, alice, async (tx) => (await tx.query(`update public.user_preferences set accountability_mode = true where user_id = $1`, [alice])).affectedRows);
    expect(n).toBe(1);
  });
});

describe('app_secrets', () => {
  it('is invisible to signed-in and anonymous users', async () => {
    await expect(asUser(db, alice, (tx) => tx.query('select * from public.app_secrets'))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, null, (tx) => tx.query('select * from public.app_secrets'))).rejects.toThrow(/permission denied/);
  });
});

describe('nexus_budgets_over', () => {
  it('computes overspend exactly, per user and currency', async () => {
    const acc = (await asUser(db, alice, (tx) => tx.query<{ id: string }>(`insert into public.financial_accounts (name) values ('MoMo') returning id`))).rows[0]!.id;
    await asUser(db, alice, async (tx) => {
      await tx.query(`insert into public.budgets (category, monthly_limit_minor) values ('Food', 10000), ('Transport', 5000)`);
      await tx.query(`insert into public.transactions (account_id, kind, amount_minor, category, occurred_on) values ($1, 'expense', 7000, 'Food', '2026-11-03'), ($1, 'expense', 4000, 'Food', '2026-11-10'), ($1, 'expense', 9000, 'Food', '2026-10-30'), ($1, 'expense', 100, 'Transport', '2026-11-04')`, [acc]);
    });
    const { rows } = await db.query<{ category: string; spent_minor: string; limit_minor: string }>(`select * from public.nexus_budgets_over($1, 'GHS', '2026-11')`, [alice]);
    expect(rows.map((r) => [r.category, Number(r.spent_minor), Number(r.limit_minor)])).toEqual([['Food', 11000, 10000]]);
  });

  it('cannot be called by signed-in users (it takes any user id)', async () => {
    await expect(asUser(db, bob, (tx) => tx.query(`select * from public.nexus_budgets_over($1, 'GHS', '2026-11')`, [alice]))).rejects.toThrow(/permission denied/);
  });
});
