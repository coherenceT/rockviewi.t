-- ---------------------------------------------------------------------------
-- 0003_storage.sql
--
-- Private bucket for applicant documents. Objects are written and read only by
-- the Worker (service key) and by signed URLs it hands to signed-in staff.
-- There is no public read path and no anon policy of any kind.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'application-documents',
  'application-documents',
  false,
  10485760, -- 10 MB, matches MAX_FILE_BYTES in shared/validation.ts
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Staff may read objects in this bucket (the Worker still issues the
-- short-lived signed URL; this policy is the belt to that braces).
drop policy if exists application_documents_staff_read on storage.objects;
create policy application_documents_staff_read
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'application-documents' and public.is_staff());

-- No INSERT, UPDATE or DELETE policy for anon or authenticated: uploads and
-- deletions are performed by the Worker with the service key, which bypasses
-- RLS, and the Worker has already validated type, size and ownership by then.
