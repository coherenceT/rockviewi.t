-- ---------------------------------------------------------------------------
-- 0002_rls.sql
--
-- Row level security. Every table is protected. The client is never trusted:
-- public submissions reach the database only through the Worker, which uses the
-- service key, so there is deliberately no INSERT policy for anon anywhere.
-- ---------------------------------------------------------------------------

alter table public.applications          enable row level security;
alter table public.application_documents enable row level security;
alter table public.application_events    enable row level security;
alter table public.outbound_emails       enable row level security;
alter table public.staff_users           enable row level security;
alter table public.early_bird_counter    enable row level security;
alter table public.data_deletion_log     enable row level security;

-- ---------------------------------------------------------------------------
-- Staff helpers. SECURITY DEFINER so the check itself does not depend on the
-- caller's ability to read staff_users.
-- ---------------------------------------------------------------------------

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff_users su where su.user_id = auth.uid()
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff_users su where su.user_id = auth.uid() and su.role = 'admin'
  );
$$;

grant execute on function public.is_staff() to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- applications
--
-- No INSERT policy for anon or authenticated: the only writer is the Worker
-- using the service key. Staff may read, and may change status (the audit
-- trigger in 0001 records who did it).
-- ---------------------------------------------------------------------------

drop policy if exists applications_staff_select on public.applications;
create policy applications_staff_select
  on public.applications
  for select
  to authenticated
  using (public.is_staff());

drop policy if exists applications_staff_update on public.applications;
create policy applications_staff_update
  on public.applications
  for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- Staff deletions happen only through the audited Worker deletion endpoint,
-- which uses the service key. No DELETE policy is granted to authenticated.

-- ---------------------------------------------------------------------------
-- application_documents
-- ---------------------------------------------------------------------------

drop policy if exists application_documents_staff_select on public.application_documents;
create policy application_documents_staff_select
  on public.application_documents
  for select
  to authenticated
  using (public.is_staff());

-- ---------------------------------------------------------------------------
-- application_events (append-only audit trail; staff read only)
-- ---------------------------------------------------------------------------

drop policy if exists application_events_staff_select on public.application_events;
create policy application_events_staff_select
  on public.application_events
  for select
  to authenticated
  using (public.is_staff());

-- ---------------------------------------------------------------------------
-- outbound_emails (staff read so failures are visible in the admin area)
-- ---------------------------------------------------------------------------

drop policy if exists outbound_emails_staff_select on public.outbound_emails;
create policy outbound_emails_staff_select
  on public.outbound_emails
  for select
  to authenticated
  using (public.is_staff());

-- ---------------------------------------------------------------------------
-- staff_users: a signed-in user may read only their own row, which is what the
-- admin page uses to decide whether to show the area at all.
-- ---------------------------------------------------------------------------

drop policy if exists staff_users_self_select on public.staff_users;
create policy staff_users_self_select
  on public.staff_users
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists staff_users_admin_select on public.staff_users;
create policy staff_users_admin_select
  on public.staff_users
  for select
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- early_bird_counter: staff read, admin write. No public read at all - the
-- landing page reads the remaining count through the Worker.
-- ---------------------------------------------------------------------------

drop policy if exists early_bird_staff_select on public.early_bird_counter;
create policy early_bird_staff_select
  on public.early_bird_counter
  for select
  to authenticated
  using (public.is_staff());

drop policy if exists early_bird_admin_update on public.early_bird_counter;
create policy early_bird_admin_update
  on public.early_bird_counter
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- data_deletion_log: staff read; writes come from the Worker's service key.
-- ---------------------------------------------------------------------------

drop policy if exists data_deletion_log_staff_select on public.data_deletion_log;
create policy data_deletion_log_staff_select
  on public.data_deletion_log
  for select
  to authenticated
  using (public.is_staff());
