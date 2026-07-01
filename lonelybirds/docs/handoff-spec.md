# LonelyBirds — Development Handoff Specification

> *"Every bird deserves a flock."*

**Version:** 1.0 (Handoff)
**Owner:** Joel
**Date:** July 2026
**Domain:** lonelybirds (owned)
**Status:** Ready for engineering scoping

---

## 1. Problem Statement

Caged birds (parrots, cockatiels, budgies, canaries) are highly social animals. Extended daily isolation while owners are at work causes measurable behavioural harm: depression, feather-plucking, and vocal withdrawal. Existing pet tech (cameras, treat dispensers) is owner-centric — nothing serves the animal's own social needs. A second bird is often infeasible due to cost, space, or disease quarantine risk.

**Impact of not solving:** millions of companion birds spend 8+ hours/day alone; owners feel guilt; no product in market addresses pet-to-pet connection.

---

## 2. Product Concept

A two-sided platform connecting lonely pets via live video while owners are away:

1. **Pet-side device** — an old iPhone/iPad mounted near the cage runs the app as a dedicated companion terminal (front camera + mic, plugged in, always-on).
2. **Owner-side app** — the owner's own iPhone/iPad controls everything remotely: schedule sessions, trigger a session on demand, view live sessions, manage connections.
3. **Sessions** — low-latency WebRTC peer-to-peer video/audio between two pets whose owners have mutually approved the connection. Birds see and hear a companion bird on screen.

Ideal launch species: **birds** (they vocalise and respond to on-screen companions). Architecture must not preclude cats, dogs, rabbits later.

---

## 3. Goals

1. Ship a working MVP where two mutually-approved birds can hold a scheduled or owner-triggered video session, end to end, within ~3 months.
2. Owner can start, stop, and monitor a session remotely from their own device in under 10 seconds.
3. ≥70% of beta users (target ~20 bird owners) complete at least 3 sessions in their first 2 weeks.
4. Zero video stored anywhere — streams are ephemeral (trust differentiator and cost control).
5. Landing page live on the lonelybirds domain collecting waitlist signups before app beta.

## 4. Non-Goals (v1)

- **No multi-party "flock rooms"** (4-way sessions) — P2; design signalling layer so it's possible later.
- **No species beyond birds** — data model should carry a `species` field but no cat/dog UX.
- **No Android** — old iOS devices are the pet terminal; owner app is iOS-only for MVP.
- **No ML matchmaking** — simple DB query on species + schedule overlap is sufficient.
- **No recording, clips, or highlights** — conflicts with the no-storage trust promise.
- **No payments in v1** — freemium gating comes after beta validates engagement.

---

## 5. User Roles & Modes

One app, two modes (chosen at setup):

| Mode | Runs on | Purpose |
|---|---|---|
| **Companion Terminal** | Old iPhone/iPad near the cage | Full-screen video of partner bird; auto-answers approved sessions; no interactive controls needed by the pet |
| **Owner Remote** | Owner's daily iPhone/iPad | Profiles, matching, scheduling, remote trigger, live monitoring, settings |

---

## 6. User Stories (priority order)

**Owner — setup**
- As a bird owner, I want to register my pet (name, species, photo, personality tags) so other owners can evaluate a match.
- As a bird owner, I want to pair an old iPad as my pet's terminal via a one-time code so setup requires no typing on the old device.
- As a bird owner, I want to set my pet's availability window (e.g. Mon–Fri 09:00–18:00 JST) so sessions only happen when appropriate.

**Owner — matching & trust**
- As a bird owner, I want to browse/receive suggested matches filtered by species and schedule overlap so I can find a compatible companion.
- As a bird owner, I want connections to require mutual approval from both owners so my pet only ever connects to trusted partners.
- As a bird owner, I want to disconnect or block a connection instantly so I stay in control.

**Owner — sessions**
- As an owner at work, I want to trigger a session on demand from my phone so my bird gets company when I notice it's restless (e.g. via a cage camera).
- As an owner, I want sessions to start automatically on schedule so my bird has routine company without my intervention.
- As an owner, I want to peek at any live session from my phone so I can verify everything is fine.
- As an owner, I want sessions to end automatically at the window boundary or a configured max duration so the terminal doesn't run indefinitely.

**Terminal / edge cases**
- As an owner, I want the terminal to auto-reconnect after WiFi drops so a flaky connection doesn't end my bird's session permanently.
- As an owner, I want to be notified if my terminal goes offline so I know my pet is without service.

---

## 7. Requirements

### P0 — Must Have

**Accounts & profiles**
- [ ] Email sign-up with verification (Supabase Auth)
- [ ] Pet profile: name, species, photo, personality tags (calm / chatty / shy / noisy), timezone
- [ ] Availability schedule per pet (weekly recurring windows)

**Device pairing**
- [ ] Owner generates a 6-digit pairing code; terminal device enters it once and becomes bound to the pet
- [ ] Terminal mode: full-screen, screen-sleep disabled, auto-launch session UI, no auth prompts after pairing

**Matching & consent**
- [ ] Match list filtered by species + schedule overlap
- [ ] Connection request → mutual accept required before any session possible
- [ ] Owner can view, pause, or delete any connection

**Sessions**
- [ ] Scheduled sessions: auto-connect within availability overlap of both pets
- [ ] **Remote trigger:** owner taps "Start session now" → partner terminal receives push → session begins if within the partner pet's availability window (or partner owner approves in-app)
- [ ] WebRTC peer-to-peer video/audio between the two terminals; TURN fallback for NAT traversal
- [ ] Owner live-view: owner app can join a running session as a silent observer
- [ ] Auto-end at window boundary / max duration; either owner can end instantly
- [ ] No media recorded or stored server-side — signalling only

**Reliability & safety**
- [ ] Auto-reconnect with exponential backoff on network drop
- [ ] Terminal offline → push notification to owner
- [ ] Report/flag a connection; flagged connections suspended pending review

**Landing page**
- [ ] Deployed to lonelybirds domain (existing dawn-light design: amber/teal/cream, animated birds-on-a-wire hero)
- [ ] Waitlist form → email capture (Supabase table or provider like Buttondown/Loops)
- [ ] Sections: hero, problem stats, how-it-works (3 steps), trust & safety grid, species roadmap
- [ ] Basic analytics (Plausible or similar, privacy-respecting)

### P1 — Nice to Have
- [ ] Ambient bird-sound layer during sessions (species-appropriate calls)
- [ ] Session history log (metadata only: partner, duration, timestamps — no media)
- [ ] "Bird responded" heuristic: mic activity level during session → simple engagement score shown to owner
- [ ] Multiple pets per account
- [ ] Push notification when a scheduled session starts/ends

### P2 — Future (design for, don't build)
- [ ] Multi-party flock rooms (SFU architecture — flag: pure P2P won't scale to this; choose signalling stack accordingly)
- [ ] Other species (cats, dogs, rabbits) with species-specific session UX
- [ ] Freemium: 1 connection free, multiple = subscription (~£3–5/mo)
- [ ] B2B: boarding facilities, vets, aviaries
- [ ] Android terminal support (huge supply of old Android tablets)

---

## 8. Technical Architecture (recommended, open to team input)

| Component | Recommendation | Rationale |
|---|---|---|
| Apps (both modes) | React Native, single codebase | Old-device support (target iOS 15+, ideally 13+ — **engineering to confirm floor vs RN + WebRTC lib support**) |
| Video | WebRTC (react-native-webrtc), P2P with TURN fallback | Low latency, no media server cost, no storage by design |
| Signalling | Supabase Realtime channels (or lightweight Node WS service if limits hit) | Fast to build; auth + DB already there |
| TURN | Managed (Twilio NTS / Cloudflare Calls / metered.ca) | Don't self-host coturn for MVP |
| Backend | Supabase (Postgres, Auth, Realtime, Edge Functions) | Auth, DB, RLS, push triggers in one place |
| Push | APNs via Supabase Edge Function or OneSignal | Remote trigger + offline alerts |
| Landing | Static HTML (already built) on Vercel/Cloudflare Pages | £0, instant |

**Key data entities:** `owners`, `pets`, `devices` (terminal bindings), `availability_windows`, `connections` (status: pending/active/paused/blocked), `sessions` (metadata only), `reports`.

**Session flow (remote trigger):**
1. Owner app → API: request session (connection_id)
2. Server validates: connection active, partner pet within availability window (else push approval request to partner owner)
3. Push to both terminals → terminals join signalling channel → exchange SDP/ICE → P2P stream
4. Owner app may subscribe as recv-only observer
5. Timer/window boundary or owner action → teardown; session row updated with duration

---

## 9. Acceptance Criteria (core flows)

**Remote trigger**
- Given both owners have an active connection and the partner pet is within its availability window, when Owner A taps "Start session now", then both terminals connect and video is flowing within 15 seconds on typical home WiFi.
- Given the partner pet is outside its window, when Owner A taps "Start session now", then Owner B receives an approval push and the session starts only on approval.

**Scheduled session**
- Given two connected pets with overlapping windows Mon 09:00–18:00, when the overlap begins, then a session auto-starts without either owner acting, and auto-ends at overlap end.

**Trust**
- Given a pending connection request, when only one owner has accepted, then no session can be initiated by any means.
- Given an active session, when either owner taps "End", then both terminals disconnect within 3 seconds.

**Privacy**
- Given any completed session, then no audio/video media exists on any server (verifiable: media path is P2P/TURN relay only; TURN configured with no recording).

**Terminal resilience**
- Given a running session, when the terminal loses WiFi for <60s, then the session auto-recovers without owner action.

---

## 10. Milestones (indicative, 3 months / small team)

| Phase | Weeks | Scope |
|---|---|---|
| **0 — Landing** | 1 | Deploy existing landing page + waitlist to lonelybirds domain |
| **1 — Foundation** | 2–4 | Auth, pet profiles, device pairing, availability schedules, connection requests + mutual consent |
| **2 — Video core** | 5–8 | WebRTC session between two terminals, signalling, TURN, remote trigger, owner observer view |
| **3 — Hardening** | 9–11 | Scheduling automation, reconnect logic, offline alerts, reporting/blocking, push notifications |
| **4 — Beta** | 12 | TestFlight beta with ~20 waitlist bird owners; instrument session metrics |

---

## 11. Success Metrics

**Leading (first 30 days of beta)**
- Pairing completion rate ≥ 80% of owners who start setup
- Median remote-trigger-to-video time ≤ 15s
- Session failure rate (failed to establish) ≤ 10%
- ≥ 70% of beta owners complete 3+ sessions in first 2 weeks

**Lagging (60–90 days)**
- Weekly session retention: % of owners still running ≥2 sessions/week at day 60
- Waitlist growth from landing page (target: 500 signups pre-launch)
- Qualitative: owner-reported behaviour change in birds (survey)

---

## 12. Open Questions

| # | Question | Owner | Blocking? |
|---|---|---|---|
| 1 | Minimum iOS version we can support with react-native-webrtc — is iOS 13 realistic or is 15 the floor? Determines the "old device" story | Engineering | Yes (affects framework choice) |
| 2 | Supabase Realtime as signalling: connection limits and latency acceptable, or dedicated WS service from day one? | Engineering | Yes |
| 3 | TURN provider choice and projected relay cost per session-hour (matters if many home NATs force relay) | Engineering | No |
| 4 | Guided Access / kiosk approach for the terminal so the bird can't dismiss the app | Engineering/Design | No |
| 5 | App Store review risk: always-on camera app category, background behaviour — any precedent to check? | Joel + Engineering | No |
| 6 | Waitlist email provider preference | Joel | No |
| 7 | Exact domain TLD in hand (.com / .app?) — affects deep links and Apple Universal Links config | Joel | No |

---

## 13. Existing Assets

- **Landing page** — complete standalone HTML, dawn-light aesthetic (amber/teal/cream), animated birds-on-wire hero, waitlist form with confirmation state. Needs: hooking form to real backend, deploy to domain.
- **Project file** — Obsidian/Notion markdown with vision, journey, data model, risks (June 2026).
- **Brand line** — *"Every bird deserves a flock."*

---

## 14. Risks

- **NAT traversal**: many home networks will force TURN relay → bandwidth cost. Mitigate: cap session length free tier, monitor relay ratio in beta.
- **Old-device performance**: WebRTC decode on an iPhone 7 may run hot on a device sitting plugged-in all day. Mitigate: cap resolution (480p is fine — it's for a bird), test thermals in beta.
- **Engagement uncertainty**: do birds actually respond to screen companions? Mitigate: the P1 mic-activity engagement score gives an early signal; recruit beta from active bird-owner communities.
- **Scope creep to other species**: explicit non-goal; parking lot only.
