-- ---------------------------------------------------------------------------
-- 0001_schema.sql
--
-- Admissions schema: enums, tables, reference-number generation, audit trail
-- and the retention default. Migrations live in the repo so the schema is
-- reproducible; the dashboard is never edited by hand.
-- ---------------------------------------------------------------------------

-- gen_random_uuid() is built into PostgreSQL 13+; no extension is required.
-- pgcrypto is enabled anyway so that database-side hashing is available to
-- future migrations without another round of DDL.
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'application_status') then
    create type public.application_status as enum (
      'received',
      'under_review',
      'accepted_payment_pending',
      'not_successful',
      'waitlisted'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'pathway_id') then
    create type public.pathway_id as enum ('a', 'b', 'c');
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_option') then
    create type public.payment_option as enum ('monthly', 'upfront', 'early_bird', 'sponsored');
  end if;

  if not exists (select 1 from pg_type where typname = 'document_type') then
    create type public.document_type as enum ('certified_id', 'highest_qualification', 'proof_of_residence');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Staff directory: the only source of truth for who may read applications
-- ---------------------------------------------------------------------------

create table if not exists public.staff_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  role       text not null default 'staff' check (role in ('staff', 'admin')),
  created_at timestamptz not null default now()
);

comment on table public.staff_users is
  'Admissions staff allow-list. A row here is what makes an auth.users account a staff account.';

-- ---------------------------------------------------------------------------
-- Applications
-- ---------------------------------------------------------------------------

create sequence if not exists public.application_reference_seq
  as bigint
  start with 1
  increment by 1
  no cycle;

create table if not exists public.applications (
  id                       uuid primary key default gen_random_uuid(),
  reference_number         text not null unique,
  status                   public.application_status not null default 'received',
  pathway                  public.pathway_id not null,
  start_date               date not null,
  payment_option           public.payment_option not null,
  -- The brief specifies full-time delivery only. Recorded explicitly rather
  -- than implied, so a future intake can add a mode without a rewrite.
  programme_mode           text not null default 'full_time' check (programme_mode = 'full_time'),

  first_name               text not null,
  surname                  text not null,
  date_of_birth            date not null,
  -- Sensitive fields: the Worker encrypts with AES-256-GCM before it reaches
  -- Postgres, so this column holds base64 ciphertext, never a plaintext ID.
  -- The separate hash allows duplicate detection without decrypting.
  id_number                text,
  id_number_hash           text,
  email                    text not null,
  mobile                   text not null,
  city                     text not null,
  suburb                   text not null,

  highest_qualification    text not null,
  school_name              text not null,
  year_completed           integer not null check (year_completed between 1950 and 2100),
  matric_results_summary   text,

  guardian_name            text,
  guardian_relationship    text,
  guardian_phone           text,
  guardian_email           text,

  -- Consent: both the flag and the timestamp at which it was given.
  information_true_at      timestamptz,
  popia_consent_at         timestamptz,
  marketing_consent        boolean not null default false,
  marketing_consent_at     timestamptz,
  terms_accepted_at        timestamptz,
  consent_version          text not null,

  source                   text not null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  retention_until          timestamptz
);

comment on column public.applications.id_number is
  'AES-256-GCM ciphertext (Worker-encrypted). Never plaintext. Decryption requires FIELD_ENCRYPTION_KEY.';
comment on column public.applications.id_number_hash is
  'SHA-256 of the normalised ID/passport number, for duplicate detection without decryption.';
comment on column public.applications.retention_until is
  'Set when an application becomes not_successful. Default retention window is configured in the before-update trigger.';

create index if not exists applications_status_idx on public.applications (status);
create index if not exists applications_pathway_idx on public.applications (pathway);
create index if not exists applications_email_idx on public.applications (email);
create index if not exists applications_created_at_idx on public.applications (created_at desc);
create index if not exists applications_id_number_hash_idx on public.applications (id_number_hash);

-- ---------------------------------------------------------------------------
-- Documents, events and queued email
-- ---------------------------------------------------------------------------

create table if not exists public.application_documents (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  document_type  public.document_type not null,
  storage_path   text not null unique,
  mime_type      text not null,
  size_bytes     bigint not null check (size_bytes > 0),
  uploaded_at    timestamptz not null default now()
);

comment on column public.application_documents.storage_path is
  'Object path inside the private application-documents bucket: {application_id}/{document_type}/{uuid}.{ext}';

create unique index if not exists application_documents_type_idx
  on public.application_documents (application_id, document_type);

create table if not exists public.application_events (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  event_type     text not null,
  from_status    public.application_status,
  to_status      public.application_status,
  actor_id       uuid references auth.users (id) on delete set null,
  actor_label    text,
  note           text,
  created_at     timestamptz not null default now()
);

comment on table public.application_events is
  'Append-only audit trail. Every status change records the staff user and the time.';

create index if not exists application_events_application_idx
  on public.application_events (application_id, created_at desc);

create table if not exists public.outbound_emails (
  id                  uuid primary key default gen_random_uuid(),
  application_id      uuid references public.applications (id) on delete cascade,
  to_address          text not null,
  template            text not null,
  subject             text not null,
  status              text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  attempts            integer not null default 0,
  provider            text,
  provider_message_id text,
  last_error          text,
  created_at          timestamptz not null default now(),
  sent_at             timestamptz
);

comment on column public.outbound_emails.last_error is
  'Populated after the retry budget is exhausted, so an admin can see the failure.';

create index if not exists outbound_emails_status_idx on public.outbound_emails (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Early-bird places remaining (admin-maintained, read by the Worker)
-- ---------------------------------------------------------------------------

create table if not exists public.early_bird_counter (
  id         smallint primary key default 1 check (id = 1),
  paid_count integer not null default 0 check (paid_count >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.early_bird_counter (id, paid_count)
values (1, 0)
on conflict (id) do nothing;

comment on table public.early_bird_counter is
  'Single row. Only an admin may change paid_count. The public site reads it through the Worker.';

-- ---------------------------------------------------------------------------
-- POPIA: deletion audit without retaining personal data
-- ---------------------------------------------------------------------------

create table if not exists public.data_deletion_log (
  id                uuid primary key default gen_random_uuid(),
  reference_number  text not null,
  deleted_by        uuid references auth.users (id) on delete set null,
  deleted_by_email  text,
  documents_deleted integer not null default 0,
  reason            text,
  created_at        timestamptz not null default now()
);

comment on table public.data_deletion_log is
  'Proves a deletion request was actioned without keeping the deleted personal data.';

-- ---------------------------------------------------------------------------
-- Reference numbers: IT-<intake year>-<6 digit sequence>, assigned by the
-- database. Mirrors shared/reference.ts - keep the two in step.
-- ---------------------------------------------------------------------------

create or replace function public.generate_reference_number(intake_year integer)
returns text
language sql
volatile
set search_path = ''
as $$
  select 'IT-' || intake_year::text || '-' || lpad(nextval('public.application_reference_seq')::text, 6, '0');
$$;

comment on function public.generate_reference_number(integer) is
  'Builds IT-<year>-<000000>. Format is duplicated in shared/reference.ts and covered by tests.';

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public.applications_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reference_number is null or new.reference_number = '' then
    new.reference_number := public.generate_reference_number(
      extract(year from coalesce(new.start_date, current_date))::integer
    );
  end if;

  new.created_at := coalesce(new.created_at, now());
  new.updated_at := now();
  new.marketing_consent := coalesce(new.marketing_consent, false);

  -- A rejected application keeps its five year retention window. Changing the
  -- policy means changing this interval in a migration, deliberately.
  if new.status = 'not_successful' and new.retention_until is null then
    new.retention_until := now() + interval '5 years';
  end if;

  return new;
end;
$$;

drop trigger if exists applications_before_insert on public.applications;
create trigger applications_before_insert
  before insert on public.applications
  for each row execute function public.applications_before_insert();

create or replace function public.applications_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();

  if new.status is distinct from old.status
     and new.status = 'not_successful'
     and new.retention_until is null then
    new.retention_until := now() + interval '5 years';
  end if;

  return new;
end;
$$;

drop trigger if exists applications_before_update on public.applications;
create trigger applications_before_update
  before update on public.applications
  for each row execute function public.applications_before_update();

-- Every status change is written to the audit trail with the acting staff user
-- and the timestamp, whether the change came from the admin UI or a script.
create or replace function public.applications_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_label text;
begin
  if new.status is distinct from old.status then
    select su.email into v_label from public.staff_users su where su.user_id = v_actor;

    if v_label is null then
      v_label := case when v_actor is null then 'system' else 'authenticated user' end;
    end if;

    insert into public.application_events (
      application_id, event_type, from_status, to_status, actor_id, actor_label
    ) values (
      new.id, 'status_changed', old.status, new.status, v_actor, v_label
    );
  end if;

  return new;
end;
$$;

drop trigger if exists applications_after_update on public.applications;
create trigger applications_after_update
  after update on public.applications
  for each row execute function public.applications_after_update();

create or replace function public.early_bird_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists early_bird_touch on public.early_bird_counter;
create trigger early_bird_touch
  before update on public.early_bird_counter
  for each row execute function public.early_bird_touch();

-- ---------------------------------------------------------------------------
-- Grants
--
-- anon is explicitly revoked from everything holding personal data. Public
-- visitors reach the database only through the Worker, which uses the service
-- key. authenticated may read only what RLS (0002) then filters by staff role.
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

revoke all on public.applications from anon;
revoke all on public.application_documents from anon;
revoke all on public.application_events from anon;
revoke all on public.outbound_emails from anon;
revoke all on public.staff_users from anon;
revoke all on public.data_deletion_log from anon;
revoke all on public.early_bird_counter from anon;

grant select, insert, update, delete on public.applications to service_role;
grant select, insert, update, delete on public.application_documents to service_role;
grant select, insert, update, delete on public.application_events to service_role;
grant select, insert, update, delete on public.outbound_emails to service_role;
grant select, insert, update, delete on public.staff_users to service_role;
grant select, insert, update, delete on public.data_deletion_log to service_role;
grant select, insert, update, delete on public.early_bird_counter to service_role;
grant usage, select on sequence public.application_reference_seq to service_role;

grant select on public.applications to authenticated;
grant select on public.application_documents to authenticated;
grant select on public.application_events to authenticated;
grant select on public.outbound_emails to authenticated;
grant select on public.staff_users to authenticated;
grant select on public.data_deletion_log to authenticated;
grant select on public.early_bird_counter to authenticated;
grant update on public.applications to authenticated;
grant update on public.early_bird_counter to authenticated;
