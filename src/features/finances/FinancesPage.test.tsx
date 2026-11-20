import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { FinanceData } from './api';
import { todayIn } from '../../lib/dates';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const today = todayIn('Africa/Accra');

const data: FinanceData = {
  accounts: [
    { id: id(1), name: 'MTN MoMo', kind: 'mobile_money', currency: 'GHS', opening_balance_minor: 10000, archived_at: null },
    { id: id(2), name: 'Savings', kind: 'savings', currency: 'GHS', opening_balance_minor: 0, archived_at: null },
    { id: id(3), name: 'Student loan', kind: 'loan', currency: 'GHS', opening_balance_minor: -5000, archived_at: null },
  ],
  balances: new Map([
    [id(1), 38750],
    [id(2), 20000],
    [id(3), -5000],
  ]),
  transactions: [
    { id: id(10), account_id: id(1), kind: 'income', amount_minor: 50000, occurred_on: today, category: 'Allowance', note: null, transfer_account_id: null },
    { id: id(11), account_id: id(1), kind: 'expense', amount_minor: 1250, occurred_on: today, category: 'Food', note: 'Waakye', transfer_account_id: null },
    { id: id(12), account_id: id(1), kind: 'transfer', amount_minor: 20000, occurred_on: today, category: null, note: null, transfer_account_id: id(2) },
  ],
  budgets: [{ id: id(20), category: 'Food', currency: 'GHS', monthly_limit_minor: 1500 }],
  goals: [{ id: id(30), name: 'Laptop', account_id: id(2), target_minor: 80000, target_date: null }],
};

vi.mock('./api', async (orig) => ({
  ...(await orig<typeof import('./api')>()),
  useFinances: () => ({ data, error: null, reload: async () => {} }),
}));
vi.mock('../profile/ProfileProvider', () => ({
  useProfile: () => ({ profile: { timezone: 'Africa/Accra', default_currency: 'GHS' } }),
}));

const { FinancesPage } = await import('./FinancesPage');

describe('FinancesPage', () => {
  it('shows net worth, month totals, budget status, goal progress and the ledger', () => {
    render(
      <MemoryRouter>
        <FinancesPage />
      </MemoryRouter>,
    );
    const stat = (label: RegExp) => screen.getByText(label).nextElementSibling?.textContent ?? '';
    expect(stat(/^Net worth$/)).toMatch(/537\.50/); // 387.50 + 200.00 − 50.00
    expect(stat(/ in$/)).toMatch(/500\.00/); // transfer excluded
    expect(stat(/ out$/)).toMatch(/12\.50/);
    expect(screen.getByText(/2\.50 left · 83%/)).toBeInTheDocument(); // Food 12.50 of 15.00
    expect(screen.getByRole('progressbar', { name: 'Laptop progress' })).toHaveAttribute('aria-valuenow', '25');
    expect(screen.getByText(/Waakye/)).toBeInTheDocument();
  });
});
