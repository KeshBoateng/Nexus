-- NEXUS migration 0008 — Recommendations, feedback and daily briefings (Phase 4)
-- recommendations: each one shown to the user, with its reasoning and evidence (spec §5).
-- recommendation_events: the lifecycle — viewed / accepted / started / completed / applied /
--   dismissed — kept separately so "clicked" is never confused with "achieved" (spec §6).
-- recommendation_feedback: very useful / somewhat / not useful / already know (+ reason).
-- Events and feedback are append-only history.

create table public.recommendations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  rule_type    text not null check (char_length(rule_type) between 1 and 60),
  rule_key     text not null check (char_length(rule_key) between 1 and 200),
  category     text not null check (category in ('academic', 'financial', 'goals', 'habits', 'projects', 'leadership', 'development', 'personal')),
  kind         text not null check (kind in ('immediate', 'preventive', 'developmental', 'corrective')),
  title        text not null check (char_length(title) between 1 and 200),
  action       text not null check (char_length(action) between 1 and 500),
  why          text not null check (char_length(why) between 1 and 500),
  benefit      text check (benefit is null or char_length(benefit) <= 300),
  evidence     jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  priority     smallint not null check (priority between 0 and 100),
  est_minutes  smallint check (est_minutes between 1 and 600),
  due_on       date,
  essential    boolean not null default false,
  shown_on     date not null,
  status       text not null default 'open'
                 check (status in ('open', 'accepted', 'started', 'completed', 'applied', 'dismissed')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint recommendations_once_per_day unique (user_id, rule_key, shown_on),
  constraint recommendations_id_user unique (id, user_id)
);

create index recommendations_user_shown_idx on public.recommendations (user_id, shown_on desc);
create index recommendations_user_type_idx on public.recommendations (user_id, rule_type);

create table public.recommendation_events (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  recommendation_id  uuid not null,
  event              text not null check (event in ('viewed', 'accepted', 'started', 'completed', 'applied', 'dismissed')),
  created_at         timestamptz not null default now(),
  constraint recommendation_events_owner foreign key (recommendation_id, user_id)
    references public.recommendations (id, user_id) on delete cascade
);

create index recommendation_events_rec_idx on public.recommendation_events (recommendation_id);
create index recommendation_events_user_idx on public.recommendation_events (user_id);

create table public.recommendation_feedback (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  recommendation_id  uuid not null,
  rating             text not null check (rating in ('very_useful', 'somewhat_useful', 'not_useful', 'already_know')),
  reason             text check (reason is null or char_length(reason) <= 300),
  created_at         timestamptz not null default now(),
  constraint recommendation_feedback_owner foreign key (recommendation_id, user_id)
    references public.recommendations (id, user_id) on delete cascade
);

create index recommendation_feedback_rec_idx on public.recommendation_feedback (recommendation_id);
create index recommendation_feedback_user_idx on public.recommendation_feedback (user_id, created_at desc);

create table public.daily_briefings (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  on_date             date not null,
  recommendation_ids  uuid[] not null default '{}',
  summary             jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint daily_briefings_once_per_day unique (user_id, on_date)
);

create trigger recommendations_set_updated_at  before update on public.recommendations  for each row execute function public.set_updated_at();
create trigger daily_briefings_set_updated_at  before update on public.daily_briefings  for each row execute function public.set_updated_at();

alter table public.recommendations         enable row level security;
alter table public.recommendation_events   enable row level security;
alter table public.recommendation_feedback enable row level security;
alter table public.daily_briefings         enable row level security;

revoke all on public.recommendations, public.recommendation_events, public.recommendation_feedback, public.daily_briefings
  from anon, authenticated;

grant select, delete on public.recommendations, public.daily_briefings to authenticated;
grant insert (rule_type, rule_key, category, kind, title, action, why, benefit, evidence, priority, est_minutes, due_on, essential, shown_on, status)
  on public.recommendations to authenticated;
-- After creation only the lifecycle status changes; the original reasoning is history.
grant update (status) on public.recommendations to authenticated;

grant select on public.recommendation_events, public.recommendation_feedback to authenticated;
grant insert (recommendation_id, event) on public.recommendation_events to authenticated;
grant insert (recommendation_id, rating, reason) on public.recommendation_feedback to authenticated;

grant insert (on_date, recommendation_ids, summary), update (recommendation_ids, summary) on public.daily_briefings to authenticated;

create policy "recommendations: owner only" on public.recommendations for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "recommendation_events: owner only" on public.recommendation_events for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "recommendation_feedback: owner only" on public.recommendation_feedback for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "daily_briefings: owner only" on public.daily_briefings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
