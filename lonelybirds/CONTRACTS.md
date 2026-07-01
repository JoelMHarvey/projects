# LonelyBirds — Engineering Contracts (v1)

This document is the single source of truth for interfaces between components.
Every builder MUST conform to it. If something is ambiguous, follow the spec in
the repo root handoff doc and keep changes additive — do not rename entities
defined here.

## Repo layout & file ownership

```
lonelybirds/
  package.json / tsconfig.json / vitest.config.ts   (owned: infra — do not restructure)
  types/deno-shim.d.ts                              (infra)
  landing/                    (owner: landing builder)
    index.html                — standalone landing page + waitlist form
    vercel.json               — static deploy config
  supabase/
    migrations/               (owner: db builder) — numbered .sql files
    functions/                (owner: functions builder)
      _shared/                — PURE TypeScript logic, no Deno globals, no URL imports
      <fn-name>/index.ts      — thin Deno entrypoints (excluded from vitest)
  app/
    src/core/                 (owner: core-lib builder) — pure logic, NO react/react-native imports
    src/api/                  (owner: owner-app builder) — supabase client + typed queries
    src/rtc/                  (owner: terminal-app builder) — WebRTC abstraction
    src/owner/                (owner: owner-app builder) — Owner Remote mode screens
    src/terminal/             (owner: terminal-app builder) — Companion Terminal mode screens
    src/App.tsx, src/ModeGate.tsx (owner: owner-app builder)
    src/main.tsx               — composition root: injects TerminalApp + observer factory into App
  docs/                       (final pass)
```

Tests live next to code as `*.test.ts` (vitest, node environment). Modules under
`app/src/core`, `app/src/rtc` (except the native adapter) and
`supabase/functions/_shared` must be importable under plain Node (no RN, no Deno).

## Database schema (Postgres / Supabase)

Enums are plain `text` + CHECK constraints. All tables have `id uuid primary key
default gen_random_uuid()` and `created_at timestamptz default now()` unless noted.

- `owners` — id references `auth.users(id)`, `email text`, `display_name text`, `timezone text not null default 'UTC'`
- `pets` — `owner_id uuid → owners`, `name text not null`, `species text not null default 'bird'` (CHECK in bird/cat/dog/rabbit), `photo_url text`, `personality_tags text[]` (values: calm/chatty/shy/noisy), `timezone text not null`
- `devices` — `pet_id uuid → pets`, `role text CHECK ('terminal')`, `push_token text`, `last_seen_at timestamptz`, `is_online boolean default false`
- `pairing_codes` — `code text` (6 digits), `pet_id uuid`, `expires_at timestamptz`, `claimed_by_device uuid null`
- `availability_windows` — `pet_id`, `weekday int CHECK 0-6` (0=Sunday), `start_minute int CHECK 0-1439`, `end_minute int CHECK 1-1440`, `start_minute < end_minute`. Times are LOCAL to the pet's timezone.
- `connections` — `pet_a_id`, `pet_b_id` (invariant: `pet_a_id < pet_b_id`, UNIQUE pair), `requested_by_pet_id`, `status text CHECK pending/active/paused/blocked`, `updated_at`
- `sessions` — `connection_id`, `initiated_by text CHECK schedule/owner_trigger`, `requested_by_pet_id uuid null → pets` (set for owner_trigger; respond-session rejects responses from the requesting owner), `status text CHECK pending_approval/connecting/active/ended/failed`, `started_at`, `ended_at`, `scheduled_end_at timestamptz`, `end_reason text null` (window_boundary/max_duration/owner_ended/failed/partner_declined). NO media columns, ever.
- `reports` — `connection_id`, `reporter_owner_id`, `reason text`, `status text CHECK open/reviewed`
- `waitlist_signups` — `email text unique not null`, `source text default 'landing'`

RLS: enabled on every table. Owners read/write their own rows; both owners of a
connection can read the connection and its sessions; `waitlist_signups` allows
anonymous INSERT only; `pairing_codes` claiming happens via edge function
(service role). Session max duration default: 60 minutes.

Connection status transitions are enforced server-side by a DB trigger
(`connections_status_transition`, migration 0004), not just the client UI:
only the NON-requesting owner may move pending→active (mutual consent);
`blocked` is terminal for client roles (review/service role only); a
connection with an open report cannot be set back to `active` by clients
(flagged connections stay suspended pending review); no status may return to
`pending`. The service role bypasses all of this.

## Edge functions (Deno entrypoints; logic in `_shared`)

All take/return JSON, auth via Supabase JWT unless noted.

| Function | Input | Behaviour |
|---|---|---|
| `create-pairing-code` | `{pet_id}` | owner-auth; issues 6-digit code, 10-min expiry |
| `pair-device` | `{code, device_name}` | NO user auth (anon); claims code → creates `devices` row, returns `{device_id, pet_id, device_jwt?}` |
| `request-session` | `{connection_id}` | validates connection active + partner pet within availability window (`_shared/availability.ts`); in-window → session `connecting` + notify both terminals; out-of-window → session `pending_approval` (records `requested_by_pet_id`) + push partner owner |
| `respond-session` | `{session_id, approve}` | partner owner (NEVER the requester — enforced via `sessions.requested_by_pet_id`) approves/declines a `pending_approval` session; approval re-checks the connection is still `active` |
| `end-session` | `{session_id, reason}` | either owner or terminal; sets `ended` + `end_reason`, broadcasts `bye` |
| `schedule-tick` | cron (service role) | starts scheduled sessions when both pets' windows overlap 'now'; ends sessions past `scheduled_end_at`; marks devices offline (`last_seen_at` > 90s) and pushes owner |
| `device-heartbeat` | `{device_id, push_token?}` | updates `last_seen_at`, `is_online`; when `push_token` is present, registers it on the device (the APNs registration path) |

Push delivery: `_shared/push.ts` exposes `sendPush(token, payload)` — APNs via
provider; implementation may be a stub that logs + interface, but the call sites
must be real. Because terminals hold no APNs token until the native build lands,
every "session starting" notification is ALSO broadcast over Supabase Realtime
to channel `terminal:{device_id}`, event `session-start`, payload
`{session_id, pet_id, partner_pet_id}` (matching `SessionStartPush` in
`app/src/terminal/terminalApi.ts`) — this is the delivery path paired terminals
listen on today. Producers: request-session, respond-session, schedule-tick
(via `_shared/realtime.ts`, the Realtime HTTP broadcast endpoint).

## Signalling protocol (Supabase Realtime broadcast channel `session:{session_id}`)

Message envelope (JSON): `{v: 1, type, from, payload}`, sent as Realtime
broadcast event `signal` (`SIGNAL_EVENT`) — clients filter by event name, so
server-sent envelopes (e.g. the `bye` from end-session / schedule-tick) MUST
use the same event name.
- `type`: `'hello' | 'offer' | 'answer' | 'ice' | 'bye'`
- `from`: `'terminal_a' | 'terminal_b' | 'observer:{owner_id}'`
- terminal_a = terminal of the pet with the lexically smaller pet id; terminal_a is the **impolite** peer (creates the offer), terminal_b is polite (perfect negotiation).
- Observers join recv-only: they send `hello`, terminal_a sends them an offer with `sendonly` transceivers. Observer never publishes media.

Pure protocol types + reducer live in `app/src/core/signalling.ts` and are
re-declared (copied) in `supabase/functions/_shared/signalling.ts` if needed —
no cross-package imports between app/ and supabase/.

## app/src/core — pure modules (no React imports)

- `availability.ts` — `Window {weekday, startMinute, endMinute}`;
  `isWithinWindow(now: Date, windows: Window[], tz: string): boolean`;
  `windowsOverlapNow(a: Window[], aTz: string, b: Window[], bTz: string, now: Date): boolean`;
  `currentOverlapEnd(...): Date | null`. Timezone math via `Intl.DateTimeFormat` only (no deps).
- `pairing.ts` — `generatePairingCode(rng?): string` (6 digits, no leading-zero stripping), `isValidPairingCode(s): boolean`.
- `backoff.ts` — `nextBackoffMs(attempt, {baseMs=1000, maxMs=30000, jitter})`.
- `sessionMachine.ts` — pure reducer: states `idle → joining → negotiating → active → reconnecting → ended`; events `JOIN, PEER_HELLO, NEGOTIATED, DISCONNECT, RECONNECTED, RECONNECT_TIMEOUT (60s), END(reason), WINDOW_BOUNDARY, MAX_DURATION`; `reconnecting` longer than 60s → `ended(failed)`.
- `signalling.ts` — message types above + `whoAmI(petId, partnerPetId): 'terminal_a'|'terminal_b'`.

## app/src/rtc — WebRTC abstraction

`RTCProvider` interface: `createPeer(opts): PeerHandle` with methods
`setLocalStream`, `createOffer`, `acceptOffer`, `acceptAnswer`, `addIce`,
`onIce/onTrack/onConnectionStateChange`, `close`. Two implementations:
`NativeRTCProvider` (react-native-webrtc, typed via `types/deno-shim.d.ts`
ambient module) and `MockRTCProvider` (in-memory pair, used by tests).
`SessionController` wires `sessionMachine` + `RTCProvider` + a
`SignallingChannel` interface (send/onMessage) — testable with mocks.
Video constraints: max 640x480@15fps (old-device thermals, per spec §14).
ICE servers: `rtc/iceConfig.ts` resolves STUN + the managed TURN relay from
build placeholders `__TURN_URL__` / `__TURN_USERNAME__` / `__TURN_CREDENTIAL__`
(or `TURN_*` env vars), same substitution convention as `api/client.ts`;
`NativeRTCProvider` uses `resolveIceServers()` by default (STUN-only while
unconfigured).

## app/src — React Native (UI is typechecked, not unit-tested)

Single app, mode chosen at first run (`ModeGate.tsx`, persisted). Minimal
navigation: hand-rolled stack via component state is fine — do NOT add
react-navigation (keeps deps light). Screens:

- Owner: `SignInScreen`, `PetProfileScreen`, `AvailabilityScreen`, `MatchesScreen`, `ConnectionsScreen`, `PairTerminalScreen` (shows code), `SessionScreen` (trigger/observe/end)
- Terminal: `EnterCodeScreen`, `WaitingScreen` (idle, keep-awake), `TerminalSessionScreen` (full-screen remote video)

`app/src/api/client.ts` — `createClient` from `@supabase/supabase-js` with env
placeholders; `app/src/api/queries.ts` — typed helpers (getMatches filtered by
species + schedule overlap, connection CRUD, session trigger via edge functions).
DB row types in `app/src/api/types.ts` mirroring the schema above.

## Landing page

Standalone `landing/index.html`, no build step. Dawn-light palette (amber
#F59E0B-ish, teal #0F766E-ish, cream #FFFBEB), animated birds-on-a-wire hero
(CSS/SVG), sections: hero + waitlist form, problem stats, how-it-works (3
steps), trust & safety grid, species roadmap, footer with brand line
"Every bird deserves a flock." Waitlist form POSTs to Supabase REST
(`/rest/v1/waitlist_signups`, anon key placeholder `__SUPABASE_ANON_KEY__`,
url placeholder `__SUPABASE_URL__`) with a JS confirmation state and a
graceful fallback message if unconfigured. Plausible analytics snippet
(`data-domain="lonelybirds.app"` placeholder). Accessible, responsive.

## Conventions

- TypeScript strict; no `any` except at the react-native-webrtc boundary.
- No new npm dependencies beyond what's in package.json without updating this file.
- Every pure module gets a `*.test.ts` with meaningful cases (DST/timezone edges for availability; reconnect timeout for the machine).
- `npm run typecheck` and `npm test` from `lonelybirds/` must pass.
