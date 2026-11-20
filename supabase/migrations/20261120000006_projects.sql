-- NEXUS migration 0006 — Projects (Phase 2, slice 4)
-- Tables: projects, project_members, project_tasks, project_milestones, meetings
-- Members are records (team mates don't need NEXUS accounts). A task's assignee must be a
-- member of the SAME project: enforced by a composite FK over (member, project, user).

create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 100),
  description  text check (description is null or char_length(description) <= 2000),
  kind         text not null default 'personal' check (kind in ('assignment', 'team', 'personal', 'business')),
  status       text not null default 'active' check (status in ('planning', 'active', 'on_hold', 'done', 'cancelled')),
  due_on       date,
  course_id    uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint projects_course_owner foreign key (course_id, user_id)
    references public.courses (id, user_id) on delete set null (course_id),
  constraint projects_id_user unique (id, user_id)
);

create index projects_user_idx on public.projects (user_id, status);
create index projects_course_idx on public.projects (course_id);

create table public.project_members (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  project_id  uuid not null,
  name        text not null check (char_length(name) between 1 and 80),
  role        text check (role is null or char_length(role) <= 60),
  contact     text check (contact is null or char_length(contact) <= 120),
  is_me       boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint project_members_project_owner foreign key (project_id, user_id)
    references public.projects (id, user_id) on delete cascade,
  constraint project_members_key unique (id, project_id, user_id)
);

create index project_members_project_idx on public.project_members (project_id);
create index project_members_user_idx on public.project_members (user_id);
-- At most one "me" per project.
create unique index project_members_one_me on public.project_members (project_id) where is_me;

create table public.project_milestones (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  project_id  uuid not null,
  title       text not null check (char_length(title) between 1 and 120),
  due_on      date,
  done_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint project_milestones_project_owner foreign key (project_id, user_id)
    references public.projects (id, user_id) on delete cascade
);

create index project_milestones_project_idx on public.project_milestones (project_id);
create index project_milestones_user_idx on public.project_milestones (user_id);

create table public.project_tasks (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  project_id          uuid not null,
  title               text not null check (char_length(title) between 1 and 160),
  assignee_member_id  uuid,
  status              text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  due_on              date,
  completed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint project_tasks_project_owner foreign key (project_id, user_id)
    references public.projects (id, user_id) on delete cascade,
  constraint project_tasks_assignee_same_project foreign key (assignee_member_id, project_id, user_id)
    references public.project_members (id, project_id, user_id) on delete set null (assignee_member_id),
  constraint project_tasks_done_consistent check ((status = 'done') = (completed_at is not null))
);

create index project_tasks_project_idx on public.project_tasks (project_id, status);
create index project_tasks_user_due_idx on public.project_tasks (user_id, due_on);
create index project_tasks_assignee_idx on public.project_tasks (assignee_member_id);

create table public.meetings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  project_id  uuid not null,
  held_on     date not null default current_date,
  title       text not null check (char_length(title) between 1 and 120),
  notes       text check (notes is null or char_length(notes) <= 10000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint meetings_project_owner foreign key (project_id, user_id)
    references public.projects (id, user_id) on delete cascade
);

create index meetings_project_idx on public.meetings (project_id, held_on desc);
create index meetings_user_idx on public.meetings (user_id);

create trigger projects_set_updated_at           before update on public.projects           for each row execute function public.set_updated_at();
create trigger project_members_set_updated_at    before update on public.project_members    for each row execute function public.set_updated_at();
create trigger project_milestones_set_updated_at before update on public.project_milestones for each row execute function public.set_updated_at();
create trigger project_tasks_set_updated_at      before update on public.project_tasks      for each row execute function public.set_updated_at();
create trigger meetings_set_updated_at           before update on public.meetings           for each row execute function public.set_updated_at();

alter table public.projects           enable row level security;
alter table public.project_members    enable row level security;
alter table public.project_milestones enable row level security;
alter table public.project_tasks      enable row level security;
alter table public.meetings           enable row level security;

revoke all on public.projects, public.project_members, public.project_milestones, public.project_tasks, public.meetings
  from anon, authenticated;

grant select, delete on public.projects, public.project_members, public.project_milestones, public.project_tasks, public.meetings
  to authenticated;

grant insert (name, description, kind, status, due_on, course_id),
      update (name, description, kind, status, due_on, course_id)
  on public.projects to authenticated;

grant insert (project_id, name, role, contact, is_me),
      update (name, role, contact, is_me)
  on public.project_members to authenticated;

grant insert (project_id, title, due_on, done_at),
      update (title, due_on, done_at)
  on public.project_milestones to authenticated;

grant insert (project_id, title, assignee_member_id, status, due_on, completed_at),
      update (title, assignee_member_id, status, due_on, completed_at)
  on public.project_tasks to authenticated;

grant insert (project_id, held_on, title, notes),
      update (held_on, title, notes)
  on public.meetings to authenticated;

create policy "projects: owner only" on public.projects for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "project_members: owner only" on public.project_members for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "project_milestones: owner only" on public.project_milestones for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "project_tasks: owner only" on public.project_tasks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "meetings: owner only" on public.meetings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
