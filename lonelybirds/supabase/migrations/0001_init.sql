-- LonelyBirds — 0001_init.sql
-- Core schema per CONTRACTS.md "Database schema (Postgres / Supabase)".
-- Enums are plain text + CHECK constraints. Every table gets
--   id uuid primary key default gen_random_uuid()
--   created_at timestamptz default now()
-- unless noted (owners.id references auth.users).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- owners — one row per authenticated user (id mirrors auth.users.id)
-- ---------------------------------------------------------------------------
create table public.owners (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  display_name text,
  timezone     text not null default 'UTC',
  created_at   timestamptz not null default now()
);

comment on table public.owners is
  'Application profile for an authenticated user. id = auth.users.id.';

-- ---------------------------------------------------------------------------
-- pets
-- ---------------------------------------------------------------------------
create table public.pets (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.owners (id) on delete cascade,
  name             text not null,
  species          text not null default 'bird'
                     constraint pets_species_check
                     check (species in ('bird', 'cat', 'dog', 'rabbit')),
  photo_url        text,
  personality_tags text[]
                     constraint pets_personality_tags_check
                     check (
                       personality_tags is null
                       or personality_tags <@ array['calm', 'chatty', 'shy', 'noisy']::text[]
                     ),
  timezone         text not null,
  created_at       timestamptz not null default now()
);

comment on column public.pets.timezone is
  'IANA timezone name; availability_windows times are local to this timezone.';

-- ---------------------------------------------------------------------------
-- devices — companion terminal bindings (created by the pair-device edge fn)
-- ---------------------------------------------------------------------------
create table public.devices (
  id           uuid primary key default gen_random_uuid(),
  pet_id       uuid not null references public.pets (id) on delete cascade,
  role         text not null default 'terminal'
                 constraint devices_role_check check (role = 'terminal'),
  push_token   text,
  last_seen_at timestamptz,
  is_online    boolean not null default false,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- pairing_codes — service-role only (issued/claimed by edge functions)
-- ---------------------------------------------------------------------------
create table public.pairing_codes (
  id                uuid primary key default gen_random_uuid(),
  code              text not null
                      constraint pairing_codes_code_check check (code ~ '^[0-9]{6}$'),
  pet_id            uuid not null references public.pets (id) on delete cascade,
  expires_at        timestamptz not null,
  claimed_by_device uuid references public.devices (id) on delete set null,
  created_at        timestamptz not null default now()
);

comment on table public.pairing_codes is
  'Six-digit one-time pairing codes, 10-minute expiry. Accessed only via '
  'edge functions using the service role; no RLS policies are defined on purpose.';

-- ---------------------------------------------------------------------------
-- availability_windows — weekly recurring windows, LOCAL to the pet timezone
-- ---------------------------------------------------------------------------
create table public.availability_windows (
  id           uuid primary key default gen_random_uuid(),
  pet_id       uuid not null references public.pets (id) on delete cascade,
  weekday      int not null
                 constraint availability_windows_weekday_check
                 check (weekday between 0 and 6),           -- 0 = Sunday
  start_minute int not null
                 constraint availability_windows_start_minute_check
                 check (start_minute between 0 and 1439),
  end_minute   int not null
                 constraint availability_windows_end_minute_check
                 check (end_minute between 1 and 1440),
  created_at   timestamptz not null default now(),
  constraint availability_windows_order_check check (start_minute < end_minute)
);

comment on table public.availability_windows is
  'Weekly recurring windows. weekday 0=Sunday; minutes are local to the '
  'pet''s timezone (pets.timezone).';

-- ---------------------------------------------------------------------------
-- connections — mutual-consent link between two pets
-- Invariant: pet_a_id < pet_b_id, pair is unique.
-- ---------------------------------------------------------------------------
create table public.connections (
  id                  uuid primary key default gen_random_uuid(),
  pet_a_id            uuid not null references public.pets (id) on delete cascade,
  pet_b_id            uuid not null references public.pets (id) on delete cascade,
  requested_by_pet_id uuid not null references public.pets (id) on delete cascade,
  status              text not null default 'pending'
                        constraint connections_status_check
                        check (status in ('pending', 'active', 'paused', 'blocked')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint connections_pet_order_check check (pet_a_id < pet_b_id),
  constraint connections_requested_by_check
    check (requested_by_pet_id = pet_a_id or requested_by_pet_id = pet_b_id),
  constraint connections_unique_pair unique (pet_a_id, pet_b_id)
);

-- ---------------------------------------------------------------------------
-- sessions — metadata only. NO media columns, ever.
-- Max session duration default: 60 minutes — enforced by edge functions,
-- which set scheduled_end_at to least(window overlap end, start + 60 min).
-- ---------------------------------------------------------------------------
create table public.sessions (
  id               uuid primary key default gen_random_uuid(),
  connection_id    uuid not null references public.connections (id) on delete cascade,
  initiated_by     text not null
                     constraint sessions_initiated_by_check
                     check (initiated_by in ('schedule', 'owner_trigger')),
  status           text not null
                     constraint sessions_status_check
                     check (status in ('pending_approval', 'connecting', 'active', 'ended', 'failed')),
  started_at       timestamptz,
  ended_at         timestamptz,
  scheduled_end_at timestamptz,
  end_reason       text
                     constraint sessions_end_reason_check
                     check (
                       end_reason is null
                       or end_reason in ('window_boundary', 'max_duration', 'owner_ended',
                                         'failed', 'partner_declined')
                     ),
  created_at       timestamptz not null default now()
);

comment on table public.sessions is
  'Session metadata only — signalling happens over Realtime, media is P2P/TURN. '
  'No audio/video is ever stored; do not add media columns.';
comment on column public.sessions.scheduled_end_at is
  'Hard stop: min(availability-overlap end, started_at + max duration). '
  'Default max duration is 60 minutes (enforced in edge functions).';

-- ---------------------------------------------------------------------------
-- reports — flagged connections (review handled via service role)
-- ---------------------------------------------------------------------------
create table public.reports (
  id                uuid primary key default gen_random_uuid(),
  connection_id     uuid not null references public.connections (id) on delete cascade,
  reporter_owner_id uuid not null references public.owners (id) on delete cascade,
  reason            text,
  status            text not null default 'open'
                      constraint reports_status_check
                      check (status in ('open', 'reviewed')),
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- waitlist_signups — landing page email capture (anonymous INSERT only)
-- ---------------------------------------------------------------------------
create table public.waitlist_signups (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  source     text default 'landing',
  created_at timestamptz not null default now()
);
