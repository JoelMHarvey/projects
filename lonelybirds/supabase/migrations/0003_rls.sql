-- LonelyBirds — 0003_rls.sql
-- Row Level Security. RLS is ENABLED on every table.
--
-- Model (per CONTRACTS.md):
--   * Owners read/write their own rows.
--   * pets and availability_windows are additionally READABLE by any
--     authenticated owner — required by the P0 match query (species +
--     schedule overlap) which runs with the user's JWT. Writes stay
--     owner-scoped.
--   * Both owners of a connection can read the connection and its sessions.
--   * sessions are written only by edge functions (service role — bypasses RLS).
--   * pairing_codes: service-role only (no policies, privileges revoked).
--   * waitlist_signups: anonymous INSERT only.

-- ---------------------------------------------------------------------------
-- Helper predicates (SECURITY DEFINER so policies don't recurse through RLS).
-- ---------------------------------------------------------------------------
create or replace function public.is_pet_owner(p_pet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pets
    where id = p_pet_id and owner_id = auth.uid()
  );
$$;

create or replace function public.is_connection_owner(p_connection_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.connections c
    join public.pets p on p.id = c.pet_a_id or p.id = c.pet_b_id
    where c.id = p_connection_id and p.owner_id = auth.uid()
  );
$$;

revoke execute on function public.is_pet_owner(uuid) from public, anon;
revoke execute on function public.is_connection_owner(uuid) from public, anon;
grant execute on function public.is_pet_owner(uuid) to authenticated, service_role;
grant execute on function public.is_connection_owner(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere.
-- ---------------------------------------------------------------------------
alter table public.owners               enable row level security;
alter table public.pets                 enable row level security;
alter table public.devices              enable row level security;
alter table public.pairing_codes        enable row level security;
alter table public.availability_windows enable row level security;
alter table public.connections          enable row level security;
alter table public.sessions             enable row level security;
alter table public.reports              enable row level security;
alter table public.waitlist_signups     enable row level security;

-- ---------------------------------------------------------------------------
-- owners — each user manages exactly their own profile row.
-- ---------------------------------------------------------------------------
create policy owners_select_own on public.owners
  for select to authenticated
  using (id = auth.uid());

create policy owners_insert_own on public.owners
  for insert to authenticated
  with check (id = auth.uid());

create policy owners_update_own on public.owners
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- pets — readable by any signed-in owner (match browsing); writes own-only.
-- ---------------------------------------------------------------------------
create policy pets_select_authenticated on public.pets
  for select to authenticated
  using (true);

create policy pets_insert_own on public.pets
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy pets_update_own on public.pets
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy pets_delete_own on public.pets
  for delete to authenticated
  using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- devices — full access for the owner of the bound pet. The pair-device and
-- device-heartbeat edge functions use the service role (bypasses RLS).
-- ---------------------------------------------------------------------------
create policy devices_owner_all on public.devices
  for all to authenticated
  using (public.is_pet_owner(pet_id))
  with check (public.is_pet_owner(pet_id));

-- ---------------------------------------------------------------------------
-- pairing_codes — service-role ONLY. No policies; belt-and-braces revoke.
-- ---------------------------------------------------------------------------
revoke all on table public.pairing_codes from anon, authenticated;

-- ---------------------------------------------------------------------------
-- availability_windows — readable by any signed-in owner (schedule-overlap
-- matching); writes restricted to the pet's owner.
-- ---------------------------------------------------------------------------
create policy availability_select_authenticated on public.availability_windows
  for select to authenticated
  using (true);

create policy availability_insert_own on public.availability_windows
  for insert to authenticated
  with check (public.is_pet_owner(pet_id));

create policy availability_update_own on public.availability_windows
  for update to authenticated
  using (public.is_pet_owner(pet_id))
  with check (public.is_pet_owner(pet_id));

create policy availability_delete_own on public.availability_windows
  for delete to authenticated
  using (public.is_pet_owner(pet_id));

-- ---------------------------------------------------------------------------
-- connections — both owners can read/update/delete; requester creates as
-- 'pending' from a pet they own (mutual consent = partner flips to 'active').
-- ---------------------------------------------------------------------------
create policy connections_select_owners on public.connections
  for select to authenticated
  using (public.is_pet_owner(pet_a_id) or public.is_pet_owner(pet_b_id));

create policy connections_insert_requester on public.connections
  for insert to authenticated
  with check (
    public.is_pet_owner(requested_by_pet_id)
    and status = 'pending'
  );

create policy connections_update_owners on public.connections
  for update to authenticated
  using (public.is_pet_owner(pet_a_id) or public.is_pet_owner(pet_b_id))
  with check (public.is_pet_owner(pet_a_id) or public.is_pet_owner(pet_b_id));

create policy connections_delete_owners on public.connections
  for delete to authenticated
  using (public.is_pet_owner(pet_a_id) or public.is_pet_owner(pet_b_id));

-- ---------------------------------------------------------------------------
-- sessions — both connection owners can READ. All writes go through edge
-- functions with the service role; no insert/update/delete policies.
-- ---------------------------------------------------------------------------
create policy sessions_select_connection_owners on public.sessions
  for select to authenticated
  using (public.is_connection_owner(connection_id));

-- ---------------------------------------------------------------------------
-- reports — an owner of the connection may file a report and read their own
-- reports; review (status changes) happens via the service role.
-- ---------------------------------------------------------------------------
create policy reports_insert_reporter on public.reports
  for insert to authenticated
  with check (
    reporter_owner_id = auth.uid()
    and public.is_connection_owner(connection_id)
  );

create policy reports_select_own on public.reports
  for select to authenticated
  using (reporter_owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- waitlist_signups — anonymous INSERT only. No select/update/delete for
-- client roles; landing page must POST with Prefer: return=minimal.
-- ---------------------------------------------------------------------------
create policy waitlist_insert_anon on public.waitlist_signups
  for insert to anon, authenticated
  with check (true);
