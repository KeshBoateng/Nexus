-- NEXUS migration 0005 — Goals and habits (Phase 2, slice 3)
-- Tables: goals, goal_milestones, habits, habit_checkins
-- Same ownership pattern as 0003/0004: user_id from the session, composite FKs to parents.

create table public.goals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 120),
  why          text check (why is null or char_length(why) <= 500),
  area         text not null default 'personal'
                 check (area in ('academic', 'financial', 'career', 'technical', 'leadership', 'business', 'health', 'personal')),
  horizon      text not null default 'short' check (horizon in ('short', 'long')),
  target_date  date,
  status       text not null default 'active' check (status in ('active', 'achieved', 'dropped')),
  closed_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint goals_closed_consistent check ((status = 'active') = (closed_at is null)),
  constraint goals_id_user unique (id, user_id)
);

create index goals_user_idx on public.goals (user_id, status);

create table public.goal_milestones (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  goal_id     uuid not null,
  title       text not null check (char_length(title) between 1 and 120),
  due_on      date,
  done_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint goal_milestones_goal_owner foreign key (goal_id, user_id)
    references public.goals (id, user_id) on delete cascade
);

create index goal_milestones_goal_idx on public.goal_milestones (goal_id);
create index goal_milestones_user_idx on public.goal_milestones (user_id);

create table public.habits (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 80),
  -- 7 = every day; 1–6 = that many days per week (Mon–Sun).
  target_per_week  smallint not null default 7 check (target_per_week between 1 and 7),
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint habits_id_user unique (id, user_id)
);

create index habits_user_idx on public.habits (user_id);

create table public.habit_checkins (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  habit_id    uuid not null,
  on_date     date not null,
  created_at  timestamptz not null default now(),
  constraint habit_checkins_habit_owner foreign key (habit_id, user_id)
    references public.habits (id, user_id) on delete cascade,
  constraint habit_checkins_once_per_day unique (habit_id, on_date)
);

create index habit_checkins_user_date_idx on public.habit_checkins (user_id, on_date desc);

create trigger goals_set_updated_at           before update on public.goals           for each row execute function public.set_updated_at();
create trigger goal_milestones_set_updated_at before update on public.goal_milestones for each row execute function public.set_updated_at();
create trigger habits_set_updated_at          before update on public.habits          for each row execute function public.set_updated_at();

alter table public.goals           enable row level security;
alter table public.goal_milestones enable row level security;
alter table public.habits          enable row level security;
alter table public.habit_checkins  enable row level security;

revoke all on public.goals, public.goal_milestones, public.habits, public.habit_checkins from anon, authenticated;

grant select, delete on public.goals, public.goal_milestones, public.habits, public.habit_checkins to authenticated;

grant insert (title, why, area, horizon, target_date, status, closed_at),
      update (title, why, area, horizon, target_date, status, closed_at)
  on public.goals to authenticated;

grant insert (goal_id, title, due_on, done_at),
      update (goal_id, title, due_on, done_at)
  on public.goal_milestones to authenticated;

grant insert (name, target_per_week, archived_at),
      update (name, target_per_week, archived_at)
  on public.habits to authenticated;

-- Check-ins are facts: add or remove, never edit.
grant insert (habit_id, on_date) on public.habit_checkins to authenticated;

create policy "goals: owner only" on public.goals for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "goal_milestones: owner only" on public.goal_milestones for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "habits: owner only" on public.habits for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "habit_checkins: owner only" on public.habit_checkins for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
