import { describe, expect, it } from 'vitest';
import type { Window } from './availability.ts';
import {
  DEVICE_OFFLINE_THRESHOLD_SECONDS,
  MAX_SESSION_MINUTES,
  PAIRING_CODE_TTL_MINUTES,
  computeScheduledEnd,
  decideRequestSession,
  decideRespondSession,
  isLiveSessionStatus,
  planOfflineDevices,
  planScheduledStarts,
  planSessionEnds,
  type PetSchedule,
  type TickConnection,
  type TickDevice,
  type TickSession,
} from './sessionRules.ts';

// Fixture facts (verified against Intl; same anchors as the core-lib tests):
// 2026-07-01T08:00Z = Wed 08:00 UTC = Wed 17:00 Asia/Tokyo = Wed 09:00 Europe/London (BST)
const NOW = new Date('2026-07-01T08:00:00Z');
const WED = 3;

function schedule(tz: string, ...windows: Window[]): PetSchedule {
  return { timezone: tz, windows };
}

function win(weekday: number, startMinute: number, endMinute: number): Window {
  return { weekday, startMinute, endMinute };
}

// Wed 09:00–18:00 London — NOW (09:00 local) is inside; ends 17:00Z.
const LONDON_9_18 = schedule('Europe/London', win(WED, 540, 1080));
// Wed 09:00–18:00 Tokyo — NOW (17:00 local) is inside; ends 09:00Z.
const TOKYO_9_18 = schedule('Asia/Tokyo', win(WED, 540, 1080));
// Wed 17:00–17:30 Tokyo — NOW is inside; ends 17:30 local = 08:30Z.
const TOKYO_17_1730 = schedule('Asia/Tokyo', win(WED, 1020, 1050));
// Wed 09:00–10:00 Tokyo — NOW (17:00 local) is OUTSIDE.
const TOKYO_MORNING = schedule('Asia/Tokyo', win(WED, 540, 600));
const NO_WINDOWS = schedule('UTC');

describe('constants', () => {
  it('match the contract defaults', () => {
    expect(MAX_SESSION_MINUTES).toBe(60);
    expect(PAIRING_CODE_TTL_MINUTES).toBe(10);
    expect(DEVICE_OFFLINE_THRESHOLD_SECONDS).toBe(90);
  });

  it('isLiveSessionStatus covers exactly the live statuses', () => {
    expect(isLiveSessionStatus('pending_approval')).toBe(true);
    expect(isLiveSessionStatus('connecting')).toBe(true);
    expect(isLiveSessionStatus('active')).toBe(true);
    expect(isLiveSessionStatus('ended')).toBe(false);
    expect(isLiveSessionStatus('failed')).toBe(false);
  });
});

describe('computeScheduledEnd', () => {
  it('defaults to now + max duration when no boundary is earlier', () => {
    expect(computeScheduledEnd(NOW, [null, new Date('2026-07-01T12:00:00Z')])).toEqual(
      new Date('2026-07-01T09:00:00Z'),
    );
  });

  it('uses the earliest boundary when it precedes the cap', () => {
    const soon = new Date('2026-07-01T08:20:00Z');
    expect(computeScheduledEnd(NOW, [new Date('2026-07-01T08:40:00Z'), soon])).toEqual(soon);
  });
});

describe('decideRequestSession', () => {
  it('rejects when the connection is not active', () => {
    for (const status of ['pending', 'paused', 'blocked']) {
      const d = decideRequestSession({
        connectionStatus: status,
        requester: TOKYO_9_18,
        partner: LONDON_9_18,
        now: NOW,
      });
      expect(d).toEqual({ kind: 'reject', reason: 'connection_not_active' });
    }
  });

  it('partner in-window -> connecting, capped at max duration', () => {
    const d = decideRequestSession({
      connectionStatus: 'active',
      requester: NO_WINDOWS, // owner override: requester pet out of window
      partner: LONDON_9_18, // in window until 17:00Z
      now: NOW,
    });
    expect(d.kind).toBe('start');
    if (d.kind !== 'start') throw new Error('unreachable');
    expect(d.sessionStatus).toBe('connecting');
    expect(d.initiatedBy).toBe('owner_trigger');
    // Partner window runs to 17:00Z; the 60-minute cap ends first.
    expect(d.scheduledEndAt).toEqual(new Date('2026-07-01T09:00:00Z'));
  });

  it('partner in-window -> connecting, capped at the partner window boundary', () => {
    const d = decideRequestSession({
      connectionStatus: 'active',
      requester: NO_WINDOWS,
      // Wed 09:00–09:30 London: in window at NOW, ends 09:30 local = 08:30Z.
      partner: schedule('Europe/London', win(WED, 540, 570)),
      now: NOW,
    });
    expect(d.kind).toBe('start');
    if (d.kind !== 'start') throw new Error('unreachable');
    expect(d.scheduledEndAt).toEqual(new Date('2026-07-01T08:30:00Z'));
  });

  it('when the requester is also in-window, its earlier boundary caps the session', () => {
    const d = decideRequestSession({
      connectionStatus: 'active',
      requester: TOKYO_17_1730, // ends 17:30 Tokyo = 08:30Z
      partner: LONDON_9_18, // ends 17:00Z
      now: NOW,
    });
    expect(d.kind).toBe('start');
    if (d.kind !== 'start') throw new Error('unreachable');
    expect(d.scheduledEndAt).toEqual(new Date('2026-07-01T08:30:00Z'));
  });

  it('partner out-of-window -> pending_approval, even when the requester is in-window', () => {
    const d = decideRequestSession({
      connectionStatus: 'active',
      requester: LONDON_9_18,
      partner: TOKYO_MORNING, // 17:00 local, morning window long over
      now: NOW,
    });
    expect(d).toEqual({
      kind: 'await_approval',
      sessionStatus: 'pending_approval',
      initiatedBy: 'owner_trigger',
    });
  });

  it('partner with no windows at all -> pending_approval', () => {
    const d = decideRequestSession({
      connectionStatus: 'active',
      requester: LONDON_9_18,
      partner: NO_WINDOWS,
      now: NOW,
    });
    expect(d.kind).toBe('await_approval');
  });
});

describe('decideRespondSession', () => {
  const base = {
    sessionStatus: 'pending_approval',
    connectionStatus: 'active',
    callerIsRequester: false,
    now: NOW,
  };

  it('rejects when the session is not pending_approval', () => {
    for (const status of ['connecting', 'active', 'ended', 'failed']) {
      expect(
        decideRespondSession({ ...base, sessionStatus: status, approve: true }),
      ).toEqual({ kind: 'reject', reason: 'session_not_pending' });
    }
  });

  it('rejects the requesting owner responding to their own request (approve AND decline)', () => {
    for (const approve of [true, false]) {
      expect(
        decideRespondSession({ ...base, callerIsRequester: true, approve }),
      ).toEqual({ kind: 'reject', reason: 'requester_cannot_respond' });
    }
  });

  it('rejects approval when the connection is no longer active (paused/blocked/pending)', () => {
    for (const connectionStatus of ['paused', 'blocked', 'pending']) {
      expect(
        decideRespondSession({ ...base, connectionStatus, approve: true }),
      ).toEqual({ kind: 'reject', reason: 'connection_not_active' });
    }
  });

  it('still allows the partner to DECLINE on a non-active connection', () => {
    expect(
      decideRespondSession({ ...base, connectionStatus: 'paused', approve: false }),
    ).toEqual({ kind: 'decline', sessionStatus: 'ended', endReason: 'partner_declined' });
  });

  it('approve -> connecting with a max-duration hard stop from now', () => {
    const d = decideRespondSession({ ...base, approve: true });
    expect(d.kind).toBe('start');
    if (d.kind !== 'start') throw new Error('unreachable');
    expect(d.sessionStatus).toBe('connecting');
    expect(d.scheduledEndAt).toEqual(new Date('2026-07-01T09:00:00Z'));
  });

  it('honours a custom max duration', () => {
    const d = decideRespondSession({ ...base, approve: true, maxSessionMinutes: 15 });
    if (d.kind !== 'start') throw new Error('expected start');
    expect(d.scheduledEndAt).toEqual(new Date('2026-07-01T08:15:00Z'));
  });

  it('decline -> ended with partner_declined', () => {
    expect(decideRespondSession({ ...base, approve: false })).toEqual({
      kind: 'decline',
      sessionStatus: 'ended',
      endReason: 'partner_declined',
    });
  });
});

describe('planScheduledStarts (schedule-tick)', () => {
  function conn(
    id: string,
    petA: PetSchedule,
    petB: PetSchedule,
    hasLiveSession = false,
  ): TickConnection {
    return { connectionId: id, petA, petB, hasLiveSession };
  }

  it('starts a session when both pets are in-window now', () => {
    const starts = planScheduledStarts([conn('c1', TOKYO_9_18, LONDON_9_18)], NOW);
    expect(starts).toHaveLength(1);
    expect(starts[0]).toEqual({
      connectionId: 'c1',
      sessionStatus: 'connecting',
      initiatedBy: 'schedule',
      // Overlap ends at 09:00Z (Tokyo 18:00) = now + 60min: both caps agree.
      scheduledEndAt: new Date('2026-07-01T09:00:00Z'),
    });
  });

  it('caps scheduledEndAt at the earlier of the two pets\' window ends', () => {
    const starts = planScheduledStarts([conn('c1', TOKYO_17_1730, LONDON_9_18)], NOW);
    expect(starts).toHaveLength(1);
    expect(starts[0]?.scheduledEndAt).toEqual(new Date('2026-07-01T08:30:00Z')); // 17:30 Tokyo
  });

  it('caps scheduledEndAt at max duration inside a long overlap', () => {
    const allDayA = schedule('UTC', win(WED, 0, 1440));
    const allDayB = schedule('Europe/London', win(WED, 0, 1440));
    const starts = planScheduledStarts([conn('c1', allDayA, allDayB)], NOW);
    expect(starts[0]?.scheduledEndAt).toEqual(new Date('2026-07-01T09:00:00Z'));
  });

  it('skips connections with no overlap right now', () => {
    expect(planScheduledStarts([conn('c1', TOKYO_MORNING, LONDON_9_18)], NOW)).toEqual([]);
  });

  it('skips connections that already have a live session', () => {
    expect(planScheduledStarts([conn('c1', TOKYO_9_18, LONDON_9_18, true)], NOW)).toEqual([]);
  });

  it('handles a mixed batch independently', () => {
    const starts = planScheduledStarts(
      [
        conn('busy', TOKYO_9_18, LONDON_9_18, true),
        conn('go', TOKYO_9_18, LONDON_9_18),
        conn('closed', TOKYO_MORNING, LONDON_9_18),
      ],
      NOW,
    );
    expect(starts.map((s) => s.connectionId)).toEqual(['go']);
  });
});

describe('planSessionEnds (schedule-tick)', () => {
  function sess(
    id: string,
    status: string,
    startedAt: string | null,
    scheduledEndAt: string | null,
  ): TickSession {
    return {
      sessionId: id,
      status,
      startedAt: startedAt ? new Date(startedAt) : null,
      scheduledEndAt: scheduledEndAt ? new Date(scheduledEndAt) : null,
    };
  }

  it('ends an active session past its window-boundary stop with window_boundary', () => {
    const ends = planSessionEnds(
      [sess('s1', 'active', '2026-07-01T07:30:00Z', '2026-07-01T07:55:00Z')],
      NOW,
    );
    expect(ends).toEqual([
      { sessionId: 's1', sessionStatus: 'ended', endReason: 'window_boundary' },
    ]);
  });

  it('ends a session that ran the full max duration with max_duration', () => {
    const ends = planSessionEnds(
      [sess('s1', 'active', '2026-07-01T06:55:00Z', '2026-07-01T07:55:00Z')],
      NOW,
    );
    expect(ends).toEqual([
      { sessionId: 's1', sessionStatus: 'ended', endReason: 'max_duration' },
    ]);
  });

  it('ends a session exactly at scheduled_end_at (inclusive boundary)', () => {
    const ends = planSessionEnds(
      [sess('s1', 'connecting', '2026-07-01T07:45:00Z', '2026-07-01T08:00:00Z')],
      NOW,
    );
    expect(ends).toHaveLength(1);
  });

  it('leaves sessions before their scheduled end alone', () => {
    expect(
      planSessionEnds(
        [sess('s1', 'active', '2026-07-01T07:50:00Z', '2026-07-01T08:00:01Z')],
        NOW,
      ),
    ).toEqual([]);
  });

  it('ignores non-live statuses and sessions without a scheduled end', () => {
    expect(
      planSessionEnds(
        [
          sess('pending', 'pending_approval', null, '2026-07-01T07:00:00Z'),
          sess('done', 'ended', '2026-07-01T06:00:00Z', '2026-07-01T07:00:00Z'),
          sess('failed', 'failed', null, '2026-07-01T07:00:00Z'),
          sess('open-ended', 'active', '2026-07-01T07:00:00Z', null),
        ],
        NOW,
      ),
    ).toEqual([]);
  });

  it('falls back to window_boundary when started_at is missing', () => {
    const ends = planSessionEnds([sess('s1', 'connecting', null, '2026-07-01T07:00:00Z')], NOW);
    expect(ends[0]?.endReason).toBe('window_boundary');
  });
});

describe('planOfflineDevices (schedule-tick)', () => {
  function dev(id: string, isOnline: boolean, lastSeenSecondsAgo: number | null): TickDevice {
    return {
      deviceId: id,
      isOnline,
      lastSeenAt:
        lastSeenSecondsAgo === null
          ? null
          : new Date(NOW.getTime() - lastSeenSecondsAgo * 1000),
    };
  }

  it('marks devices silent for more than 90s offline', () => {
    expect(planOfflineDevices([dev('d1', true, 91)], NOW)).toEqual(['d1']);
  });

  it('keeps devices seen within the threshold (90s exactly is still fine)', () => {
    expect(planOfflineDevices([dev('d1', true, 89), dev('d2', true, 90)], NOW)).toEqual([]);
  });

  it('marks online devices that have never been seen', () => {
    expect(planOfflineDevices([dev('d1', true, null)], NOW)).toEqual(['d1']);
  });

  it('never re-flags devices already offline', () => {
    expect(planOfflineDevices([dev('d1', false, 10_000), dev('d2', false, null)], NOW)).toEqual(
      [],
    );
  });

  it('honours a custom threshold', () => {
    expect(planOfflineDevices([dev('d1', true, 40)], NOW, 30)).toEqual(['d1']);
    expect(planOfflineDevices([dev('d1', true, 40)], NOW, 60)).toEqual([]);
  });
});
