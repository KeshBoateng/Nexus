import { describe, expect, it } from 'vitest';
import { budgetProgress, goalPercent, monthKey, monthTotals, netWorthByCurrency, spendingByCategory, type LedgerEntry } from './finance';

const accounts = new Map([
  ['momo', { id: 'momo', currency: 'GHS' }],
  ['bank', { id: 'bank', currency: 'GHS' }],
  ['card', { id: 'card', currency: 'USD' }],
]);

const e = (account_id: string, kind: LedgerEntry['kind'], amount_minor: number, occurred_on: string, category: string | null = null): LedgerEntry => ({
  account_id,
  kind,
  amount_minor,
  occurred_on,
  category,
});

const ledger: LedgerEntry[] = [
  e('momo', 'income', 80000, '2026-11-01', 'Allowance'),
  e('momo', 'expense', 1250, '2026-11-03', 'Food'),
  e('momo', 'expense', 2310, '2026-11-15', 'Food'),
  e('bank', 'expense', 600, '2026-11-30', 'Transport'),
  e('momo', 'expense', 999, '2026-11-20', null),
  e('momo', 'transfer', 20000, '2026-11-05'),
  e('momo', 'expense', 5000, '2026-10-31', 'Food'), // previous month
  e('card', 'expense', 1999, '2026-11-10', 'Software'),
];

describe('monthKey', () => {
  it('uses the calendar date as written', () => {
    expect(monthKey('2026-11-30')).toBe('2026-11');
    expect(monthKey(new Date(2026, 0, 5))).toBe('2026-01');
  });
});

describe('monthTotals', () => {
  it('splits by currency and ignores transfers and other months', () => {
    expect(monthTotals(ledger, accounts, '2026-11')).toEqual({
      income: { GHS: 80000 },
      expense: { GHS: 1250 + 2310 + 600 + 999, USD: 1999 },
    });
  });
  it('throws on an unknown account rather than guessing a currency', () => {
    expect(() => monthTotals([e('ghost', 'expense', 1, '2026-11-01')], accounts, '2026-11')).toThrow(/Unknown account/);
  });
});

describe('spendingByCategory', () => {
  it('groups, labels uncategorised as Other, sorts largest first', () => {
    expect(spendingByCategory(ledger, accounts, '2026-11', 'GHS')).toEqual([
      { category: 'Food', amount_minor: 3560 },
      { category: 'Other', amount_minor: 999 },
      { category: 'Transport', amount_minor: 600 },
    ]);
  });
});

describe('budgetProgress', () => {
  it.each([
    [10000, 0, 0, 'ok'],
    [10000, 7999, 79, 'ok'],
    [10000, 8000, 80, 'warn'],
    [10000, 10000, 100, 'warn'],
    [10000, 10001, 100, 'over'],
    [10000, 25000, 250, 'over'],
  ])('limit %i spent %i → %i%% %s', (limit, spent, pct, status) => {
    expect(budgetProgress(limit, spent)).toMatchObject({ percent: pct, status, remaining_minor: limit - spent });
  });
  it('rejects a non-positive limit', () => {
    expect(() => budgetProgress(0, 1)).toThrow();
  });
});

describe('netWorthByCurrency / goalPercent', () => {
  it('sums per currency with liabilities negative', () => {
    expect(
      netWorthByCurrency([
        { currency: 'GHS', balance_minor: 38750 },
        { currency: 'GHS', balance_minor: -50000 },
        { currency: 'USD', balance_minor: 1200 },
      ]),
    ).toEqual({ GHS: -11250, USD: 1200 });
  });
  it('caps goal progress at 0–100', () => {
    expect(goalPercent(-5, 100)).toBe(0);
    expect(goalPercent(33, 100)).toBe(33);
    expect(goalPercent(250, 100)).toBe(100);
  });
});
