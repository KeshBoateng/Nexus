-- NEXUS migration 0003 — Academics (Phase 2, slice 1)
-- Tables: grade_bands, academic_terms, courses, assessments
-- Ownership: user_id defaults to auth.uid() and is NOT client-writable (column grants).
-- Child rows reference parents through (id, user_id) composite keys, so a row can never
-- be attached to another user's term/course even though FK checks bypass RLS.

-- ---------------------------------------------------------------------------
-- Audit function: skip DELETE rows whose owner profile is already gone
-- (account deletion cascades through owned tables).
-- ---------------------------------------------------------------------------
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
  owner_id  uuid;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  owner_id := (row_data ->> owner_col)::uuid;

  if tg_op = 'DELETE' and (
       tg_table_name = 'profiles'
       or not exists (select 1 from public.profiles p where p.id = owner_id)
     ) then
    return old;
  end if;

  insert into public.audit_logs (user_id, table_name, record_id, action, old_data, new_data)
  values (
    owner_id,
    tg_table_name,
    row_data ->> pk_col,
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke execute on function public.audit_row_change() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- grade_bands — the user's grading scale (letter, mark range, grade points)
-- ---------------------------------------------------------------------------
create table public.grade_bands (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  letter      text not null check (letter ~ '^[A-Z][+-]?$'),
  min_mark    numeric(5, 2) not null check (min_mark between 0 and 100),
  max_mark    numeric(5, 2) not null check (max_mark between 0 and 100),
  points      numeric(3, 2) not null check (points between 0 and 4),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint grade_bands_range check (min_mark <= max_mark),
  constraint grade_bands_letter_unique unique (user_id, letter)
);

create index grade_bands_user_idx on public.grade_bands (user_id);

-- ---------------------------------------------------------------------------
-- academic_terms — semesters
-- ---------------------------------------------------------------------------
create table public.academic_terms (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  starts_on   date,
  ends_on     date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint academic_terms_dates check (starts_on is null or ends_on is null or starts_on <= ends_on),
  constraint academic_terms_id_user unique (id, user_id)
);

create index academic_terms_user_idx on public.academic_terms (user_id, starts_on);

-- ---------------------------------------------------------------------------
-- courses — a course taken in a term. Grade = final_mark (→ band) or final_letter.
-- Neither set = in progress (excluded from GPA).
-- ---------------------------------------------------------------------------
create table public.courses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  term_id       uuid not null,
  code          text check (code is null or char_length(code) between 1 and 20),
  title         text not null check (char_length(title) between 1 and 120),
  credit_hours  smallint not null check (credit_hours between 1 and 12),
  final_mark    numeric(5, 2) check (final_mark between 0 and 100),
  final_letter  text check (final_letter ~ '^[A-Z][+-]?$'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint courses_term_owner foreign key (term_id, user_id)
    references public.academic_terms (id, user_id) on delete cascade,
  constraint courses_id_user unique (id, user_id)
);

create index courses_user_term_idx on public.courses (user_id, term_id);
create index courses_term_idx on public.courses (term_id);

-- ---------------------------------------------------------------------------
-- assessments — assignments, quizzes, exams: deadlines and scores
-- ---------------------------------------------------------------------------
create table public.assessments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  course_id     uuid not null,
  title         text not null check (char_length(title) between 1 and 120),
  kind          text not null default 'assignment'
                  check (kind in ('assignment', 'quiz', 'midterm', 'exam', 'project', 'presentation', 'other')),
  due_at        timestamptz,
  weight        numeric(5, 2) check (weight between 0 and 100),
  score         numeric(6, 2) check (score >= 0),
  max_score     numeric(6, 2) check (max_score > 0),
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint assessments_course_owner foreign key (course_id, user_id)
    references public.courses (id, user_id) on delete cascade,
  constraint assessments_score_le_max check (score is null or max_score is null or score <= max_score)
);

create index assessments_user_due_idx on public.assessments (user_id, due_at);
create index assessments_course_idx on public.assessments (course_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create trigger grade_bands_set_updated_at    before update on public.grade_bands    for each row execute function public.set_updated_at();
create trigger academic_terms_set_updated_at before update on public.academic_terms for each row execute function public.set_updated_at();
create trigger courses_set_updated_at        before update on public.courses        for each row execute function public.set_updated_at();
create trigger assessments_set_updated_at    before update on public.assessments    for each row execute function public.set_updated_at();

-- Grades and the scale that produces them are audited.
create trigger grade_bands_audit after insert or update or delete on public.grade_bands
  for each row execute function public.audit_row_change('user_id', 'id');
create trigger courses_audit after insert or update or delete on public.courses
  for each row execute function public.audit_row_change('user_id', 'id');

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
alter table public.grade_bands    enable row level security;
alter table public.academic_terms enable row level security;
alter table public.courses        enable row level security;
alter table public.assessments    enable row level security;

revoke all on public.grade_bands, public.academic_terms, public.courses, public.assessments from anon, authenticated;

grant select, delete on public.grade_bands, public.academic_terms, public.courses, public.assessments to authenticated;

grant insert (letter, min_mark, max_mark, points),
      update (letter, min_mark, max_mark, points)
  on public.grade_bands to authenticated;

grant insert (name, starts_on, ends_on),
      update (name, starts_on, ends_on)
  on public.academic_terms to authenticated;

grant insert (term_id, code, title, credit_hours, final_mark, final_letter),
      update (term_id, code, title, credit_hours, final_mark, final_letter)
  on public.courses to authenticated;

grant insert (course_id, title, kind, due_at, weight, score, max_score, completed_at),
      update (course_id, title, kind, due_at, weight, score, max_score, completed_at)
  on public.assessments to authenticated;

create policy "grade_bands: owner only" on public.grade_bands for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "academic_terms: owner only" on public.academic_terms for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "courses: owner only" on public.courses for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "assessments: owner only" on public.assessments for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
