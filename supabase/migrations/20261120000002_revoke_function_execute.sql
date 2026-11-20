-- NEXUS migration 0002 — Lock down trigger functions.
-- Supabase's default privileges grant EXECUTE on new public functions to anon and
-- authenticated, so `revoke ... from public` (migration 0001) is not enough. These are
-- trigger-only functions and must never be reachable via /rest/v1/rpc.
-- Flagged by Supabase security advisors 0028/0029 on 2026-11-20.

revoke execute on function public.audit_row_change() from public, anon, authenticated;
revoke execute on function public.handle_new_user()  from public, anon, authenticated;
revoke execute on function public.set_updated_at()   from public, anon, authenticated;
