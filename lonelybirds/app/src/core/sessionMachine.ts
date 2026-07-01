/**
 * Pure session state machine — no timers, no I/O, no React. The host
 * (SessionController in app/src/rtc) owns the clock: it dispatches
 * DISCONNECT/RECONNECT_TIMEOUT with timestamps and is expected to fire
 * RECONNECT_TIMEOUT after RECONNECT_TIMEOUT_MS of unbroken `reconnecting`.
 *
 * States: idle → joining → negotiating → active ⇄ reconnecting → ended
 */

export const RECONNECT_TIMEOUT_MS = 60_000;

/** Session max duration (minutes) default, mirroring the DB default. */
export const MAX_SESSION_DURATION_MINUTES = 60;

export type SessionStatus =
  | 'idle'
  | 'joining'
  | 'negotiating'
  | 'active'
  | 'reconnecting'
  | 'ended';

/** Mirrors `sessions.end_reason` in the DB schema. */
export type EndReason =
  | 'window_boundary'
  | 'max_duration'
  | 'owner_ended'
  | 'failed'
  | 'partner_declined';

export interface SessionState {
  status: SessionStatus;
  /** Set only when status === 'ended'. */
  endReason: EndReason | null;
  /** Timestamp (ms) at which the current `reconnecting` spell began. */
  reconnectingSince: number | null;
}

export type SessionEvent =
  | { type: 'JOIN' }
  | { type: 'PEER_HELLO' }
  | { type: 'NEGOTIATED' }
  | { type: 'DISCONNECT'; at?: number }
  | { type: 'RECONNECTED' }
  | { type: 'RECONNECT_TIMEOUT'; at?: number }
  | { type: 'END'; reason: EndReason }
  | { type: 'WINDOW_BOUNDARY' }
  | { type: 'MAX_DURATION' };

export const initialSessionState: SessionState = {
  status: 'idle',
  endReason: null,
  reconnectingSince: null,
};

function ended(reason: EndReason): SessionState {
  return { status: 'ended', endReason: reason, reconnectingSince: null };
}

/**
 * Pure reducer. Unknown/invalid (state, event) combinations return the state
 * unchanged; `ended` is terminal and absorbs everything.
 *
 * RECONNECT_TIMEOUT is guarded: when both the event's `at` and the state's
 * `reconnectingSince` are known and less than RECONNECT_TIMEOUT_MS apart, the
 * event is ignored (a stale timer). An untimestamped RECONNECT_TIMEOUT while
 * reconnecting always ends the session as failed.
 */
export function sessionReducer(
  state: SessionState,
  event: SessionEvent,
): SessionState {
  if (state.status === 'ended') return state;

  switch (event.type) {
    case 'JOIN':
      if (state.status === 'idle') {
        return { status: 'joining', endReason: null, reconnectingSince: null };
      }
      return state;

    case 'PEER_HELLO':
      if (state.status === 'joining') {
        return { status: 'negotiating', endReason: null, reconnectingSince: null };
      }
      return state;

    case 'NEGOTIATED':
      if (state.status === 'negotiating') {
        return { status: 'active', endReason: null, reconnectingSince: null };
      }
      return state;

    case 'DISCONNECT':
      if (state.status === 'active' || state.status === 'negotiating') {
        return {
          status: 'reconnecting',
          endReason: null,
          reconnectingSince: event.at ?? null,
        };
      }
      return state;

    case 'RECONNECTED':
      if (state.status === 'reconnecting') {
        return { status: 'active', endReason: null, reconnectingSince: null };
      }
      return state;

    case 'RECONNECT_TIMEOUT':
      if (state.status !== 'reconnecting') return state;
      if (
        event.at !== undefined &&
        state.reconnectingSince !== null &&
        event.at - state.reconnectingSince < RECONNECT_TIMEOUT_MS
      ) {
        // Stale/premature timer: not yet 60s of continuous reconnecting.
        return state;
      }
      return ended('failed');

    case 'END':
      if (state.status === 'idle') return state;
      return ended(event.reason);

    case 'WINDOW_BOUNDARY':
      if (state.status === 'idle') return state;
      return ended('window_boundary');

    case 'MAX_DURATION':
      if (state.status === 'idle') return state;
      return ended('max_duration');
  }
}
