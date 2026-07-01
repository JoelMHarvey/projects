-- LonelyBirds — 0004_session_requester_and_connection_guards.sql
--
-- 1) sessions.requested_by_pet_id — records WHICH pet's owner triggered an
--    owner_trigger session, so respond-session can reject the requester
--    approving (or declining) their own out-of-window request. Null for
--    schedule-initiated sessions.
--
-- 2) Server-side enforcement of connection status transitions. RLS
--    (connections_update_owners in 0003) lets EITHER owner update a
--    connection, so without this trigger any owner could — with just the anon
--    key and their own JWT via PostgREST —
--      * flip their own pending request to 'active' (mutual-consent bypass),
--      * un-block themselves after being blocked,
--      * resume a connection that reporting had suspended pending review.
--    The trigger closes those holes for client roles; the service role
--    (edge functions, review tooling) is unrestricted.

-- ---------------------------------------------------------------------------
-- sessions.requested_by_pet_id
-- ---------------------------------------------------------------------------
alter table public.sessions
  add column requested_by_pet_id uuid references public.pets (id) on delete set null;

comment on column public.sessions.requested_by_pet_id is
  'Pet whose owner triggered this session (initiated_by = owner_trigger; null '
  'for schedule). respond-session rejects responses from the requesting owner '
  '— only the partner owner may approve a pending_approval session.';

-- ---------------------------------------------------------------------------
-- Connection status-transition guard.
--
-- Runs for client (JWT) callers only: the service role and direct SQL carry
-- no auth.uid() and are trusted. Rules for authenticated owners:
--   * blocked is TERMINAL — only review (service role) can lift a block.
--   * pending -> active only by the NON-requesting owner (mutual consent).
--   * no transition to 'active' while the connection has an open report
--     ("flagged connections suspended pending review").
--   * paused only from active (a pending request cannot be "paused" into
--     limbo); resume (paused -> active) stays open to either owner.
--   * no status may return to 'pending'.
-- SECURITY DEFINER so the reports lookup is not filtered by the caller's RLS
-- (the reported party cannot see the other owner's report rows).
-- ---------------------------------------------------------------------------
create or replace function public.enforce_connection_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service role / direct SQL: no user JWT, trusted.
  if auth.uid() is null then
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  if old.status = 'blocked' then
    raise exception 'connections: blocked connections can only be changed by review';
  end if;

  if new.status = 'pending' then
    raise exception 'connections: status cannot return to pending';
  end if;

  if new.status = 'active' then
    if old.status = 'pending' and public.is_pet_owner(old.requested_by_pet_id) then
      raise exception 'connections: the requesting owner cannot accept their own request';
    end if;
    if exists (
      select 1 from public.reports r
      where r.connection_id = old.id and r.status = 'open'
    ) then
      raise exception 'connections: suspended pending review of an open report';
    end if;
  elsif new.status = 'paused' then
    if old.status <> 'active' then
      raise exception 'connections: only active connections can be paused';
    end if;
  end if;
  -- new.status = 'blocked' from any non-blocked status: allowed for either
  -- owner ("block instantly", P0).

  return new;
end;
$$;

revoke execute on function public.enforce_connection_status_transition() from public, anon;

create trigger connections_status_transition
  before update on public.connections
  for each row
  execute function public.enforce_connection_status_transition();
