-- NEXUS migration 0013 — Weekly reviews and Opportunity Radar (Phase 6)
-- weekly_reviews: one reflection per ISO week, with a stats snapshot taken from records.
-- opportunities: scholarships, internships, competitions… saved by the user. The link check
--   (link_status / link_checked_at) is written only by the server-side verify function.

create table public.weekly_reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  week_key    text not null check (week_key ~ '^\d{4}-W\d{2}$'),
  wins        text check (wins is null or char_length(wins) <= 1000),
  challenges  text check (challenges is null or char_length(challenges) <= 1000),
  lessons     text check (lessons is null or char_length(lessons) <= 1000),
  next_focus  text check (next_focus is null or char_length(next_focus) <= 1000),
  energy      smallint check (energy between 1 and 5),
  stats       jsonb not null default '{}'::jsonb check (jsonb_typeof(stats) = 'object'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint weekly_reviews_once unique (user_id, week_key)
);

create table public.opportunities (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title            text not null check (char_length(title) between 1 and 160),
  kind             text not null default 'other'
                     check (kind in ('scholarship', 'internship', 'competition', 'certification', 'job', 'grant', 'event', 'business', 'other')),
  organisation     text check (organisation is null or char_length(organisation) <= 120),
  url              text check (url is null or (char_length(url) <= 500 and url ~* '^https://')),
  description      text check (description is null or char_length(description) <= 1000),
  eligibility      text check (eligibility is null or char_length(eligibility) <= 500),
  deadline         date,
  relevance        text check (relevance is null or char_length(relevance) <= 300),
  next_action      text check (next_action is null or char_length(next_action) <= 300),
  status           text not null default 'saved' check (status in ('saved', 'applying', 'applied', 'won', 'rejected', 'dropped')),
  tags             text[] not null default '{}' check (cardinality(tags) <= 12),
  link_status      text not null default 'unchecked' check (link_status in ('unchecked', 'ok', 'broken')),
  link_checked_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index opportunities_user_deadline_idx on public.opportunities (user_id, deadline);

-- Editing the URL resets its verification.
create or replace function public.opportunities_reset_link_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.url is distinct from old.url then
    new.link_status := 'unchecked';
    new.link_checked_at := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.opportunities_reset_link_check() from public, anon, authenticated;

create trigger opportunities_reset_link_check before update on public.opportunities
  for each row execute function public.opportunities_reset_link_check();
create trigger weekly_reviews_set_updated_at before update on public.weekly_reviews for each row execute function public.set_updated_at();
create trigger opportunities_set_updated_at  before update on public.opportunities  for each row execute function public.set_updated_at();

alter table public.weekly_reviews enable row level security;
alter table public.opportunities  enable row level security;
revoke all on public.weekly_reviews, public.opportunities from anon, authenticated;

grant select, delete on public.weekly_reviews, public.opportunities to authenticated;
grant insert (week_key, wins, challenges, lessons, next_focus, energy, stats),
      update (wins, challenges, lessons, next_focus, energy, stats)
  on public.weekly_reviews to authenticated;
grant insert (title, kind, organisation, url, description, eligibility, deadline, relevance, next_action, status, tags),
      update (title, kind, organisation, url, description, eligibility, deadline, relevance, next_action, status, tags)
  on public.opportunities to authenticated;

create policy "weekly_reviews: owner only" on public.weekly_reviews for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "opportunities: owner only" on public.opportunities for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
