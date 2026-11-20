-- NEXUS migration 0009 — Development tracks and learning (Phase 4)
-- skills: per track (technical / leadership / entrepreneurship) with the user's target level.
-- skill_evidence: what the user actually did — the ONLY input to the proficiency estimate
--   (spec §2.3: progress from evidence, not from ticking lessons).
-- learning_resources: resources the user adds (catalog resources live in the app, verified).
-- learning_progress: per resource — planned / in progress / completed, plus a separate
--   understanding check and "applied it", so finishing ≠ learning (spec §6).

create table public.skills (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  track         text not null check (track in ('technical', 'leadership', 'entrepreneurship')),
  name          text not null check (char_length(name) between 1 and 80),
  target_level  smallint not null default 3 check (target_level between 1 and 4),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint skills_unique unique (user_id, track, name),
  constraint skills_id_user unique (id, user_id)
);

create index skills_user_idx on public.skills (user_id, track);

create table public.skill_evidence (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  skill_id     uuid not null,
  kind         text not null check (kind in ('project', 'assessment', 'certification', 'exercise', 'work', 'teaching', 'leadership')),
  description  text not null check (char_length(description) between 1 and 300),
  link         text check (link is null or (char_length(link) <= 500 and link ~* '^https://')),
  occurred_on  date not null default current_date,
  -- 1 = tried with help, 2 = did it independently, 3 = led it / taught it / did it for real stakes
  strength     smallint not null default 1 check (strength between 1 and 3),
  created_at   timestamptz not null default now(),
  constraint skill_evidence_skill_owner foreign key (skill_id, user_id)
    references public.skills (id, user_id) on delete cascade
);

create index skill_evidence_skill_idx on public.skill_evidence (skill_id);
create index skill_evidence_user_idx on public.skill_evidence (user_id);

create table public.learning_resources (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  skill_id      uuid,
  title         text not null check (char_length(title) between 1 and 160),
  url           text not null check (char_length(url) <= 500 and url ~* '^https://'),
  kind          text not null default 'article'
                  check (kind in ('video', 'course', 'docs', 'article', 'book', 'exercise', 'paper', 'lab')),
  difficulty    text not null default 'intro' check (difficulty in ('intro', 'intermediate', 'advanced')),
  objective     text check (objective is null or char_length(objective) <= 300),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint learning_resources_skill_owner foreign key (skill_id, user_id)
    references public.skills (id, user_id) on delete set null (skill_id)
);

create index learning_resources_user_idx on public.learning_resources (user_id);
create index learning_resources_skill_idx on public.learning_resources (skill_id);

create table public.learning_progress (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- 'catalog:<id>' for built-in verified resources, 'user:<uuid>' for the user's own
  resource_key  text not null check (resource_key ~ '^(catalog|user):[A-Za-z0-9_-]{1,64}$'),
  status        text not null default 'planned' check (status in ('planned', 'in_progress', 'completed')),
  -- self-check after finishing: 1 = shaky, 2 = understood, 3 = could explain / teach it
  understood    smallint check (understood between 1 and 3),
  applied       boolean not null default false,
  notes         text check (notes is null or char_length(notes) <= 1000),
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint learning_progress_unique unique (user_id, resource_key),
  constraint learning_progress_done_consistent check ((status = 'completed') = (completed_at is not null))
);

create index learning_progress_user_idx on public.learning_progress (user_id);

create trigger skills_set_updated_at             before update on public.skills             for each row execute function public.set_updated_at();
create trigger learning_resources_set_updated_at before update on public.learning_resources for each row execute function public.set_updated_at();
create trigger learning_progress_set_updated_at  before update on public.learning_progress  for each row execute function public.set_updated_at();

alter table public.skills             enable row level security;
alter table public.skill_evidence     enable row level security;
alter table public.learning_resources enable row level security;
alter table public.learning_progress  enable row level security;

revoke all on public.skills, public.skill_evidence, public.learning_resources, public.learning_progress from anon, authenticated;

grant select, delete on public.skills, public.skill_evidence, public.learning_resources, public.learning_progress to authenticated;

grant insert (track, name, target_level), update (name, target_level) on public.skills to authenticated;
grant insert (skill_id, kind, description, link, occurred_on, strength),
      update (kind, description, link, occurred_on, strength)
  on public.skill_evidence to authenticated;
grant insert (skill_id, title, url, kind, difficulty, objective),
      update (skill_id, title, url, kind, difficulty, objective)
  on public.learning_resources to authenticated;
grant insert (resource_key, status, understood, applied, notes, completed_at),
      update (status, understood, applied, notes, completed_at)
  on public.learning_progress to authenticated;

create policy "skills: owner only" on public.skills for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "skill_evidence: owner only" on public.skill_evidence for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "learning_resources: owner only" on public.learning_resources for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "learning_progress: owner only" on public.learning_progress for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
