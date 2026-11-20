import { useCallback, useEffect, useState } from 'react';
import { cached } from '../../lib/offline';
import { z } from 'zod';
import { requireSupabase } from '../../lib/supabase';

const minor = z.coerce.number().refine(Number.isSafeInteger, 'Amount out of range');

export const ACCOUNT_KINDS = ['cash', 'mobile_money', 'bank', 'savings', 'investment', 'credit', 'loan', 'other'] as const;
export const ACCOUNT_KIND_LABEL: Record<(typeof ACCOUNT_KINDS)[number], string> = {
  cash: 'Cash',
  mobile_money: 'Mobile money',
  bank: 'Bank',
  savings: 'Savings',
  investment: 'Investment',
  credit: 'Credit card',
  loan: 'Loan',
  other: 'Other',
};

export const EXPENSE_CATEGORIES = [
  'Food', 'Transport', 'Data & airtime', 'Rent', 'Utilities', 'School fees', 'Books & supplies',
  'Health', 'Clothing', 'Entertainment', 'Gifts', 'Family', 'Subscriptions', 'Other',
];
export const INCOME_CATEGORIES = ['Allowance', 'Salary', 'Business', 'Scholarship', 'Gift', 'Other'];

export const AccountSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.enum(ACCOUNT_KINDS),
  currency: z.string().length(3),
  opening_balance_minor: minor,
  archived_at: z.string().nullable(),
});
export type Account = z.infer<typeof AccountSchema>;

export const TxSchema = z.object({
  id: z.uuid(),
  account_id: z.uuid(),
  kind: z.enum(['income', 'expense', 'transfer']),
  amount_minor: minor,
  occurred_on: z.string(),
  category: z.string().nullable(),
  note: z.string().nullable(),
  transfer_account_id: z.uuid().nullable(),
});
export type Tx = z.infer<typeof TxSchema>;

export const BudgetSchema = z.object({
  id: z.uuid(),
  category: z.string(),
  currency: z.string().length(3),
  monthly_limit_minor: minor,
});
export type Budget = z.infer<typeof BudgetSchema>;

export const GoalSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  account_id: z.uuid(),
  target_minor: minor,
  target_date: z.string().nullable(),
});
export type Goal = z.infer<typeof GoalSchema>;

const BalanceSchema = z.object({ account_id: z.uuid(), currency: z.string(), balance_minor: minor });

export interface FinanceData {
  accounts: Account[];
  balances: Map<string, number>;
  transactions: Tx[];
  budgets: Budget[];
  goals: Goal[];
}

function ok<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

export async function fetchFinances(): Promise<FinanceData> {
  const sb = requireSupabase();
  const [accounts, balances, transactions, budgets, goals] = await Promise.all([
    sb.from('financial_accounts').select('id, name, kind, currency, opening_balance_minor, archived_at').order('created_at'),
    sb.from('account_balances').select('account_id, currency, balance_minor'),
    sb
      .from('transactions')
      .select('id, account_id, kind, amount_minor, occurred_on, category, note, transfer_account_id')
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false }),
    sb.from('budgets').select('id, category, currency, monthly_limit_minor').order('category'),
    sb.from('savings_goals').select('id, name, account_id, target_minor, target_date').order('created_at'),
  ]);
  return {
    accounts: z.array(AccountSchema).parse(ok(accounts)),
    balances: new Map(z.array(BalanceSchema).parse(ok(balances)).map((b) => [b.account_id, b.balance_minor])),
    transactions: z.array(TxSchema).parse(ok(transactions)),
    budgets: z.array(BudgetSchema).parse(ok(budgets)),
    goals: z.array(GoalSchema).parse(ok(goals)),
  };
}

// Writes: only client-writable columns (mirrors grants in migration 0004).
export const AccountInput = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(ACCOUNT_KINDS),
  currency: z.string().regex(/^[A-Z]{3}$/),
  opening_balance_minor: z.number().int().refine(Number.isSafeInteger),
});
export const TxInput = z
  .object({
    account_id: z.uuid(),
    kind: z.enum(['income', 'expense', 'transfer']),
    amount_minor: z.number().int().positive().refine(Number.isSafeInteger),
    occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    category: z.string().trim().min(1).max(40).nullable(),
    note: z.string().trim().max(200).nullable(),
    transfer_account_id: z.uuid().nullable(),
  })
  .refine((t) => (t.kind === 'transfer') === (t.transfer_account_id !== null), 'Choose the account to transfer to.')
  .refine((t) => t.transfer_account_id !== t.account_id, 'Pick two different accounts.');
export const BudgetInput = z.object({
  category: z.string().trim().min(1).max(40),
  currency: z.string().regex(/^[A-Z]{3}$/),
  monthly_limit_minor: z.number().int().positive().refine(Number.isSafeInteger),
});
export const GoalInput = z.object({
  name: z.string().trim().min(1).max(60),
  account_id: z.uuid(),
  target_minor: z.number().int().positive().refine(Number.isSafeInteger),
  target_date: z.string().nullable(),
});

type Table = 'financial_accounts' | 'transactions' | 'budgets' | 'savings_goals';

async function upsert(table: Table, row: object, id?: string) {
  const q = requireSupabase().from(table);
  ok(id ? await q.update(row).eq('id', id) : await q.insert(row));
}

export const saveAccount = (i: z.input<typeof AccountInput>, id?: string) => upsert('financial_accounts', AccountInput.parse(i), id);
export const saveTx = (i: z.input<typeof TxInput>, id?: string) =>
  upsert('transactions', { ...TxInput.parse(i), category: i.kind === 'transfer' ? null : i.category }, id);
export const saveBudget = (i: z.input<typeof BudgetInput>, id?: string) => upsert('budgets', BudgetInput.parse(i), id);
export const saveGoal = (i: z.input<typeof GoalInput>, id?: string) => upsert('savings_goals', GoalInput.parse(i), id);

export async function setArchived(accountId: string, archived: boolean) {
  ok(await requireSupabase().from('financial_accounts').update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', accountId));
}

export async function removeRow(table: Table, id: string) {
  ok(await requireSupabase().from(table).delete().eq('id', id));
}

export function useFinances() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<() => void> => {
    try {
      const d = await cached('finances', fetchFinances);
      return () => {
        setData(d);
        setError(null);
      };
    } catch (err) {
      return () => setError(err instanceof Error ? err.message : 'Could not load finances.');
    }
  }, []);

  const reload = useCallback(async () => (await load())(), [load]);

  useEffect(() => {
    let active = true;
    load().then((apply) => {
      if (active) apply();
    });
    return () => {
      active = false;
    };
  }, [load]);

  return { data, error, reload };
}
