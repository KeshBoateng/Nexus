-- NEXUS migration 0001 — Foundation (Phase 1)
-- Tables: profiles, user_preferences, audit_logs
-- Principles: deny by default (RLS on every table), owner-scoped policies,
-- column-level write grants, append-only audit trail written only by triggers.

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user, created by trigger on signup
-- ---------------------------------------------------------------------------

create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  display_name     text check (display_name is null or char_length(display_name) between 1 and 80),
  timezone         text not null default 'Africa/Accra' check (char_length(timezone) between 1 and 64),
  default_currency char(3) not null default 'GHS' check (default_currency ~ '^[A-Z]{3}$'),
  onboarded_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.profiles is 'User profile. Rows are created by public.handle_new_user(); users may read and edit only their own.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- user_preferences — app settings, one row per user
-- ---------------------------------------------------------------------------

create table public.user_preferences (
  user_id            uuid primary key references public.profiles (id) on delete cascade,
  theme              text not null default 'dark' check (theme in ('dark', 'light', 'system')),
  briefing_time      time not null default '06:30',
  quiet_hours_start  time,
  quiet_hours_end    time,
  -- AI is opt-in. Nothing is sent to an external model unless this is true
  -- AND the specific data category is permitted (Phase 3 adds per-category controls).
  ai_enabled         boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint quiet_hours_both_or_neither
    check ((quiet_hours_start is null) = (quiet_hours_end is null))
);

create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- audit_logs — append-only; written by trigger only
-- ---------------------------------------------------------------------------

create table public.audit_logs (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  table_name  text not null,
  record_id   text not null,
  action      text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz not null default now()
);

create index audit_logs_user_created_idx on public.audit_logs (user_id, created_at desc);

-- Generic audit trigger. TG_ARGV[0] = name of the owner column, TG_ARGV[1] = primary key column.
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_col text := tg_argv[0];
  pk_col    text := tg_argv[1];
  row_data  jsonb;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  -- When the owning profile itself is being deleted, its audit rows cascade away; skip.
  if tg_op = 'DELETE' and tg_table_name = 'profiles' then
    return old;
  end if;

  insert into public.audit_logs (user_id, table_name, record_id, action, old_data, new_data)
  values (
    (row_data ->> owner_col)::uuid,
    tg_table_name,
    row_data ->> pk_col,
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.audit_row_change() from public;

create trigger profiles_audit
  after insert or update on public.profiles
  for each row execute function public.audit_row_change('id', 'id');

create trigger user_preferences_audit
  after insert or update on public.user_preferences
  for each row execute function public.audit_row_change('user_id', 'user_id');

-- ---------------------------------------------------------------------------
-- Signup hook: create profile + preferences for every new auth user
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_name text := nullif(btrim(new.raw_user_meta_data ->> 'display_name'), '');
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(requested_name, 80));

  insert into public.user_preferences (user_id) values (new.id);
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security + grants
-- ---------------------------------------------------------------------------

alter table public.profiles         enable row level security;
alter table public.user_preferences enable row level security;
alter table public.audit_logs       enable row level security;

-- Anonymous callers get nothing.
revoke all on public.profiles, public.user_preferences, public.audit_logs from anon;
revoke all on public.profiles, public.user_preferences, public.audit_logs from authenticated;

-- profiles: read own; update only whitelisted columns. Insert/delete happen via auth triggers.
grant select on public.profiles to authenticated;
grant update (display_name, timezone, default_currency, onboarded_at) on public.profiles to authenticated;

create policy "profiles: owner can read"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles: owner can update"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- user_preferences: read own; update whitelisted columns.
grant select on public.user_preferences to authenticated;
grant update (theme, briefing_time, quiet_hours_start, quiet_hours_end, ai_enabled)
  on public.user_preferences to authenticated;

create policy "user_preferences: owner can read"
  on public.user_preferences for select to authenticated
  using (user_id = (select auth.uid()));

create policy "user_preferences: owner can update"
  on public.user_preferences for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- audit_logs: owner may read; nobody may write directly (no insert/update/delete grant or policy).
grant select on public.audit_logs to authenticated;

create policy "audit_logs: owner can read"
  on public.audit_logs for select to authenticated
  using (user_id = (select auth.uid()));
