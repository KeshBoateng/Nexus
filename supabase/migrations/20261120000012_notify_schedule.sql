-- pglite:skip — uses pg_cron / pg_net, which only exist on the hosted project.
-- NEXUS migration 0012 — run the notify job every 15 minutes.
-- The cron token is generated here, inside the database, and is never printed or exported.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

insert into public.app_secrets (name, value)
values ('cron_token', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

select cron.unschedule('nexus-notify') where exists (select 1 from cron.job where jobname = 'nexus-notify');

select cron.schedule(
  'nexus-notify',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://obccfnhcnnlairctgomt.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', (select value from public.app_secrets where name = 'cron_token')
    ),
    body := '{"action":"run"}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
