-- LonelyBirds — 0002_indexes_triggers.sql
-- Indexes for the match query (species + schedule overlap), session lookups,
-- schedule-tick scans, and the connections.updated_at trigger.

-- ---------------------------------------------------------------------------
-- Match query: pets filtered by species, joined to availability_windows
-- to compute schedule overlap.
-- ---------------------------------------------------------------------------
create index pets_species_idx on public.pets (species);
create index pets_owner_id_idx on public.pets (owner_id);

-- Overlap lookups: all windows for a pet, and windows by weekday/time range.
create index availability_windows_pet_id_idx
  on public.availability_windows (pet_id, weekday);
create index availability_windows_weekday_time_idx
  on public.availability_windows (weekday, start_minute, end_minute);

-- ---------------------------------------------------------------------------
-- Connections: look up by either pet; unique pair already indexed by
-- connections_unique_pair (pet_a_id, pet_b_id).
-- ---------------------------------------------------------------------------
create index connections_pet_b_id_idx on public.connections (pet_b_id);
create index connections_status_idx on public.connections (status);

-- ---------------------------------------------------------------------------
-- Session lookups: sessions for a connection (history, latest-first) and
-- schedule-tick scans (live sessions past their scheduled end).
-- ---------------------------------------------------------------------------
create index sessions_connection_id_idx
  on public.sessions (connection_id, created_at desc);
create index sessions_live_scheduled_end_idx
  on public.sessions (scheduled_end_at)
  where status in ('pending_approval', 'connecting', 'active');

-- ---------------------------------------------------------------------------
-- Devices: terminal for a pet; heartbeat sweep (mark offline when
-- last_seen_at is older than 90s).
-- ---------------------------------------------------------------------------
create index devices_pet_id_idx on public.devices (pet_id);
create index devices_online_last_seen_idx
  on public.devices (last_seen_at)
  where is_online;

-- ---------------------------------------------------------------------------
-- Pairing codes: claim lookup by code. Partial-unique so two UNCLAIMED codes
-- can never share the same value (claim lookup is unambiguous). The
-- create-pairing-code function must retry on a unique violation (~N/1e6 odds)
-- or delete expired unclaimed rows first.
-- ---------------------------------------------------------------------------
create unique index pairing_codes_unclaimed_code_key
  on public.pairing_codes (code)
  where claimed_by_device is null;
create index pairing_codes_pet_id_idx on public.pairing_codes (pet_id);

-- Reports triage.
create index reports_connection_id_idx on public.reports (connection_id);
create index reports_status_idx on public.reports (status) where status = 'open';

-- ---------------------------------------------------------------------------
-- connections.updated_at — bump on every UPDATE.
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger connections_set_updated_at
  before update on public.connections
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Protect the pair invariant after insert: the pets of a connection are
-- immutable (status is the only mutable business column).
-- ---------------------------------------------------------------------------
create or replace function public.connections_pets_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.pet_a_id is distinct from old.pet_a_id
     or new.pet_b_id is distinct from old.pet_b_id
     or new.requested_by_pet_id is distinct from old.requested_by_pet_id then
    raise exception 'connections: pet_a_id / pet_b_id / requested_by_pet_id are immutable';
  end if;
  return new;
end;
$$;

create trigger connections_pets_immutable
  before update on public.connections
  for each row
  execute function public.connections_pets_immutable();
