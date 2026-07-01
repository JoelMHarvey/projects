/**
 * Sanity tests for the _shared mirror of app/src/core/availability.ts.
 * The exhaustive DST/chaining suite lives next to the core copy; these cases
 * pin the behaviours the edge functions depend on so a drifted copy fails.
 */
import { describe, expect, it } from 'vitest';
import {
  currentOverlapEnd,
  isWithinWindow,
  windowsOverlapNow,
  type Window,
} from './availability.ts';

// 2026-07-01T08:00Z = Wed 08:00 UTC = Wed 17:00 Asia/Tokyo = Wed 09:00 Europe/London (BST)
const NOW = new Date('2026-07-01T08:00:00Z');
const WED = 3;

const wed9to18: Window[] = [{ weekday: WED, startMinute: 540, endMinute: 1080 }];

describe('isWithinWindow (mirror)', () => {
  it('evaluates the instant in the given timezone', () => {
    expect(isWithinWindow(NOW, wed9to18, 'Europe/London')).toBe(true); // 09:00 local
    expect(isWithinWindow(NOW, wed9to18, 'Asia/Tokyo')).toBe(true); // 17:00 local
    expect(isWithinWindow(NOW, wed9to18, 'America/Los_Angeles')).toBe(false); // 01:00 local
  });

  it('treats bounds as [start, end)', () => {
    // 09:00 London sharp: inside a window starting at 540...
    expect(
      isWithinWindow(NOW, [{ weekday: WED, startMinute: 540, endMinute: 541 }], 'Europe/London'),
    ).toBe(true);
    // ...but outside a window ending at 540.
    expect(
      isWithinWindow(NOW, [{ weekday: WED, startMinute: 480, endMinute: 540 }], 'Europe/London'),
    ).toBe(false);
  });

  it('respects DST: London local time after the 2026-03-29 spring-forward', () => {
    // 2026-03-29T01:30Z = 02:30 BST (clocks jumped 01:00->02:00 local).
    const duringGapUtc = new Date('2026-03-29T01:30:00Z');
    const sundaySmallHours: Window[] = [{ weekday: 0, startMinute: 0, endMinute: 120 }];
    expect(isWithinWindow(duringGapUtc, sundaySmallHours, 'Europe/London')).toBe(false);
    expect(isWithinWindow(new Date('2026-03-29T00:30:00Z'), sundaySmallHours, 'Europe/London')).toBe(
      true, // 00:30 GMT, still pre-transition
    );
  });
});

describe('windowsOverlapNow (mirror)', () => {
  it('requires both pets in-window at the same instant', () => {
    expect(windowsOverlapNow(wed9to18, 'Asia/Tokyo', wed9to18, 'Europe/London', NOW)).toBe(true);
    expect(
      windowsOverlapNow(wed9to18, 'Asia/Tokyo', wed9to18, 'America/Los_Angeles', NOW),
    ).toBe(false);
  });
});

describe('currentOverlapEnd (mirror)', () => {
  it('returns the earlier window end as a UTC instant', () => {
    // Tokyo window ends 18:00 local = 09:00Z; London ends 18:00 local = 17:00Z.
    expect(currentOverlapEnd(wed9to18, 'Asia/Tokyo', wed9to18, 'Europe/London', NOW)).toEqual(
      new Date('2026-07-01T09:00:00Z'),
    );
  });

  it('returns null when there is no overlap now', () => {
    expect(
      currentOverlapEnd(wed9to18, 'Asia/Tokyo', wed9to18, 'America/Los_Angeles', NOW),
    ).toBeNull();
  });
});
