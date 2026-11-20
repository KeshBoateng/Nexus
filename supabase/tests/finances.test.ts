// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite, Transaction } from '@electric-sql/pglite';
import { asUser, createTestDb, createUser } from './harness';

let db: PGlite;
let alice: string;
let bob: string;
let momo: string; // Alice, GHS
let bank: string; // Alice, GHS
let usd: string; // Alice, USD
let bobAcc: string;

const one = async (tx: Transaction, sql: string, params: unknown[] = []) =>
  (await tx.query<{ id: string }>(sql, params)).rows[0]!.id;

async function balances(user: string): Promise<Record<string, number>> {
  return asUser(db, user, async (tx) => {
    const r = await tx.query<{ account_id: string; balance_minor: string | number }>(
      'select account_id, balance_minor from public.account_balances',
    );
    return Object.fromEntries(r.rows.map((x) => [x.account_id, Number(x.balance_minor)]));
  });
}

beforeAll(async () => {
  db = await createTestDb();
  alice = await createUser(db, 'alice@example.test');
  bob = await createUser(db, 'bob@example.test');
  await asUser(db, alice, async (tx) => {
    momo = await one(tx, `insert into public.financial_accounts (name, kind, opening_balance_minor) values ('MoMo', 'mobile_money', 10000) returning id`);
    bank = await one(tx, `insert into public.financial_accounts (name, kind) values ('Bank', 'bank') returning id`);
    usd = await one(tx, `insert into public.financial_accounts (name, kind, currency) values ('Dollar card', 'bank', 'USD') returning id`);
  });
  await asUser(db, bob, async (tx) => {
    bobAcc = await one(tx, `insert into public.financial_accounts (name) values ('Bob cash') returning id`);
  });
}, 60_000);

describe('ledger and balances', () => {
  it('computes balances exactly from opening balance + ledger', async () => {
    await asUser(db, alice, async (tx) => {
      await tx.query(`insert into public.transactions (account_id, kind, amount_minor, category) values ($1, 'income', 50000, 'Allowance')`, [momo]);
      await tx.query(`insert into public.transactions (account_id, kind, amount_minor, category) values ($1, 'expense', 1250, 'Food')`, [momo]);
      await tx.query(`insert into public.transactions (account_id, kind, amount_minor, transfer_account_id) values ($1, 'transfer', 20000, $2)`, [momo, bank]);
    });
    const b = await balances(alice);
    expect(b[momo]).toBe(10000 + 50000 - 1250 - 20000); // 38750 pesewas = GHS 387.50
    expect(b[bank]).toBe(20000);
    expect(b[usd]).toBe(0);
  });

  it('rejects zero or negative amounts', async () => {
    for (const amt of [0, -100]) {
      await expect(
        asUser(db, alice, (tx) =>
          tx.query(`insert into public.transactions (account_id, kind, amount_minor) values ($1, 'expense', $2)`, [momo, amt]),
        ),
      ).rejects.toThrow(/check constraint/);
    }
  });

  it('rejects malformed transfers', async () => {
    await expect(
      asUser(db, alice, (tx) => tx.query(`insert into public.transactions (account_id, kind, amount_minor) values ($1, 'transfer', 100)`, [momo])),
    ).rejects.toThrow(/transactions_transfer_shape/);
    await expect(
      asUser(db, alice, (tx) =>
        tx.query(`insert into public.transactions (account_id, kind, amount_minor, transfer_account_id) values ($1, 'transfer', 100, $1)`, [momo]),
      ),
    ).rejects.toThrow(/transactions_transfer_shape/);
    await expect(
      asUser(db, alice, (tx) =>
        tx.query(`insert into public.transactions (account_id, kind, amount_minor, transfer_account_id) values ($1, 'expense', 100, $2)`, [momo, bank]),
      ),
    ).rejects.toThrow(/transactions_transfer_shape/);
  });

  it('refuses transfers across currencies (no invented exchange rate)', async () => {
    await expect(
      asUser(db, alice, (tx) =>
        tx.query(`insert into public.transactions (account_id, kind, amount_minor, transfer_account_id) values ($1, 'transfer', 100, $2)`, [momo, usd]),
      ),
    ).rejects.toThrow(/same currency/);
  });

  it('refuses changing the currency of an account with transactions', async () => {
    await expect(
      asUser(db, alice, (tx) => tx.query(`update public.financial_accounts set currency = 'USD' where id = $1`, [momo])),
    ).rejects.toThrow(/Cannot change the currency/);
  });
});

describe('ownership', () => {
  it("cannot record into or transfer to another user's account", async () => {
    await expect(
      asUser(db, alice, (tx) => tx.query(`insert into public.transactions (account_id, kind, amount_minor) values ($1, 'income', 100)`, [bobAcc])),
    ).rejects.toThrow(/foreign key/);
    await expect(
      asUser(db, alice, (tx) =>
        tx.query(`insert into public.transactions (account_id, kind, amount_minor, transfer_account_id) values ($1, 'transfer', 100, $2)`, [momo, bobAcc]),
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it('balance view only shows the caller’s accounts', async () => {
    const b = await balances(bob);
    expect(Object.keys(b)).toEqual([bobAcc]);
  });

  it.each(['financial_accounts', 'transactions', 'budgets', 'savings_goals', 'account_balances'])(
    'anon cannot read %s',
    async (t) => {
      await expect(asUser(db, null, (tx) => tx.query(`select * from public.${t}`))).rejects.toThrow(/permission denied/);
    },
  );

  it('cannot set user_id directly', async () => {
    await expect(
      asUser(db, alice, (tx) => tx.query(`insert into public.budgets (category, monthly_limit_minor, user_id) values ('Food', 100, $1)`, [bob])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('budgets and goals', () => {
  it('one budget per category and currency', async () => {
    await asUser(db, alice, (tx) => tx.query(`insert into public.budgets (category, monthly_limit_minor) values ('Food', 30000)`));
    await expect(
      asUser(db, alice, (tx) => tx.query(`insert into public.budgets (category, monthly_limit_minor) values ('Food', 10000)`)),
    ).rejects.toThrow(/budgets_unique/);
  });

  it("goals must link to the user's own account", async () => {
    await asUser(db, alice, (tx) =>
      tx.query(`insert into public.savings_goals (name, account_id, target_minor) values ('Laptop', $1, 500000)`, [bank]),
    );
    await expect(
      asUser(db, alice, (tx) =>
        tx.query(`insert into public.savings_goals (name, account_id, target_minor) values ('x', $1, 100)`, [bobAcc]),
      ),
    ).rejects.toThrow(/foreign key/);
  });
});

describe('audit', () => {
  it('records every transaction change', async () => {
    const id = await asUser(db, alice, (tx) =>
      one(tx, `insert into public.transactions (account_id, kind, amount_minor, category) values ($1, 'expense', 500, 'Transport') returning id`, [momo]),
    );
    await asUser(db, alice, (tx) => tx.query(`update public.transactions set amount_minor = 700 where id = $1`, [id]));
    await asUser(db, alice, (tx) => tx.query(`delete from public.transactions where id = $1`, [id]));
    const { rows } = await db.query<{ action: string }>(
      `select action from public.audit_logs where table_name = 'transactions' and record_id = $1 order by id`,
      [id],
    );
    expect(rows.map((r) => r.action)).toEqual(['INSERT', 'UPDATE', 'DELETE']);
  });

  it('account deletion cascades through finances', async () => {
    const carol = await createUser(db, 'carol@example.test');
    await asUser(db, carol, async (tx) => {
      const a = await one(tx, `insert into public.financial_accounts (name) values ('c') returning id`);
      await tx.query(`insert into public.transactions (account_id, kind, amount_minor) values ($1, 'income', 100)`, [a]);
    });
    await db.query('delete from auth.users where id = $1', [carol]);
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.transactions where user_id = $1`, [carol]);
    expect(rows[0]!.n).toBe(0);
  });
});
