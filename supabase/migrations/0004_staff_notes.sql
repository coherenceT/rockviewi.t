-- 0004: let signed-in staff append their own note to the audit trail.
--
-- The admin area writes an internal note straight after a status change, but
-- 0002 gave application_events a SELECT policy only, so every note was
-- rejected with a 403 and quietly disappeared. The trail is still append-only:
-- a staff member may add a note, only about an application they can already
-- see, and only as themselves (actor_id must equal auth.uid(), so nobody can
-- attribute a note to a colleague). No UPDATE or DELETE policy exists, so
-- nothing already recorded can be altered.

drop policy if exists application_events_staff_insert_note on public.application_events;
create policy application_events_staff_insert_note
  on public.application_events
  for insert
  to authenticated
  with check (
    public.is_staff()
    and event_type = 'note_added'
    and actor_id = auth.uid()
  );

-- The admin client sends only actor_id; the timeline renders actor_label, so
-- fill it from the signed-in user's email rather than showing "system".
create or replace function public.application_events_stamp_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.actor_id is not null and (new.actor_label is null or new.actor_label = '') then
    select u.email into new.actor_label from auth.users u where u.id = new.actor_id;
    if new.actor_label is null then
      new.actor_label := 'staff';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists application_events_before_insert on public.application_events;
create trigger application_events_before_insert
  before insert on public.application_events
  for each row execute function public.application_events_stamp_actor();
