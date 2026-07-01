/**
 * Decision logic for `request-session`, `respond-session` and `schedule-tick`.
 *
 * Pure functions over plain data: the Deno entrypoints load rows via
 * supabase-js, map them to these inputs, and execute the returned plans
 * (insert/update sessions, mark devices offline, send pushes). Everything
 * time- and policy-sensitive lives here so it is covered by vitest.
 *
 * Policy (CONTRACTS.md):
 * - request-session validates connection active + PARTNER pet within its
 *   availability window: in-window → session `connecting` (push both
 *   terminals); out-of-window → `pending_approval` (push partner owner).
 * - Session max duration default: 60 minutes. `scheduled_end_at` =
 *   least(availability boundary, start + max duration).
 * - schedule-tick starts scheduled sessions when both pets' windows overlap
 *   'now', ends live sessions past `scheduled_end_at`, and marks devices
 *   offline when `last_seen_at` is older than 90 seconds.
 */

import {
  currentOverlapEnd,
  isWithinWindow,
  windowsOverlapNow,
  type Window,
} from './availability.ts';

export const MAX_SESSION_MINUTES = 60;
export const PAIRING_CODE_TTL_MINUTES = 10;
export const DEVICE_OFFLINE_THRESHOLD_SECONDS = 90;

const MS_PER_MINUTE = 60_000;

/** Session statuses that count as "live" (at most one per connection). */
export const LIVE_SESSION_STATUSES = [
  'pending_approval',
  'connecting',
  'active',
] as const;

export function isLiveSessionStatus(status: string): boolean {
  return (LIVE_SESSION_STATUSES as readonly string[]).includes(status);
}

/** A pet's weekly availability, local to its own timezone. */
export interface PetSchedule {
  windows: Window[];
  timezone: string;
}

/**
 * Earliest of `now + maxMinutes` and any non-null boundary — the hard stop
 * for a session that starts at `now`.
 */
export function computeScheduledEnd(
  now: Date,
  boundaries: ReadonlyArray<Date | null>,
  maxMinutes: number = MAX_SESSION_MINUTES,
): Date {
  let end = new Date(now.getTime() + maxMinutes * MS_PER_MINUTE);
  for (const boundary of boundaries) {
    if (boundary !== null && boundary.getTime() < end.getTime()) {
      end = boundary;
    }
  }
  return end;
}

/**
 * End of the contiguous availability period the pet is inside at `now`,
 * or null when the pet is out of window.
 */
function ownWindowEnd(pet: PetSchedule, now: Date): Date | null {
  return currentOverlapEnd(pet.windows, pet.timezone, pet.windows, pet.timezone, now);
}

// ---------------------------------------------------------------------------
// request-session
// ---------------------------------------------------------------------------

export type RequestSessionDecision =
  | { kind: 'reject'; reason: 'connection_not_active' }
  | {
      /** Partner in-window: create the session `connecting`, push both terminals. */
      kind: 'start';
      sessionStatus: 'connecting';
      initiatedBy: 'owner_trigger';
      scheduledEndAt: Date;
    }
  | {
      /** Partner out-of-window: create `pending_approval`, push partner owner. */
      kind: 'await_approval';
      sessionStatus: 'pending_approval';
      initiatedBy: 'owner_trigger';
    };

export interface RequestSessionInputData {
  connectionStatus: string;
  /** Schedule of the pet whose owner tapped "Start session now". */
  requester: PetSchedule;
  /** Schedule of the partner pet (the one whose window gates the start). */
  partner: PetSchedule;
  now: Date;
  maxSessionMinutes?: number;
}

export function decideRequestSession(
  input: RequestSessionInputData,
): RequestSessionDecision {
  const { connectionStatus, requester, partner, now } = input;
  const maxMinutes = input.maxSessionMinutes ?? MAX_SESSION_MINUTES;

  if (connectionStatus !== 'active') {
    return { kind: 'reject', reason: 'connection_not_active' };
  }

  if (!isWithinWindow(now, partner.windows, partner.timezone)) {
    return {
      kind: 'await_approval',
      sessionStatus: 'pending_approval',
      initiatedBy: 'owner_trigger',
    };
  }

  // Hard stop: partner's window boundary, the requester's boundary when the
  // requester is also in-window (owner override means the requester pet may
  // be out of window — then only the partner's boundary applies), and the
  // max-duration cap.
  const boundaries: Array<Date | null> = [ownWindowEnd(partner, now)];
  if (isWithinWindow(now, requester.windows, requester.timezone)) {
    boundaries.push(
      currentOverlapEnd(
        requester.windows,
        requester.timezone,
        partner.windows,
        partner.timezone,
        now,
      ),
    );
  }

  return {
    kind: 'start',
    sessionStatus: 'connecting',
    initiatedBy: 'owner_trigger',
    scheduledEndAt: computeScheduledEnd(now, boundaries, maxMinutes),
  };
}

// ---------------------------------------------------------------------------
// respond-session
// ---------------------------------------------------------------------------

export type RespondSessionDecision =
  | {
      kind: 'reject';
      reason: 'session_not_pending' | 'requester_cannot_respond' | 'connection_not_active';
    }
  | {
      /** Approved: session goes `connecting`, push both terminals. */
      kind: 'start';
      sessionStatus: 'connecting';
      scheduledEndAt: Date;
    }
  | {
      kind: 'decline';
      sessionStatus: 'ended';
      endReason: 'partner_declined';
    };

export interface RespondSessionInputData {
  sessionStatus: string;
  /**
   * Current status of the connection the session belongs to. A session may
   * sit in `pending_approval` while the connection gets paused/blocked (a
   * safety action) — a non-active connection must make sessions impossible by
   * ANY means, so approval re-validates it.
   */
  connectionStatus: string;
  /**
   * True when the caller is the owner who REQUESTED the session
   * (sessions.requested_by_pet_id is one of the caller's pets). The whole
   * point of `pending_approval` is that the PARTNER owner consents; the
   * requester must never be able to approve (or decline) their own
   * out-of-window request. Requesters cancel via end-session instead.
   */
  callerIsRequester: boolean;
  approve: boolean;
  now: Date;
  maxSessionMinutes?: number;
}

/**
 * Approval is an explicit owner override of the availability window, so the
 * only hard stop applied is the max-duration cap from `now`.
 */
export function decideRespondSession(
  input: RespondSessionInputData,
): RespondSessionDecision {
  const { sessionStatus, connectionStatus, callerIsRequester, approve, now } = input;
  const maxMinutes = input.maxSessionMinutes ?? MAX_SESSION_MINUTES;

  if (sessionStatus !== 'pending_approval') {
    return { kind: 'reject', reason: 'session_not_pending' };
  }
  if (callerIsRequester) {
    return { kind: 'reject', reason: 'requester_cannot_respond' };
  }
  if (!approve) {
    // Declining is always safe, whatever the connection status.
    return { kind: 'decline', sessionStatus: 'ended', endReason: 'partner_declined' };
  }
  if (connectionStatus !== 'active') {
    return { kind: 'reject', reason: 'connection_not_active' };
  }
  return {
    kind: 'start',
    sessionStatus: 'connecting',
    scheduledEndAt: computeScheduledEnd(now, [], maxMinutes),
  };
}

// ---------------------------------------------------------------------------
// schedule-tick — 1) start scheduled sessions
// ---------------------------------------------------------------------------

export interface TickConnection {
  connectionId: string;
  petA: PetSchedule;
  petB: PetSchedule;
  /** True when the connection already has a live session (any status above). */
  hasLiveSession: boolean;
}

export interface ScheduledStart {
  connectionId: string;
  sessionStatus: 'connecting';
  initiatedBy: 'schedule';
  scheduledEndAt: Date;
}

/**
 * Sessions to auto-start now: active connections whose two pets' availability
 * windows overlap at `now` and which have no live session yet.
 * `scheduledEndAt` = least(overlap end, now + max duration).
 */
export function planScheduledStarts(
  connections: readonly TickConnection[],
  now: Date,
  maxSessionMinutes: number = MAX_SESSION_MINUTES,
): ScheduledStart[] {
  const starts: ScheduledStart[] = [];
  for (const c of connections) {
    if (c.hasLiveSession) continue;
    if (
      !windowsOverlapNow(
        c.petA.windows,
        c.petA.timezone,
        c.petB.windows,
        c.petB.timezone,
        now,
      )
    ) {
      continue;
    }
    const overlapEnd = currentOverlapEnd(
      c.petA.windows,
      c.petA.timezone,
      c.petB.windows,
      c.petB.timezone,
      now,
    );
    starts.push({
      connectionId: c.connectionId,
      sessionStatus: 'connecting',
      initiatedBy: 'schedule',
      scheduledEndAt: computeScheduledEnd(now, [overlapEnd], maxSessionMinutes),
    });
  }
  return starts;
}

// ---------------------------------------------------------------------------
// schedule-tick — 2) end sessions past scheduled_end_at
// ---------------------------------------------------------------------------

export interface TickSession {
  sessionId: string;
  status: string;
  startedAt: Date | null;
  scheduledEndAt: Date | null;
}

export interface SessionEnd {
  sessionId: string;
  sessionStatus: 'ended';
  endReason: 'window_boundary' | 'max_duration';
}

/**
 * Live (`connecting`/`active`) sessions whose `scheduled_end_at` has passed.
 * A session whose hard stop was the max-duration cap (scheduled end at least
 * `maxSessionMinutes` after start) ends with `max_duration`; otherwise the
 * stop was an availability boundary → `window_boundary`.
 */
export function planSessionEnds(
  sessions: readonly TickSession[],
  now: Date,
  maxSessionMinutes: number = MAX_SESSION_MINUTES,
): SessionEnd[] {
  const ends: SessionEnd[] = [];
  for (const s of sessions) {
    if (s.status !== 'connecting' && s.status !== 'active') continue;
    if (s.scheduledEndAt === null) continue;
    if (s.scheduledEndAt.getTime() > now.getTime()) continue;

    const hitMaxDuration =
      s.startedAt !== null &&
      s.scheduledEndAt.getTime() - s.startedAt.getTime() >=
        maxSessionMinutes * MS_PER_MINUTE;

    ends.push({
      sessionId: s.sessionId,
      sessionStatus: 'ended',
      endReason: hitMaxDuration ? 'max_duration' : 'window_boundary',
    });
  }
  return ends;
}

// ---------------------------------------------------------------------------
// schedule-tick — 3) mark stale devices offline
// ---------------------------------------------------------------------------

export interface TickDevice {
  deviceId: string;
  isOnline: boolean;
  lastSeenAt: Date | null;
}

/**
 * Device ids to flip `is_online → false` (and alert the owner): currently
 * online but silent for more than `thresholdSeconds` (or never seen at all).
 */
export function planOfflineDevices(
  devices: readonly TickDevice[],
  now: Date,
  thresholdSeconds: number = DEVICE_OFFLINE_THRESHOLD_SECONDS,
): string[] {
  const stale: string[] = [];
  for (const d of devices) {
    if (!d.isOnline) continue;
    if (
      d.lastSeenAt === null ||
      now.getTime() - d.lastSeenAt.getTime() > thresholdSeconds * 1000
    ) {
      stale.push(d.deviceId);
    }
  }
  return stale;
}
