-- NEXUS migration 0017 — Learn mode: work through a long file section by section.
-- study_materials.page_starts: char offset where each page/slide begins (insert-only), so
--   sections carry exact page numbers.
-- study_lessons: an AI-taught lesson per section (explanation, key terms, examples from the
--   text, check questions), generated on demand and kept.
-- study_progress: the user's own record per section — learning / review / understood, with the
--   self-check score. Written by the user only; the AI never marks anything as understood.

alter table public.study_materials add column page_starts integer[]
  check (page_starts is null or cardinality(page_starts) <= 5000);
grant insert (page_starts) on public.study_materials to authenticated;

create table public.study_lessons (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  material_id     uuid not null,
  section         smallint not null check (section between 1 and 500),
  sections_total  smallint not null check (sections_total between 1 and 500),
  content         jsonb not null check (jsonb_typeof(content) = 'object'),
  model           text check (model is null or char_length(model) <= 100),
  created_at      timestamptz not null default now(),
  constraint study_lessons_material_owner foreign key (material_id, user_id)
    references public.study_materials (id, user_id) on delete cascade,
  constraint study_lessons_once unique (material_id, section)
);

create table public.study_progress (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  material_id  uuid not null,
  section      smallint not null check (section between 1 and 500),
  status       text not null default 'learning' check (status in ('learning', 'review', 'understood')),
  score        smallint check (score between 0 and 100),
  attempts     smallint not null default 0 check (attempts >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint study_progress_material_owner foreign key (material_id, user_id)
    references public.study_materials (id, user_id) on delete cascade,
  constraint study_progress_once unique (material_id, section)
);

create index study_lessons_user_idx on public.study_lessons (user_id);
create index study_progress_user_idx on public.study_progress (user_id, updated_at desc);

create trigger study_progress_set_updated_at before update on public.study_progress for each row execute function public.set_updated_at();

alter table public.study_lessons  enable row level security;
alter table public.study_progress enable row level security;
revoke all on public.study_lessons, public.study_progress from anon, authenticated;

grant select, delete on public.study_lessons, public.study_progress to authenticated;
grant insert (material_id, section, sections_total, content, model) on public.study_lessons to authenticated;
grant insert (material_id, section, status, score, attempts),
      update (status, score, attempts)
  on public.study_progress to authenticated;

create policy "study_lessons: owner only" on public.study_lessons for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "study_progress: owner only" on public.study_progress for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
