import { describe, expect, it } from 'vitest';
import {
  initialSessionState,
  RECONNECT_TIMEOUT_MS,
  sessionReducer,
  type SessionEvent,
  type SessionState,
} from './sessionMachine';

function run(events: SessionEvent[], from: SessionState = initialSessionState): SessionState {
  return events.reduce(sessionReducer, from);
}

const toActive: SessionEvent[] = [
  { type: 'JOIN' },
  { type: 'PEER_HELLO' },
  { type: 'NEGOTIATED' },
];

describe('sessionReducer — happy path', () => {
  it('starts idle with no end reason', () => {
    expect(initialSessionState).toEqual({
      status: 'idle',
      endReason: null,
      reconnectingSince: null,
    });
  });

  it('walks idle → joining → negotiating → active', () => {
    let s = sessionReducer(initialSessionState, { type: 'JOIN' });
    expect(s.status).toBe('joining');
    s = sessionReducer(s, { type: 'PEER_HELLO' });
    expect(s.status).toBe('negotiating');
    s = sessionReducer(s, { type: 'NEGOTIATED' });
    expect(s.status).toBe('active');
    expect(s.endReason).toBeNull();
  });

  it('ignores out-of-order handshake events', () => {
    expect(sessionReducer(initialSessionState, { type: 'PEER_HELLO' }).status).toBe('idle');
    expect(sessionReducer(initialSessionState, { type: 'NEGOTIATED' }).status).toBe('idle');
    const joining = sessionReducer(initialSessionState, { type: 'JOIN' });
    expect(sessionReducer(joining, { type: 'NEGOTIATED' }).status).toBe('joining');
    expect(sessionReducer(joining, { type: 'JOIN' }).status).toBe('joining');
  });
});

describe('sessionReducer — reconnect cycle', () => {
  it('active + DISCONNECT → reconnecting, recording the timestamp', () => {
    const s = run([...toActive, { type: 'DISCONNECT', at: 1_000 }]);
    expect(s.status).toBe('reconnecting');
    expect(s.reconnectingSince).toBe(1_000);
  });

  it('negotiating + DISCONNECT → reconnecting (drop mid-handshake)', () => {
    const s = run([{ type: 'JOIN' }, { type: 'PEER_HELLO' }, { type: 'DISCONNECT', at: 5 }]);
    expect(s.status).toBe('reconnecting');
  });

  it('reconnecting + RECONNECTED → active and clears the timestamp', () => {
    const s = run([...toActive, { type: 'DISCONNECT', at: 1_000 }, { type: 'RECONNECTED' }]);
    expect(s.status).toBe('active');
    expect(s.reconnectingSince).toBeNull();
  });

  it('reconnecting >= 60s → ended(failed)', () => {
    const s = run([
      ...toActive,
      { type: 'DISCONNECT', at: 0 },
      { type: 'RECONNECT_TIMEOUT', at: RECONNECT_TIMEOUT_MS },
    ]);
    expect(s.status).toBe('ended');
    expect(s.endReason).toBe('failed');
  });

  it('ignores a premature RECONNECT_TIMEOUT (< 60s of reconnecting)', () => {
    const s = run([
      ...toActive,
      { type: 'DISCONNECT', at: 0 },
      { type: 'RECONNECT_TIMEOUT', at: RECONNECT_TIMEOUT_MS - 1 },
    ]);
    expect(s.status).toBe('reconnecting');
  });

  it('ignores a stale RECONNECT_TIMEOUT from a previous reconnect spell', () => {
    // Drop at t=0, recover, drop again at t=50s; a timer armed for the first
    // drop fires at t=60s — only 10s into the second spell, so ignore it.
    const s = run([
      ...toActive,
      { type: 'DISCONNECT', at: 0 },
      { type: 'RECONNECTED' },
      { type: 'DISCONNECT', at: 50_000 },
      { type: 'RECONNECT_TIMEOUT', at: 60_000 },
    ]);
    expect(s.status).toBe('reconnecting');
    const later = sessionReducer(s, { type: 'RECONNECT_TIMEOUT', at: 110_000 });
    expect(later.status).toBe('ended');
    expect(later.endReason).toBe('failed');
  });

  it('an untimestamped RECONNECT_TIMEOUT while reconnecting ends the session', () => {
    const s = run([...toActive, { type: 'DISCONNECT' }, { type: 'RECONNECT_TIMEOUT' }]);
    expect(s.status).toBe('ended');
    expect(s.endReason).toBe('failed');
  });

  it('RECONNECT_TIMEOUT outside reconnecting is a no-op', () => {
    const active = run(toActive);
    expect(sessionReducer(active, { type: 'RECONNECT_TIMEOUT', at: 999_999 }).status).toBe(
      'active',
    );
    expect(sessionReducer(initialSessionState, { type: 'RECONNECT_TIMEOUT' }).status).toBe('idle');
  });

  it('DISCONNECT from idle or joining is a no-op', () => {
    expect(sessionReducer(initialSessionState, { type: 'DISCONNECT' }).status).toBe('idle');
    const joining = sessionReducer(initialSessionState, { type: 'JOIN' });
    expect(sessionReducer(joining, { type: 'DISCONNECT' }).status).toBe('joining');
  });
});

describe('sessionReducer — ending', () => {
  it('END(reason) ends from any in-flight state with that reason', () => {
    for (const reason of ['owner_ended', 'partner_declined', 'failed'] as const) {
      const s = run([...toActive, { type: 'END', reason }]);
      expect(s.status).toBe('ended');
      expect(s.endReason).toBe(reason);
    }
    const fromJoining = run([{ type: 'JOIN' }, { type: 'END', reason: 'owner_ended' }]);
    expect(fromJoining.status).toBe('ended');
    const fromReconnecting = run([
      ...toActive,
      { type: 'DISCONNECT', at: 0 },
      { type: 'END', reason: 'owner_ended' },
    ]);
    expect(fromReconnecting.status).toBe('ended');
    expect(fromReconnecting.endReason).toBe('owner_ended');
  });

  it('WINDOW_BOUNDARY ends an active session with window_boundary', () => {
    const s = run([...toActive, { type: 'WINDOW_BOUNDARY' }]);
    expect(s).toMatchObject({ status: 'ended', endReason: 'window_boundary' });
  });

  it('MAX_DURATION ends an active session with max_duration', () => {
    const s = run([...toActive, { type: 'MAX_DURATION' }]);
    expect(s).toMatchObject({ status: 'ended', endReason: 'max_duration' });
  });

  it('WINDOW_BOUNDARY / MAX_DURATION also end a reconnecting session', () => {
    const reconnecting = run([...toActive, { type: 'DISCONNECT', at: 0 }]);
    expect(sessionReducer(reconnecting, { type: 'WINDOW_BOUNDARY' }).endReason).toBe(
      'window_boundary',
    );
    expect(sessionReducer(reconnecting, { type: 'MAX_DURATION' }).endReason).toBe('max_duration');
  });

  it('end events are no-ops from idle (nothing is running)', () => {
    expect(sessionReducer(initialSessionState, { type: 'WINDOW_BOUNDARY' }).status).toBe('idle');
    expect(sessionReducer(initialSessionState, { type: 'MAX_DURATION' }).status).toBe('idle');
    expect(
      sessionReducer(initialSessionState, { type: 'END', reason: 'owner_ended' }).status,
    ).toBe('idle');
  });

  it('ended is terminal: every event is absorbed and the reason is preserved', () => {
    const endedState = run([...toActive, { type: 'END', reason: 'owner_ended' }]);
    const events: SessionEvent[] = [
      { type: 'JOIN' },
      { type: 'PEER_HELLO' },
      { type: 'NEGOTIATED' },
      { type: 'DISCONNECT' },
      { type: 'RECONNECTED' },
      { type: 'RECONNECT_TIMEOUT' },
      { type: 'END', reason: 'failed' },
      { type: 'WINDOW_BOUNDARY' },
      { type: 'MAX_DURATION' },
    ];
    for (const event of events) {
      const next = sessionReducer(endedState, event);
      expect(next).toBe(endedState); // same reference — pure no-op
      expect(next.endReason).toBe('owner_ended');
    }
  });

  it('does not mutate the input state (pure reducer)', () => {
    const active = run(toActive);
    const frozen = Object.freeze({ ...active });
    const next = sessionReducer(frozen, { type: 'DISCONNECT', at: 42 });
    expect(next).not.toBe(frozen);
    expect(frozen.status).toBe('active');
    expect(next.status).toBe('reconnecting');
  });
});
