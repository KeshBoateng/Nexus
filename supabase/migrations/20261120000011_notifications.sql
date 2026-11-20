-- NEXUS migration 0011 — Notifications and accountability (Phase 5)
-- notifications: created only by the server-side `notify` job; the user reads, snoozes,
--   dismisses or deletes them. dedupe_key prevents duplicates; source_key lets the job
--   suppress a reminder once the underlying item is done.
-- notification_preferences: per category, in-app and push on/off.
-- push_subscriptions: this user's devices (Web Push endpoints).
-- app_secrets: server-only values (VAPID keys, cron token). Generated inside Supabase;
--   no grants to anon/authenticated, so only the service role can read them.

alter table public.user_preferences
  add column accountability_mode boolean not null default false;
grant update (accountability_mode) on public.user_preferences to authenticated;

create table public.notifications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  category       text not null check (category in ('academic', 'financial', 'study', 'career', 'project', 'leadership', 'habit', 'review', 'recommendation', 'system')),
  priority       text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  title          text not null check (char_length(title) between 1 and 120),
  body           text check (body is null or char_length(body) <= 300),
  link           text check (link is null or link ~ '^/([A-Za-z0-9_?=&.-][A-Za-z0-9/_?=&.-]*)?$'),
  dedupe_key     text not null check (char_length(dedupe_key) between 1 and 200),
  source_key     text check (source_key is null or char_length(source_key) <= 200),
  pushed_at      timestamptz,
  read_at        timestamptz,
  snoozed_until  timestamptz,
  dismissed_at   timestamptz,
  created_at     timestamptz not null default now(),
  constraint notifications_dedupe unique (user_id, dedupe_key)
);

create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_unpushed_idx on public.notifications (created_at) where pushed_at is null and dismissed_at is null;

create table public.notification_preferences (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  category    text not null check (category in ('academic', 'financial', 'study', 'career', 'project', 'leadership', 'habit', 'review', 'recommendation', 'system')),
  in_app      boolean not null default true,
  push        boolean not null default true,
  updated_at  timestamptz not null default now(),
  constraint notification_preferences_unique unique (user_id, category)
);

create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  endpoint    text not null check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh      text not null check (char_length(p256dh) <= 200),
  auth        text not null check (char_length(auth) <= 100),
  user_agent  text check (user_agent is null or char_length(user_agent) <= 300),
  created_at  timestamptz not null default now(),
  constraint push_subscriptions_endpoint unique (endpoint)
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table public.app_secrets (
  name        text primary key check (char_length(name) between 1 and 60),
  value       text not null,
  created_at  timestamptz not null default now()
);

create trigger notification_preferences_set_updated_at before update on public.notification_preferences
  for each row execute function public.set_updated_at();

alter table public.notifications            enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions       enable row level security;
alter table public.app_secrets              enable row level security;

revoke all on public.notifications, public.notification_preferences, public.push_subscriptions, public.app_secrets
  from anon, authenticated;

grant select, delete on public.notifications to authenticated;
grant update (read_at, snoozed_until, dismissed_at) on public.notifications to authenticated;

grant select on public.notification_preferences to authenticated;
grant insert (category, in_app, push), update (in_app, push) on public.notification_preferences to authenticated;

grant select, delete on public.push_subscriptions to authenticated;
grant insert (endpoint, p256dh, auth, user_agent) on public.push_subscriptions to authenticated;

-- app_secrets: no grants, no policies → invisible to anon/authenticated.

create policy "notifications: owner only" on public.notifications for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "notification_preferences: owner only" on public.notification_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "push_subscriptions: owner only" on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Budgets over their monthly limit for one user (used by the notify job, which runs as the
-- service role). Takes a user id, so it must never be callable by signed-in users.
create or replace function public.nexus_budgets_over(p_user uuid, p_currency char(3), p_month text)
returns table (category text, spent_minor bigint, limit_minor bigint)
language sql
stable
set search_path = ''
as $$
  select b.category, coalesce(sum(t.amount_minor), 0)::bigint, b.monthly_limit_minor
  from public.budgets b
  left join public.transactions t
    on t.user_id = b.user_id
   and t.kind = 'expense'
   and t.category = b.category
   and to_char(t.occurred_on, 'YYYY-MM') = p_month
   and exists (select 1 from public.financial_accounts a where a.id = t.account_id and a.currency = b.currency)
  where b.user_id = p_user and b.currency = p_currency
  group by b.category, b.monthly_limit_minor
  having coalesce(sum(t.amount_minor), 0) > b.monthly_limit_minor
$$;

revoke execute on function public.nexus_budgets_over(uuid, char, text) from public, anon, authenticated;
