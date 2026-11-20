/**
 * Deterministic finance summaries. All amounts are integer minor units; every total goes
 * through sumMinor (safe-integer checked). Different currencies are never added together.
 */
import { sumMinor } from './money';

export interface LedgerEntry {
  account_id: string;
  kind: 'income' | 'expense' | 'transfer';
  amount_minor: number;
  occurred_on: string; // YYYY-MM-DD
  category: string | null;
}

export interface AccountRef {
  id: string;
  currency: string;
}

export type CurrencyTotals = Record<string, number>;

/** "2026-11" for a date string or Date (calendar month of the given date string; no tz shifting). */
export function monthKey(d: string | Date): string {
  if (typeof d === 'string') return d.slice(0, 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function currencyOf(accounts: ReadonlyMap<string, AccountRef>, accountId: string): string {
  const a = accounts.get(accountId);
  if (!a) throw new Error(`Unknown account ${accountId}`);
  return a.currency;
}

/** Income and expense per currency for one month. Transfers move money; they are neither. */
export function monthTotals(
  entries: readonly LedgerEntry[],
  accounts: ReadonlyMap<string, AccountRef>,
  month: string,
): { income: CurrencyTotals; expense: CurrencyTotals } {
  const income: Record<string, number[]> = {};
  const expense: Record<string, number[]> = {};
  for (const e of entries) {
    if (monthKey(e.occurred_on) !== month || e.kind === 'transfer') continue;
    const bucket = e.kind === 'income' ? income : expense;
    (bucket[currencyOf(accounts, e.account_id)] ??= []).push(e.amount_minor);
  }
  const total = (b: Record<string, number[]>) => Object.fromEntries(Object.entries(b).map(([c, xs]) => [c, sumMinor(xs)]));
  return { income: total(income), expense: total(expense) };
}

/** Expense per category for one month and currency, largest first. Uncategorised → "Other". */
export function spendingByCategory(
  entries: readonly LedgerEntry[],
  accounts: ReadonlyMap<string, AccountRef>,
  month: string,
  currency: string,
): { category: string; amount_minor: number }[] {
  const by: Record<string, number[]> = {};
  for (const e of entries) {
    if (e.kind !== 'expense' || monthKey(e.occurred_on) !== month) continue;
    if (currencyOf(accounts, e.account_id) !== currency) continue;
    (by[e.category ?? 'Other'] ??= []).push(e.amount_minor);
  }
  return Object.entries(by)
    .map(([category, xs]) => ({ category, amount_minor: sumMinor(xs) }))
    .sort((a, b) => b.amount_minor - a.amount_minor);
}

export type BudgetStatus = 'ok' | 'warn' | 'over';

/** Budget use. percent is a whole number (floored) so 79.9% never shows as 80%. */
export function budgetProgress(limitMinor: number, spentMinor: number): {
  remaining_minor: number;
  percent: number;
  status: BudgetStatus;
} {
  if (!Number.isSafeInteger(limitMinor) || limitMinor <= 0) throw new Error('Budget limit must be a positive integer');
  const percent = Math.floor((spentMinor * 100) / limitMinor);
  const status: BudgetStatus = spentMinor > limitMinor ? 'over' : percent >= 80 ? 'warn' : 'ok';
  return { remaining_minor: limitMinor - spentMinor, percent, status };
}

/** Sum of balances per currency (liabilities are negative balances). */
export function netWorthByCurrency(balances: readonly { currency: string; balance_minor: number }[]): CurrencyTotals {
  const by: Record<string, number[]> = {};
  for (const b of balances) (by[b.currency] ??= []).push(b.balance_minor);
  return Object.fromEntries(Object.entries(by).map(([c, xs]) => [c, sumMinor(xs)]));
}

/** Goal progress as a whole percent, 0–100. */
export function goalPercent(balanceMinor: number, targetMinor: number): number {
  if (targetMinor <= 0) throw new Error('Target must be positive');
  if (balanceMinor <= 0) return 0;
  return Math.min(100, Math.floor((balanceMinor * 100) / targetMinor));
}
