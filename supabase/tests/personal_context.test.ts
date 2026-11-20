// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, createTestDb, createUser } from './harness';

let db: PGlite;
let alice: string;
let bob: string;

beforeAll(async () => {
  db = await createTestDb();
  alice = await createUser(db, 'alice@example.test');
  bob = await createUser(db, 'bob@example.test');
}, 60_000);

const insert = (user: string, cols: string, vals: string) =>
  asUser(db, user, (tx) => tx.query(`insert into public.personal_memories (${cols}) values (${vals}) returning id`));

describe('memory classification rules', () => {
  it('accepts a user-stated fact', async () => {
    await expect(insert(alice, 'content, kind, topic', `'Wants to start a software company', 'fact', 'ambition'`)).resolves.toBeTruthy();
  });

  it('accepts an AI hypothesis but not an unconfirmed AI fact', async () => {
    await expect(insert(alice, 'content, kind, source, confidence', `'Studies best at night', 'hypothesis', 'ai', 60`)).resolves.toBeTruthy();
    await expect(insert(alice, 'content, kind, source', `'Studies best at night', 'fact', 'ai'`)).rejects.toThrow(/memories_ai_fact_needs_confirmation/);
    await expect(insert(alice, 'content, kind, source', `'Prefers videos', 'preference', 'ai'`)).rejects.toThrow(/memories_ai_fact_needs_confirmation/);
  });

  it('promoting an AI hypothesis to fact requires confirmation', async () => {
    const id = (await insert(alice, 'content, kind, source', `'Learns by doing', 'hypothesis', 'ai'`)).rows[0] as { id: string };
    await expect(
      asUser(db, alice, (tx) => tx.query(`update public.personal_memories set kind = 'fact' where id = $1`, [id.id])),
    ).rejects.toThrow(/memories_ai_fact_needs_confirmation/);
    await asUser(db, alice, (tx) => tx.query(`update public.personal_memories set kind = 'fact', confirmed_at = now() where id = $1`, [id.id]));
  });

  it('cannot rewrite where a memory came from', async () => {
    const id = (await insert(alice, 'content, kind, source', `'x', 'hypothesis', 'ai'`)).rows[0] as { id: string };
    await expect(
      asUser(db, alice, (tx) => tx.query(`update public.personal_memories set source = 'user' where id = $1`, [id.id])),
    ).rejects.toThrow(/permission denied/);
  });

  it('never lets a sensitive memory be AI-visible', async () => {
    await expect(insert(alice, 'content, sensitive', `'Health condition', true`)).rejects.toThrow(/memories_sensitive_not_ai_visible/);
    await expect(insert(alice, 'content, sensitive, ai_visible', `'Health condition', true, false`)).resolves.toBeTruthy();
  });

  it('only temporary memories can expire', async () => {
    await expect(insert(alice, 'content, kind, expires_on', `'x', 'fact', '2026-12-01'`)).rejects.toThrow(/memories_temporary_expires/);
    await expect(insert(alice, 'content, kind, expires_on', `'Exams this month', 'temporary', '2026-12-01'`)).resolves.toBeTruthy();
  });
});

describe('ai_permissions', () => {
  it('defaults to not allowed and is one row per category', async () => {
    await asUser(db, alice, (tx) => tx.query(`insert into public.ai_permissions (category) values ('finances')`));
    const { rows } = await db.query<{ allowed: boolean }>(`select allowed from public.ai_permissions where user_id = $1`, [alice]);
    expect(rows).toEqual([{ allowed: false }]);
    await expect(
      asUser(db, alice, (tx) => tx.query(`insert into public.ai_permissions (category, allowed) values ('finances', true)`)),
    ).rejects.toThrow(/ai_permissions_unique/);
  });

  it('audits permission changes', async () => {
    await asUser(db, alice, (tx) => tx.query(`update public.ai_permissions set allowed = true where category = 'finances'`));
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from public.audit_logs where table_name = 'ai_permissions' and user_id = $1`,
      [alice],
    );
    expect(rows[0]!.n).toBe(2); // insert + update
  });
});

describe('isolation', () => {
  it.each(['personal_memories', 'ai_permissions'])('bob cannot see alice’s %s', async (t) => {
    const rows = await asUser(db, bob, async (tx) => (await tx.query(`select 1 from public.${t}`)).rows);
    expect(rows).toEqual([]);
  });
  it('anon gets nothing', async () => {
    await expect(asUser(db, null, (tx) => tx.query('select * from public.personal_memories'))).rejects.toThrow(/permission denied/);
  });
});
