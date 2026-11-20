-- NEXUS migration 0004 — Finances (Phase 2, slice 2)
-- Tables: financial_accounts, transactions, budgets, savings_goals; view: account_balances
-- Money is bigint minor units (pesewas for GHS). Balances are never stored — they are
-- computed from the opening balance and the transaction ledger, so they cannot drift.
-- No FX: a transfer must stay within one currency; totals are per currency.

-- ---------------------------------------------------------------------------
-- financial_accounts
-- ---------------------------------------------------------------------------
create table public.financial_accounts (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name                   text not null check (char_length(name) between 1 and 60),
  kind                   text not null default 'cash'
                           check (kind in ('cash', 'mobile_money', 'bank', 'savings', 'investment', 'credit', 'loan', 'other')),
  currency               char(3) not null default 'GHS' check (currency ~ '^[A-Z]{3}$'),
  opening_balance_minor  bigint not null default 0,
  archived_at            timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint financial_accounts_id_user unique (id, user_id)
);

create index financial_accounts_user_idx on public.financial_accounts (user_id);

-- ---------------------------------------------------------------------------
-- transactions — the ledger
-- ---------------------------------------------------------------------------
create table public.transactions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  account_id           uuid not null,
  kind                 text not null check (kind in ('income', 'expense', 'transfer')),
  amount_minor         bigint not null check (amount_minor > 0),
  occurred_on          date not null default current_date,
  category             text check (category is null or char_length(category) between 1 and 40),
  note                 text check (note is null or char_length(note) <= 200),
  transfer_account_id  uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint transactions_account_owner foreign key (account_id, user_id)
    references public.financial_accounts (id, user_id) on delete cascade,
  constraint transactions_transfer_owner foreign key (transfer_account_id, user_id)
    references public.financial_accounts (id, user_id) on delete cascade,
  constraint transactions_transfer_shape check (
    (kind = 'transfer' and transfer_account_id is not null and transfer_account_id <> account_id and category is null)
    or (kind <> 'transfer' and transfer_account_id is null)
  )
);

create index transactions_user_date_idx on public.transactions (user_id, occurred_on desc);
create index transactions_account_idx on public.transactions (account_id);
create index transactions_transfer_account_idx on public.transactions (transfer_account_id);

-- Transfers may not cross currencies (that would invent an exchange rate).
create or replace function public.check_transfer_currency()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'transfer' and (
    select count(distinct currency) from public.financial_accounts
    where id in (new.account_id, new.transfer_account_id)
  ) > 1 then
    raise exception 'Transfers must be between accounts with the same currency'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.check_transfer_currency() from public, anon, authenticated;

create trigger transactions_check_transfer_currency
  before insert or update on public.transactions
  for each row execute function public.check_transfer_currency();

-- Changing an account's currency after it has transactions would silently re-denominate them.
create or replace function public.lock_account_currency()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.currency <> old.currency and exists (
    select 1 from public.transactions t where t.account_id = old.id or t.transfer_account_id = old.id
  ) then
    raise exception 'Cannot change the currency of an account that has transactions'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.lock_account_currency() from public, anon, authenticated;

create trigger financial_accounts_lock_currency
  before update on public.financial_accounts
  for each row execute function public.lock_account_currency();

-- ---------------------------------------------------------------------------
-- budgets — a monthly limit per spending category and currency
-- ---------------------------------------------------------------------------
create table public.budgets (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  category             text not null check (char_length(category) between 1 and 40),
  currency             char(3) not null default 'GHS' check (currency ~ '^[A-Z]{3}$'),
  monthly_limit_minor  bigint not null check (monthly_limit_minor > 0),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint budgets_unique unique (user_id, category, currency)
);

create index budgets_user_idx on public.budgets (user_id);

-- ---------------------------------------------------------------------------
-- savings_goals — progress = the linked account's balance
-- ---------------------------------------------------------------------------
create table public.savings_goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 60),
  account_id    uuid not null,
  target_minor  bigint not null check (target_minor > 0),
  target_date   date,
  achieved_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint savings_goals_account_owner foreign key (account_id, user_id)
    references public.financial_accounts (id, user_id) on delete cascade
);

create index savings_goals_user_idx on public.savings_goals (user_id);
create index savings_goals_account_idx on public.savings_goals (account_id);

-- ---------------------------------------------------------------------------
-- account_balances — computed, exact (bigint sums). security_invoker → caller's RLS applies.
-- ---------------------------------------------------------------------------
create view public.account_balances
with (security_invoker = true) as
select
  a.id as account_id,
  a.user_id,
  a.currency,
  a.opening_balance_minor
    + coalesce(sum(case
        when t.kind = 'income'   and t.account_id = a.id          then  t.amount_minor
        when t.kind = 'expense'  and t.account_id = a.id          then -t.amount_minor
        when t.kind = 'transfer' and t.account_id = a.id          then -t.amount_minor
        when t.kind = 'transfer' and t.transfer_account_id = a.id then  t.amount_minor
      end), 0)::bigint as balance_minor
from public.financial_accounts a
left join public.transactions t
  on t.account_id = a.id or t.transfer_account_id = a.id
group by a.id;

-- ---------------------------------------------------------------------------
-- Triggers: updated_at + audit (money is audited, spec §2.2)
-- ---------------------------------------------------------------------------
create trigger financial_accounts_set_updated_at before update on public.financial_accounts for each row execute function public.set_updated_at();
create trigger transactions_set_updated_at       before update on public.transactions       for each row execute function public.set_updated_at();
create trigger budgets_set_updated_at            before update on public.budgets            for each row execute function public.set_updated_at();
create trigger savings_goals_set_updated_at      before update on public.savings_goals      for each row execute function public.set_updated_at();

create trigger financial_accounts_audit after insert or update or delete on public.financial_accounts
  for each row execute function public.audit_row_change('user_id', 'id');
create trigger transactions_audit after insert or update or delete on public.transactions
  for each row execute function public.audit_row_change('user_id', 'id');

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
alter table public.financial_accounts enable row level security;
alter table public.transactions       enable row level security;
alter table public.budgets            enable row level security;
alter table public.savings_goals      enable row level security;

revoke all on public.financial_accounts, public.transactions, public.budgets, public.savings_goals, public.account_balances
  from anon, authenticated;

grant select, delete on public.financial_accounts, public.transactions, public.budgets, public.savings_goals to authenticated;
grant select on public.account_balances to authenticated;

grant insert (name, kind, currency, opening_balance_minor, archived_at),
      update (name, kind, currency, opening_balance_minor, archived_at)
  on public.financial_accounts to authenticated;

grant insert (account_id, kind, amount_minor, occurred_on, category, note, transfer_account_id),
      update (account_id, kind, amount_minor, occurred_on, category, note, transfer_account_id)
  on public.transactions to authenticated;

grant insert (category, currency, monthly_limit_minor),
      update (category, currency, monthly_limit_minor)
  on public.budgets to authenticated;

grant insert (name, account_id, target_minor, target_date, achieved_at),
      update (name, account_id, target_minor, target_date, achieved_at)
  on public.savings_goals to authenticated;

create policy "financial_accounts: owner only" on public.financial_accounts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "transactions: owner only" on public.transactions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "budgets: owner only" on public.budgets for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "savings_goals: owner only" on public.savings_goals for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
