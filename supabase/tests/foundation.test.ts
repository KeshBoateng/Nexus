// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, createTestDb, createUser } from './harness';

let db: PGlite;
let alice: string;
let bob: string;

beforeAll(async () => {
  db = await createTestDb();
  alice = await createUser(db, 'alice@example.test', '  Alice  ');
  bob = await createUser(db, 'bob@example.test');
}, 60_000);

describe('signup trigger', () => {
  it('creates a profile with trimmed display name and GHS defaults', async () => {
    const { rows } = await db.query<{ display_name: string; default_currency: string; timezone: string }>(
      'select display_name, default_currency, timezone from public.profiles where id = $1',
      [alice],
    );
    expect(rows[0]).toEqual({ display_name: 'Alice', default_currency: 'GHS', timezone: 'Africa/Accra' });
  });

  it('creates preferences with AI disabled by default', async () => {
    const { rows } = await db.query<{ ai_enabled: boolean; theme: string }>(
      'select ai_enabled, theme from public.user_preferences where user_id = $1',
      [bob],
    );
    expect(rows[0]).toEqual({ ai_enabled: false, theme: 'dark' });
  });
});

describe('profiles RLS', () => {
  it('lets a user read only their own profile', async () => {
    const rows = await asUser(db, alice, async (tx) => (await tx.query('select id from public.profiles')).rows);
    expect(rows).toEqual([{ id: alice }]);
  });

  it('gives anonymous callers no access', async () => {
    await expect(asUser(db, null, (tx) => tx.query('select * from public.profiles'))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("silently affects zero rows when updating someone else's profile", async () => {
    const affected = await asUser(db, alice, async (tx) => {
      const r = await tx.query(`update public.profiles set display_name = 'pwned' where id = $1`, [bob]);
      return r.affectedRows;
    });
    expect(affected).toBe(0);
    const { rows } = await db.query<{ display_name: string | null }>(
      'select display_name from public.profiles where id = $1',
      [bob],
    );
    expect(rows[0]!.display_name).toBeNull();
  });

  it('allows updating own whitelisted columns', async () => {
    const affected = await asUser(db, alice, async (tx) => {
      const r = await tx.query(`update public.profiles set default_currency = 'USD' where id = $1`, [alice]);
      return r.affectedRows;
    });
    expect(affected).toBe(1);
  });

  it('refuses to change the id (owner) column', async () => {
    await expect(
      asUser(db, alice, (tx) => tx.query(`update public.profiles set id = $1 where id = $2`, [bob, alice])),
    ).rejects.toThrow(/permission denied/);
  });

  it('refuses direct inserts and deletes', async () => {
    await expect(
      asUser(db, alice, (tx) => tx.query(`insert into public.profiles (id) values (gen_random_uuid())`)),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, alice, (tx) => tx.query(`delete from public.profiles where id = $1`, [alice])),
    ).rejects.toThrow(/permission denied/);
  });

  it('rejects an invalid currency code', async () => {
    await expect(
      asUser(db, alice, (tx) => tx.query(`update public.profiles set default_currency = 'ghs' where id = $1`, [alice])),
    ).rejects.toThrow(/check constraint/);
  });
});

describe('user_preferences RLS', () => {
  it('isolates preferences between users', async () => {
    const rows = await asUser(db, bob, async (tx) => (await tx.query('select user_id from public.user_preferences')).rows);
    expect(rows).toEqual([{ user_id: bob }]);
  });

  it('enforces quiet hours as both-or-neither', async () => {
    await expect(
      asUser(db, bob, (tx) =>
        tx.query(`update public.user_preferences set quiet_hours_start = '22:00' where user_id = $1`, [bob]),
      ),
    ).rejects.toThrow(/quiet_hours_both_or_neither/);
  });
});

describe('audit_logs', () => {
  it('records profile changes, readable only by the owner', async () => {
    await asUser(db, bob, (tx) =>
      tx.query(`update public.profiles set display_name = 'Bob' where id = $1`, [bob]),
    );
    const bobsLogs = await asUser(db, bob, async (tx) =>
      (await tx.query<{ user_id: string; action: string; table_name: string }>(
        'select user_id, action, table_name from public.audit_logs order by id',
      )).rows,
    );
    expect(bobsLogs.length).toBeGreaterThanOrEqual(3); // profile insert, prefs insert, profile update
    expect(bobsLogs.every((r) => r.user_id === bob)).toBe(true);
    expect(bobsLogs.some((r) => r.action === 'UPDATE' && r.table_name === 'profiles')).toBe(true);
  });

  it('cannot be written or tampered with by users', async () => {
    await expect(
      asUser(db, bob, (tx) =>
        tx.query(
          `insert into public.audit_logs (user_id, table_name, record_id, action) values ($1, 'x', 'x', 'INSERT')`,
          [bob],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(asUser(db, bob, (tx) => tx.query('delete from public.audit_logs'))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe('function privileges', () => {
  it.each(['audit_row_change', 'handle_new_user', 'set_updated_at'])(
    '%s is not executable by anon or authenticated (not callable via RPC)',
    async (fn) => {
      const { rows } = await db.query<{ anon: boolean; authed: boolean }>(
        `select has_function_privilege('anon', $1, 'execute') as anon,
                has_function_privilege('authenticated', $1, 'execute') as authed`,
        [`public.${fn}()`],
      );
      expect(rows[0]).toEqual({ anon: false, authed: false });
    },
  );
});

describe('account deletion', () => {
  it('cascades from auth.users to all owned rows', async () => {
    const carol = await createUser(db, 'carol@example.test');
    await db.query('delete from auth.users where id = $1', [carol]);
    const counts = await db.query<{ n: number }>(
      `select (select count(*) from public.profiles where id = $1)
            + (select count(*) from public.user_preferences where user_id = $1)
            + (select count(*) from public.audit_logs where user_id = $1) as n`,
      [carol],
    );
    expect(Number(counts.rows[0]!.n)).toBe(0);
  });
});
