-- NEXUS migration 0016 — resumable study-pack generation.
-- Long files are condensed part by part; each part's notes are saved as soon as they exist, so
-- provider rate limits (e.g. Groq free tier: 8,000 tokens/minute) only pause the work instead of
-- losing it. Notes are derived data and go when the material goes.

create table public.study_notes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  material_id  uuid not null,
  part         smallint not null check (part between 1 and 50),
  parts_total  smallint not null check (parts_total between 1 and 50),
  notes        text not null check (char_length(notes) between 1 and 8000),
  created_at   timestamptz not null default now(),
  constraint study_notes_material_owner foreign key (material_id, user_id)
    references public.study_materials (id, user_id) on delete cascade,
  constraint study_notes_once unique (material_id, part)
);

create index study_notes_user_idx on public.study_notes (user_id);

alter table public.study_notes enable row level security;
revoke all on public.study_notes from anon, authenticated;
grant select, delete on public.study_notes to authenticated;
grant insert (material_id, part, parts_total, notes) on public.study_notes to authenticated;

create policy "study_notes: owner only" on public.study_notes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
