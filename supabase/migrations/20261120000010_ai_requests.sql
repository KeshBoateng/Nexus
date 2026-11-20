-- NEXUS migration 0010 — AI request log (Phase 4, optional AI layer)
-- One row per call to the ai-chat Edge Function: used for the daily cap and so the user
-- can see exactly when and what categories were shared. Message content is NOT stored.

create table public.ai_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  model           text check (model is null or char_length(model) <= 100),
  categories      text[] not null default '{}',
  status          text not null check (status in ('ok', 'error', 'blocked')),
  prompt_chars    integer not null default 0 check (prompt_chars >= 0),
  response_chars  integer not null default 0 check (response_chars >= 0),
  created_at      timestamptz not null default now()
);

create index ai_requests_user_created_idx on public.ai_requests (user_id, created_at desc);

alter table public.ai_requests enable row level security;
revoke all on public.ai_requests from anon, authenticated;
grant select on public.ai_requests to authenticated;
-- Written by the Edge Function with the caller's own JWT (RLS applies); append-only.
grant insert (model, categories, status, prompt_chars, response_chars) on public.ai_requests to authenticated;

create policy "ai_requests: owner only" on public.ai_requests for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
