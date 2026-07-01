# LonelyBirds

> *"Every bird deserves a flock."*

Live video companionship for caged birds. Two mutually-approved pets hold
low-latency WebRTC video sessions on old iPhones/iPads mounted near their
cages, controlled remotely by their owners. No video is ever stored — streams
are ephemeral by design.

Built from `docs/handoff-spec.md`. Interfaces between components are governed
by `CONTRACTS.md` — read it first when changing anything.

## Status

MVP codebase, pre-device milestone. Everything that can run without physical
hardware is implemented and tested; native-only concerns (APNs delivery, real
camera/WebRTC hardware, kiosk mode) are interface-complete behind adapters and
land with the Xcode/TestFlight build.

```bash
npm install
npm run typecheck   # tsc --noEmit, strict
npm test            # vitest — 209 tests: core logic, session protocol, edge-function rules
```

## Layout

| Path | What it is |
|---|---|
| `landing/` | Standalone dawn-light landing page + Supabase waitlist form. Deploy to Vercel/Cloudflare Pages (see `landing/README.md`). |
| `supabase/migrations/` | Postgres schema + RLS: owners, pets, devices, pairing codes, availability windows, connections (mutual consent enforced by trigger), sessions (metadata only), reports, waitlist. |
| `supabase/functions/` | Edge functions: `create-pairing-code`, `pair-device`, `request-session`, `respond-session`, `end-session`, `schedule-tick` (cron), `device-heartbeat`. Decision logic lives in `_shared/` and is unit-tested under vitest. |
| `app/src/core/` | Pure logic: DST-aware availability/overlap math, session state machine (60s reconnect window), backoff, signalling protocol. No React, no deps. |
| `app/src/rtc/` | WebRTC abstraction: `RTCProvider` interface, mock provider (drives the end-to-end protocol tests), native adapter over `react-native-webrtc`, `SessionController` with perfect negotiation + auto-reconnect, recv-only observer join. |
| `app/src/owner/` | Owner Remote mode: sign-in, pet profile, availability editor, matches, connections, terminal pairing, session trigger/observe/end. |
| `app/src/terminal/` | Companion Terminal mode: 6-digit pairing, waiting screen with heartbeat, auto-answering full-screen session. |

## Running the real thing

1. **Supabase** — create a project, `supabase db push` the migrations, deploy
   the functions (`supabase functions deploy`), schedule `schedule-tick` every
   minute (cron), set function secrets. Details in `supabase/README.md`.
2. **Landing** — substitute `__SUPABASE_URL__` / `__SUPABASE_ANON_KEY__` and
   deploy `landing/` statically. Details in `landing/README.md`.
3. **App** — the RN app needs a native shell (bare RN or Expo prebuild) adding
   `react-native-webrtc` and a keep-awake module; inject the Supabase
   placeholders at build time. One codebase, mode chosen at first launch
   (`ModeGate`).

## Key engineering answers (spec §12)

1. **iOS floor** — RN is pinned at 0.75 (minimum iOS 13.4; RN 0.76+ raises it
   to 15.1) and `react-native-webrtc` supports iOS 12+, so **iOS 13.4 is the
   working floor** — iPhone 6s/SE-gen1 era devices qualify as terminals.
   Confirm thermals on real hardware in beta (video capped at 640×480@15fps
   for this reason).
2. **Signalling** — Supabase Realtime broadcast channels; the protocol is
   pure/reducer-based (`app/src/core/signalling.ts`), so swapping in a
   dedicated WS service later only replaces the `SignallingChannel` adapter.
3. **TURN** — config injected via `app/src/rtc/iceConfig.ts`; use a managed
   provider (Cloudflare Calls / Twilio NTS / metered.ca), no recording.

## Privacy invariant

No media is recorded or stored anywhere: the media path is P2P (or TURN relay)
between terminals; the server only ever handles signalling JSON and session
metadata. The `sessions` table has no media columns — keep it that way.
