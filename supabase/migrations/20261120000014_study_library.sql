-- NEXUS migration 0014 — Study Library
-- study_materials: uploaded files (stored in the private `study` bucket, path <user_id>/<uuid>.<ext>)
--   with text extracted on the user's device, a course link and a topic. Full-text searchable.
-- study_analyses: AI study pack per material (summary, concepts, flashcards, questions),
--   written by the study-analyze function with the user's own JWT.
-- ai_permissions gains a 'study' category (default off, like every AI permission).

alter table public.ai_permissions drop constraint ai_permissions_category_check;
alter table public.ai_permissions add constraint ai_permissions_category_check
  check (category in ('profile', 'memories', 'academics', 'finances', 'goals', 'projects', 'development', 'study'));

create table public.study_materials (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  course_id       uuid,
  title           text not null check (char_length(title) between 1 and 200),
  topic           text check (topic is null or char_length(topic) <= 120),
  file_path       text not null check (file_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]{1,5}$'),
  mime            text not null check (char_length(mime) <= 120),
  size_bytes      integer not null check (size_bytes between 1 and 26214400),
  page_count      integer check (page_count >= 0),
  extracted_text  text check (extracted_text is null or char_length(extracted_text) <= 1500000),
  status          text not null default 'uploaded' check (status in ('uploaded', 'extracted', 'no_text', 'analysed', 'failed')),
  search          tsvector generated always as (
                    setweight(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(topic, '')), 'A') ||
                    setweight(to_tsvector('english', left(coalesce(extracted_text, ''), 500000)), 'B')
                  ) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint study_materials_course_owner foreign key (course_id, user_id)
    references public.courses (id, user_id) on delete set null (course_id),
  constraint study_materials_path_is_own check (split_part(file_path, '/', 1) = user_id::text),
  constraint study_materials_id_user unique (id, user_id)
);

create index study_materials_user_idx on public.study_materials (user_id, course_id);
create index study_materials_course_idx on public.study_materials (course_id);
create index study_materials_search_idx on public.study_materials using gin (search);

create table public.study_analyses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  material_id   uuid not null,
  summary       text not null check (char_length(summary) between 1 and 6000),
  key_concepts  jsonb not null default '[]'::jsonb check (jsonb_typeof(key_concepts) = 'array'),
  flashcards    jsonb not null default '[]'::jsonb check (jsonb_typeof(flashcards) = 'array'),
  questions     jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array'),
  model         text check (model is null or char_length(model) <= 100),
  chars_used    integer not null default 0 check (chars_used >= 0),
  created_at    timestamptz not null default now(),
  constraint study_analyses_material_owner foreign key (material_id, user_id)
    references public.study_materials (id, user_id) on delete cascade,
  constraint study_analyses_one_per_material unique (material_id)
);

create index study_analyses_user_idx on public.study_analyses (user_id);

create trigger study_materials_set_updated_at before update on public.study_materials for each row execute function public.set_updated_at();

alter table public.study_materials enable row level security;
alter table public.study_analyses  enable row level security;
revoke all on public.study_materials, public.study_analyses from anon, authenticated;

grant select, delete on public.study_materials, public.study_analyses to authenticated;
grant insert (course_id, title, topic, file_path, mime, size_bytes, page_count, extracted_text, status),
      update (course_id, title, topic, status)
  on public.study_materials to authenticated;
grant insert (material_id, summary, key_concepts, flashcards, questions, model, chars_used) on public.study_analyses to authenticated;

create policy "study_materials: owner only" on public.study_materials for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "study_analyses: owner only" on public.study_analyses for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
