# LonelyBirds — Supabase database

Schema, indexes, triggers, and Row Level Security for the LonelyBirds MVP.
The authoritative interface contract is [`../CONTRACTS.md`](../CONTRACTS.md);
these migrations implement its "Database schema" section exactly.

## Layout

```
supabase/
  migrations/
    0001_init.sql              tables + CHECK constraints (text "enums")
    0002_indexes_triggers.sql  indexes, updated_at trigger, pair-immutability trigger
    0003_rls.sql               helper functions + RLS policies for every table
  functions/                   edge functions (owned by the functions builder)
```

Migrations are plain SQL, applied in filename order. Keep new migrations
additive (`0004_...` etc.) — never edit an applied migration.

## Applying migrations

With the [Supabase CLI](https://supabase.com/docs/guides/cli) from the repo
`lonelybirds/` directory:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push            # applies supabase/migrations/*.sql in order
```

Local development:

```bash
supabase start              # local stack (Postgres, Auth, Realtime, ...)
supabase db reset           # recreates local db and replays all migrations
```

Requires Postgres 13+ (`gen_random_uuid()`); `pgcrypto` is created
defensively in `0001_init.sql`. The `owners` table references `auth.users`,
so migrations must run against a Supabase project (or local stack), not a
bare Postgres.

## Schema notes

- **Text enums.** All enum-ish columns are `text` with `CHECK` constraints
  (`pets.species`, `connections.status`, `sessions.status`,
  `sessions.end_reason`, ...). Extending a set later is an
  `ALTER TABLE ... DROP/ADD CONSTRAINT`, not an enum migration.
- **Connections invariant.** `pet_a_id < pet_b_id` is a `CHECK` constraint,
  the pair is `UNIQUE (pet_a_id, pet_b_id)`, `requested_by_pet_id` must be one
  of the pair (`CHECK`), and a trigger (`connections_pets_immutable`) makes
  all three pet columns immutable after insert. Callers must order the two
  pet ids before inserting.
- **`connections.updated_at`** is bumped automatically by a `BEFORE UPDATE`
  trigger (`connections_set_updated_at`).
- **Sessions are metadata only.** No media columns exist and none may be
  added (contract + product trust promise). Max session duration defaults to
  60 minutes: edge functions set `scheduled_end_at =
  least(overlap_end, started_at + interval '60 minutes')`.
- **Availability windows are local time.** `weekday` 0=Sunday,
  `start_minute`/`end_minute` are minutes since local midnight in
  `pets.timezone`. Overlap across timezones is computed in code
  (`app/src/core/availability.ts`, `functions/_shared/availability.ts`).
- **Pairing codes.** A partial unique index
  (`pairing_codes_unclaimed_code_key`) guarantees at most one *unclaimed* row
  per code value, so claiming by code is unambiguous. `create-pairing-code`
  must retry on a unique violation (collision odds ≈ active codes / 10⁶) or
  purge expired unclaimed rows first. Expiry (10 minutes) is set by the edge
  function via `expires_at`.

## Indexes

| Query | Index |
|---|---|
| Match list: pets by species | `pets_species_idx` |
| Schedule overlap: windows per pet / by weekday+time | `availability_windows_pet_id_idx`, `availability_windows_weekday_time_idx` |
| Connections by pet | `connections_unique_pair` (covers `pet_a_id`), `connections_pet_b_id_idx` |
| Session history per connection (latest first) | `sessions_connection_id_idx` |
| `schedule-tick`: live sessions past `scheduled_end_at` | `sessions_live_scheduled_end_idx` (partial) |
| `schedule-tick`: mark stale devices offline (>90 s) | `devices_online_last_seen_idx` (partial, `is_online`) |
| Pairing-code claim lookup | `pairing_codes_unclaimed_code_key` (partial unique) |

## RLS model

RLS is **enabled on every table**. The Supabase `service_role` key (used by
edge functions and `schedule-tick`) bypasses RLS entirely.

Two `SECURITY DEFINER` helpers back the policies without recursive RLS
evaluation: `is_pet_owner(pet_id)` and `is_connection_owner(connection_id)`
(executable by `authenticated` only).

| Table | anon | authenticated | notes |
|---|---|---|---|
| `owners` | — | SELECT / INSERT / UPDATE own row (`id = auth.uid()`) | no client DELETE (account deletion via service role) |
| `pets` | — | SELECT all; INSERT/UPDATE/DELETE own (`owner_id = auth.uid()`) | read-all is required by the P0 match query, which runs with the user JWT |
| `availability_windows` | — | SELECT all; writes only for the pet's owner | read-all needed to compute schedule overlap for matching |
| `devices` | — | ALL for the owner of the bound pet | `pair-device` / `device-heartbeat` write via service role |
| `pairing_codes` | — | — (**no policies**, privileges revoked) | service-role only, per contract |
| `connections` | — | SELECT/UPDATE/DELETE for either pet's owner; INSERT by the requester (`is_pet_owner(requested_by_pet_id)`, status must be `'pending'`) | mutual consent = partner owner updates status to `'active'` |
| `sessions` | — | SELECT for both connection owners | **no client writes** — sessions are created/updated only by edge functions (service role) |
| `reports` | — | INSERT by a connection owner (`reporter_owner_id = auth.uid()`); SELECT own reports | review/status changes via service role |
| `waitlist_signups` | INSERT only | INSERT only | no SELECT policy → the landing form must POST with `Prefer: return=minimal` (no `RETURNING`) |

### Deviations / interpretations

The contract says "owners read/write their own rows". For `pets` and
`availability_windows` the SELECT policy is widened to all authenticated
users because the match list (species + schedule overlap) is a client-side
query under the user's JWT — without read access to other owners' pets and
windows it would always return empty. Writes remain strictly owner-scoped.
Everything else follows the contract verbatim.
