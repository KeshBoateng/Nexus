-- pglite:skip — Supabase Storage only exists on the hosted project.
-- NEXUS migration 0015 — private `study` bucket. Each user may only read, add or delete files
-- inside their own folder (<user_id>/…). 25 MB per file; document types only.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'study', 'study', false, 26214400,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/markdown'
  ]
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "study: owner can read" on storage.objects for select to authenticated
  using (bucket_id = 'study' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "study: owner can upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'study' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "study: owner can delete" on storage.objects for delete to authenticated
  using (bucket_id = 'study' and (storage.foldername(name))[1] = (select auth.uid())::text);
