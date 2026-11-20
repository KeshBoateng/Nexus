-- NEXUS migration 0007 — Personal context (Phase 3)
-- personal_memories: what NEXUS knows about the user, each item classified (spec §3).
-- ai_permissions: which data categories an AI provider may ever receive (spec §3, §14).
-- Rules enforced in the database, not just the UI:
--   * an AI-originated item can never be a confirmed fact without the user's confirmation;
--   * sensitive items are never AI-visible;
--   * every AI permission defaults to "no".

create table public.personal_memories (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  content       text not null check (char_length(content) between 1 and 1000),
  kind          text not null default 'fact'
                  check (kind in ('fact', 'preference', 'pattern', 'temporary', 'hypothesis')),
  topic         text not null default 'personal'
                  check (topic in ('ambition', 'academic', 'career', 'technical', 'financial', 'learning',
                                   'productivity', 'leadership', 'business', 'personal', 'other')),
  source        text not null default 'user'
                  check (source in ('onboarding', 'user', 'record', 'checkin', 'feedback', 'ai')),
  confidence    smallint check (confidence between 0 and 100),
  confirmed_at  timestamptz,
  expires_on    date,
  ai_visible    boolean not null default true,
  sensitive     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Never silently convert an assumption into a confirmed fact.
  constraint memories_ai_fact_needs_confirmation
    check (not (source = 'ai' and kind in ('fact', 'preference') and confirmed_at is null)),
  -- Sensitive information gets additional protection: never shared with AI.
  constraint memories_sensitive_not_ai_visible check (not (sensitive and ai_visible)),
  constraint memories_temporary_expires check (kind = 'temporary' or expires_on is null)
);

create index personal_memories_user_idx on public.personal_memories (user_id, kind);

create table public.ai_permissions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  category    text not null
                check (category in ('profile', 'memories', 'academics', 'finances', 'goals', 'projects', 'development')),
  allowed     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint ai_permissions_unique unique (user_id, category)
);

create trigger personal_memories_set_updated_at before update on public.personal_memories for each row execute function public.set_updated_at();
create trigger ai_permissions_set_updated_at    before update on public.ai_permissions    for each row execute function public.set_updated_at();

-- Memory and AI-access changes are audited (they control what leaves the database).
create trigger personal_memories_audit after insert or update or delete on public.personal_memories
  for each row execute function public.audit_row_change('user_id', 'id');
create trigger ai_permissions_audit after insert or update on public.ai_permissions
  for each row execute function public.audit_row_change('user_id', 'id');

alter table public.personal_memories enable row level security;
alter table public.ai_permissions    enable row level security;

revoke all on public.personal_memories, public.ai_permissions from anon, authenticated;

grant select, delete on public.personal_memories to authenticated;
grant insert (content, kind, topic, source, confidence, confirmed_at, expires_on, ai_visible, sensitive),
      update (content, kind, topic, confidence, confirmed_at, expires_on, ai_visible, sensitive)
  on public.personal_memories to authenticated;
-- `source` is insert-only: an item's origin can't be rewritten later to dodge the AI-fact rule.

grant select on public.ai_permissions to authenticated;
grant insert (category, allowed), update (allowed) on public.ai_permissions to authenticated;

create policy "personal_memories: owner only" on public.personal_memories for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "ai_permissions: owner only" on public.ai_permissions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
