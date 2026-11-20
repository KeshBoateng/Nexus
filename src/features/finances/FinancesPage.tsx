import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ArrowLeftRight, ChevronLeft, Plus, Trash2, X } from 'lucide-react';
import { Button, Field, Notice, Panel, Select, TextInput } from '../../components/ui';
import { formatMoney, parseMoney, toDecimalString } from '../../lib/money';
import { budgetProgress, goalPercent, monthKey, monthTotals, netWorthByCurrency, spendingByCategory } from '../../lib/finance';
import { todayIn } from '../../lib/dates';
import { useProfile } from '../profile/ProfileProvider';
import {
  ACCOUNT_KINDS,
  ACCOUNT_KIND_LABEL,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  removeRow,
  saveAccount,
  saveBudget,
  saveGoal,
  saveTx,
  setArchived,
  useFinances,
  type Account,
  type FinanceData,
  type Tx,
} from './api';

type Run = (fn: () => Promise<void>) => Promise<boolean>;

function useRunner(reload: () => Promise<void>) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run: Run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { run, error, busy };
}

export function FinancesPage() {
  const { data, error, reload } = useFinances();
  const { run, error: actionError, busy } = useRunner(reload);
  const { profile } = useProfile();
  const currency = profile?.default_currency ?? 'GHS';
  const tz = profile?.timezone ?? 'Africa/Accra';

  return (
    <div className="space-y-6">
      <header>
        <Link to="/life" className="mb-3 inline-flex items-center gap-1 text-sm text-text-muted hover:text-text">
          <ChevronLeft className="size-4" aria-hidden /> My Life
        </Link>
        <h1 className="text-[28px] font-semibold tracking-tight">Finances</h1>
      </header>
      {error && <Notice tone="danger">{error}</Notice>}
      {actionError && <Notice tone="danger">{actionError}</Notice>}
      {!data && !error && <p className="text-text-muted">Loading…</p>}
      {data && <Content data={data} run={run} busy={busy} currency={currency} tz={tz} />}
    </div>
  );
}

function Content({ data, run, busy, currency, tz }: { data: FinanceData; run: Run; busy: boolean; currency: string; tz: string }) {
  const today = todayIn(tz);
  const month = monthKey(today);
  const accountsById = useMemo(() => new Map(data.accounts.map((a) => [a.id, a])), [data.accounts]);
  const totals = monthTotals(data.transactions, accountsById, month);
  const worth = netWorthByCurrency(data.accounts.map((a) => ({ currency: a.currency, balance_minor: data.balances.get(a.id) ?? 0 })));
  const otherCurrencies = Object.keys(worth).filter((c) => c !== currency);
  const monthLabel = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));

  if (data.accounts.length === 0) {
    return (
      <Panel title="Add your first account">
        <p className="mb-4 text-[15px] text-text-muted">
          Start with where your money actually is — MoMo wallet, cash, bank. Enter today's balance as the opening balance;
          everything after that is tracked from your transactions.
        </p>
        <AccountForm run={run} busy={busy} defaultCurrency={currency} onDone={() => {}} />
      </Panel>
    );
  }

  return (
    <>
      <section className="grid grid-cols-3 gap-3">
        <Stat label="Net worth" value={formatMoney(worth[currency] ?? 0, currency)} emphasis />
        <Stat label={`${monthLabel} in`} value={formatMoney(totals.income[currency] ?? 0, currency)} />
        <Stat label={`${monthLabel} out`} value={formatMoney(totals.expense[currency] ?? 0, currency)} />
      </section>
      {otherCurrencies.length > 0 && (
        <p className="tabular -mt-3 text-sm text-text-muted">
          Also: {otherCurrencies.map((c) => formatMoney(worth[c]!, c)).join(' · ')} (kept separate — no exchange rates are assumed)
        </p>
      )}

      <QuickAdd data={data} run={run} busy={busy} today={today} />
      <Budgets data={data} run={run} busy={busy} currency={currency} month={month} accountsById={accountsById} />
      <Accounts data={data} run={run} busy={busy} currency={currency} />
      <Goals data={data} run={run} busy={busy} />
      <Recent data={data} run={run} accountsById={accountsById} />
    </>
  );
}

function Stat({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-surface px-4 py-3">
      <p className="truncate text-xs text-text-faint">{label}</p>
      <p className={`tabular mt-1 truncate font-semibold tracking-tight ${emphasis ? 'text-[19px] text-accent sm:text-[24px]' : 'text-[17px] sm:text-[20px]'}`}>
        {value}
      </p>
    </div>
  );
}

function ConfirmDelete({ onConfirm, label }: { onConfirm: () => void; label: string }) {
  const [armed, setArmed] = useState(false);
  return armed ? (
    <span className="inline-flex items-center gap-1">
      <button className="rounded-lg px-2 py-1 text-xs font-medium text-danger hover:bg-surface-raised" onClick={onConfirm}>
        Delete
      </button>
      <button className="rounded-lg p-1 text-text-faint hover:text-text" onClick={() => setArmed(false)} aria-label="Cancel">
        <X className="size-4" aria-hidden />
      </button>
    </span>
  ) : (
    <button className="rounded-lg p-1.5 text-text-faint hover:text-danger" onClick={() => setArmed(true)} aria-label={label}>
      <Trash2 className="size-4" aria-hidden />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Quick add
// ---------------------------------------------------------------------------

function QuickAdd({ data, run, busy, today }: { data: FinanceData; run: Run; busy: boolean; today: string }) {
  const active = data.accounts.filter((a) => !a.archived_at);
  const [kind, setKind] = useState<Tx['kind']>('expense');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState(active[0]?.id ?? '');
  const [toId, setToId] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [flash, setFlash] = useState<string | null>(null);

  const from = active.find((a) => a.id === accountId);
  const targets = active.filter((a) => a.id !== accountId && a.currency === from?.currency);
  const suggestions = kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!from) return;
    const saved = await run(() =>
      saveTx({
        account_id: from.id,
        kind,
        amount_minor: parseMoney(amount, from.currency),
        occurred_on: date,
        category: kind === 'transfer' ? null : category.trim() || null,
        note: note.trim() || null,
        transfer_account_id: kind === 'transfer' ? toId || null : null,
      }),
    );
    if (saved) {
      setFlash(`Saved ${formatMoney(parseMoney(amount, from.currency), from.currency)}`);
      setAmount('');
      setNote('');
    }
  }

  const tab = (k: Tx['kind'], label: string) => (
    <button
      type="button"
      onClick={() => setKind(k)}
      aria-pressed={kind === k}
      className={`h-9 flex-1 rounded-lg text-sm font-medium ${kind === k ? 'bg-surface-raised text-text' : 'text-text-muted hover:text-text'}`}
    >
      {label}
    </button>
  );

  return (
    <Panel title="Record">
      <form onSubmit={submit} className="space-y-3">
        <div className="flex gap-1 rounded-xl border border-border p-1">
          {tab('expense', 'Expense')}
          {tab('income', 'Income')}
          {tab('transfer', 'Transfer')}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Amount${from ? ` (${from.currency})` : ''}`}>
            <TextInput inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required />
          </Field>
          <Field label="Date">
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={kind === 'transfer' ? 'From' : 'Account'}>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {active.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          {kind === 'transfer' ? (
            <Field label="To">
              <Select value={toId} onChange={(e) => setToId(e.target.value)} required>
                <option value="">Choose…</option>
                {targets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Category">
              <TextInput list={`cats-${kind}`} value={category} onChange={(e) => setCategory(e.target.value)} maxLength={40} />
              <datalist id={`cats-${kind}`}>
                {suggestions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
          )}
        </div>
        <Field label="Note">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Optional" />
        </Field>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy || !from}>
            Save
          </Button>
          {flash && <Notice tone="success">{flash}</Notice>}
        </div>
      </form>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

function Budgets({
  data,
  run,
  busy,
  currency,
  month,
  accountsById,
}: {
  data: FinanceData;
  run: Run;
  busy: boolean;
  currency: string;
  month: string;
  accountsById: Map<string, Account>;
}) {
  const [adding, setAdding] = useState(false);
  const spending = spendingByCategory(data.transactions, accountsById, month, currency);
  const spentOf = (cat: string) => spending.find((s) => s.category === cat)?.amount_minor ?? 0;
  const budgets = data.budgets.filter((b) => b.currency === currency);
  const unbudgeted = spending.filter((s) => !budgets.some((b) => b.category === s.category));

  return (
    <Panel
      title="Budgets this month"
      action={
        <Button variant="ghost" className="h-9 px-3 text-sm" onClick={() => setAdding((v) => !v)}>
          <Plus className="size-4" aria-hidden /> Add
        </Button>
      }
    >
      {adding && <BudgetForm run={run} busy={busy} currency={currency} onDone={() => setAdding(false)} />}
      {budgets.length === 0 && !adding && (
        <p className="text-[15px] text-text-muted">Set a monthly limit for categories you want to keep an eye on, like Food or Transport.</p>
      )}
      <ul className="space-y-4">
        {budgets.map((b) => {
          const spent = spentOf(b.category);
          const p = budgetProgress(b.monthly_limit_minor, spent);
          const bar = p.status === 'over' ? 'bg-danger' : p.status === 'warn' ? 'bg-accent' : 'bg-success';
          return (
            <li key={b.id}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[15px]">
                <span>{b.category}</span>
                <span className="flex items-center gap-1">
                  <span className="tabular text-sm text-text-muted">
                    {formatMoney(spent, currency)} / {formatMoney(b.monthly_limit_minor, currency)}
                  </span>
                  <ConfirmDelete label={`Delete ${b.category} budget`} onConfirm={() => run(() => removeRow('budgets', b.id))} />
                </span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-surface-raised"
                role="progressbar"
                aria-label={`${b.category} budget used`}
                aria-valuenow={Math.min(p.percent, 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(p.percent, 100)}%` }} />
              </div>
              <p className={`mt-1 text-xs ${p.status === 'over' ? 'text-danger' : 'text-text-faint'}`}>
                {p.status === 'over'
                  ? `Over by ${formatMoney(-p.remaining_minor, currency)}`
                  : `${formatMoney(p.remaining_minor, currency)} left · ${p.percent}%`}
              </p>
            </li>
          );
        })}
      </ul>
      {unbudgeted.length > 0 && budgets.length > 0 && (
        <p className="mt-4 text-xs text-text-faint">
          No budget: {unbudgeted.map((s) => `${s.category} ${formatMoney(s.amount_minor, currency)}`).join(' · ')}
        </p>
      )}
    </Panel>
  );
}

function BudgetForm({ run, busy, currency, onDone }: { run: Run; busy: boolean; currency: string; onDone: () => void }) {
  const [category, setCategory] = useState('');
  const [limit, setLimit] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    const saved = await run(() => saveBudget({ category, currency, monthly_limit_minor: parseMoney(limit, currency) }));
    if (saved) onDone();
  }
  return (
    <form onSubmit={submit} className="mb-4 grid grid-cols-[1fr_1fr_auto] items-end gap-3 rounded-xl border border-border p-4">
      <Field label="Category">
        <TextInput list="budget-cats" value={category} onChange={(e) => setCategory(e.target.value)} required maxLength={40} />
        <datalist id="budget-cats">
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <Field label={`Monthly limit (${currency})`}>
        <TextInput inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} required />
      </Field>
      <Button type="submit" disabled={busy}>
        Save
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

function Accounts({ data, run, busy, currency }: { data: FinanceData; run: Run; busy: boolean; currency: string }) {
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const list = data.accounts.filter((a) => Boolean(a.archived_at) === showArchived);
  const archivedCount = data.accounts.filter((a) => a.archived_at).length;

  return (
    <Panel
      title="Accounts"
      action={
        <Button variant="ghost" className="h-9 px-3 text-sm" onClick={() => setAdding((v) => !v)}>
          <Plus className="size-4" aria-hidden /> Add
        </Button>
      }
    >
      {adding && <AccountForm run={run} busy={busy} defaultCurrency={currency} onDone={() => setAdding(false)} />}
      <ul className="divide-y divide-border">
        {list.map((a) => {
          const bal = data.balances.get(a.id) ?? 0;
          return (
            <li key={a.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px]">{a.name}</p>
                <p className="text-xs text-text-faint">{ACCOUNT_KIND_LABEL[a.kind]}</p>
              </div>
              <span className={`tabular text-[15px] font-medium ${bal < 0 ? 'text-danger' : ''}`}>{formatMoney(bal, a.currency)}</span>
              <button
                className="rounded-lg px-2 py-1 text-xs text-text-faint hover:text-text"
                onClick={() => run(() => setArchived(a.id, !a.archived_at))}
              >
                {a.archived_at ? 'Restore' : 'Archive'}
              </button>
            </li>
          );
        })}
      </ul>
      {archivedCount > 0 && (
        <button className="mt-3 text-sm text-text-muted hover:text-text" onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? 'Show active' : `Show archived (${archivedCount})`}
        </button>
      )}
    </Panel>
  );
}

function AccountForm({ run, busy, defaultCurrency, onDone }: { run: Run; busy: boolean; defaultCurrency: string; onDone: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Account['kind']>('mobile_money');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [opening, setOpening] = useState('');
  const liability = kind === 'credit' || kind === 'loan';

  async function submit(e: FormEvent) {
    e.preventDefault();
    const amount = opening.trim() ? parseMoney(opening, currency) : 0;
    const saved = await run(() =>
      saveAccount({ name, kind, currency, opening_balance_minor: liability ? -Math.abs(amount) : amount }),
    );
    if (saved) onDone();
  }

  return (
    <form onSubmit={submit} className="mb-4 space-y-3 rounded-xl border border-border p-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder="MTN MoMo" />
        </Field>
        <Field label="Type">
          <Select value={kind} onChange={(e) => setKind(e.target.value as Account['kind'])}>
            {ACCOUNT_KINDS.map((k) => (
              <option key={k} value={k}>
                {ACCOUNT_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Currency">
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {['GHS', 'USD', 'EUR', 'GBP', 'NGN'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label={liability ? 'Amount owed today' : 'Balance today'} hint={liability ? 'Counted as negative in net worth.' : undefined}>
          <TextInput inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0.00" />
        </Field>
      </div>
      <Button type="submit" disabled={busy}>
        Save account
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

function Goals({ data, run, busy }: { data: FinanceData; run: Run; busy: boolean }) {
  const [adding, setAdding] = useState(false);
  const accounts = data.accounts.filter((a) => !a.archived_at);
  return (
    <Panel
      title="Savings goals"
      action={
        <Button variant="ghost" className="h-9 px-3 text-sm" onClick={() => setAdding((v) => !v)}>
          <Plus className="size-4" aria-hidden /> Add
        </Button>
      }
    >
      {adding && <GoalForm accounts={accounts} run={run} busy={busy} onDone={() => setAdding(false)} />}
      {data.goals.length === 0 && !adding && (
        <p className="text-[15px] text-text-muted">Link a goal to a savings account — progress is that account's balance.</p>
      )}
      <ul className="space-y-4">
        {data.goals.map((g) => {
          const acc = data.accounts.find((a) => a.id === g.account_id);
          const bal = data.balances.get(g.account_id) ?? 0;
          const pct = goalPercent(bal, g.target_minor);
          const cur = acc?.currency ?? 'GHS';
          return (
            <li key={g.id}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[15px]">
                <span>
                  {g.name} <span className="text-xs text-text-faint">· {acc?.name}</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="tabular text-sm text-text-muted">
                    {formatMoney(Math.max(bal, 0), cur)} / {formatMoney(g.target_minor, cur)}
                  </span>
                  <ConfirmDelete label={`Delete goal ${g.name}`} onConfirm={() => run(() => removeRow('savings_goals', g.id))} />
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-raised" role="progressbar" aria-label={`${g.name} progress`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1 text-xs text-text-faint">
                {pct}%{g.target_date ? ` · by ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${g.target_date}T00:00:00Z`))}` : ''}
              </p>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function GoalForm({ accounts, run, busy, onDone }: { accounts: Account[]; run: Run; busy: boolean; onDone: () => void }) {
  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState(accounts.find((a) => a.kind === 'savings')?.id ?? accounts[0]?.id ?? '');
  const [target, setTarget] = useState('');
  const [date, setDate] = useState('');
  const cur = accounts.find((a) => a.id === accountId)?.currency ?? 'GHS';
  async function submit(e: FormEvent) {
    e.preventDefault();
    const saved = await run(() => saveGoal({ name, account_id: accountId, target_minor: parseMoney(target, cur), target_date: date || null }));
    if (saved) onDone();
  }
  return (
    <form onSubmit={submit} className="mb-4 space-y-3 rounded-xl border border-border p-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Goal">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder="New laptop" />
        </Field>
        <Field label="Account">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Target (${cur})`}>
          <TextInput inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} required />
        </Field>
        <Field label="By (optional)">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Button type="submit" disabled={busy}>
        Save goal
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Recent transactions
// ---------------------------------------------------------------------------

function Recent({ data, run, accountsById }: { data: FinanceData; run: Run; accountsById: Map<string, Account> }) {
  const [limit, setLimit] = useState(15);
  const list = data.transactions.slice(0, limit);
  if (data.transactions.length === 0) return null;
  return (
    <Panel title="Recent">
      <ul className="divide-y divide-border">
        {list.map((t) => {
          const acc = accountsById.get(t.account_id);
          const cur = acc?.currency ?? 'GHS';
          const to = t.transfer_account_id ? accountsById.get(t.transfer_account_id) : undefined;
          const sign = t.kind === 'income' ? '+' : t.kind === 'expense' ? '−' : '';
          return (
            <li key={t.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px]">
                  {t.kind === 'transfer' ? (
                    <span className="inline-flex items-center gap-1.5">
                      {acc?.name} <ArrowLeftRight className="size-3.5 text-text-faint" aria-label="to" /> {to?.name}
                    </span>
                  ) : (
                    (t.category ?? 'Uncategorised')
                  )}
                </p>
                <p className="truncate text-xs text-text-faint">
                  {new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${t.occurred_on}T00:00:00Z`))}
                  {t.kind !== 'transfer' && ` · ${acc?.name}`}
                  {t.note && ` · ${t.note}`}
                </p>
              </div>
              <span
                className={`tabular shrink-0 text-[15px] font-medium ${t.kind === 'income' ? 'text-success' : t.kind === 'transfer' ? 'text-text-muted' : ''}`}
                title={`${toDecimalString(t.amount_minor, cur)} ${cur}`}
              >
                {sign}
                {formatMoney(t.amount_minor, cur)}
              </span>
              <ConfirmDelete label="Delete transaction" onConfirm={() => run(() => removeRow('transactions', t.id))} />
            </li>
          );
        })}
      </ul>
      {data.transactions.length > limit && (
        <button className="mt-3 text-sm text-text-muted hover:text-text" onClick={() => setLimit((l) => l + 30)}>
          Show more
        </button>
      )}
    </Panel>
  );
}
