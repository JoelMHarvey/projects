import { describe, expect, it } from 'vitest';
import {
  currentOverlapEnd,
  isWithinWindow,
  windowsOverlapNow,
  type Window,
} from './availability';

// Weekday convention: 0=Sunday .. 6=Saturday.
const MON_TO_FRI_9_18: Window[] = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startMinute: 9 * 60,
  endMinute: 18 * 60,
}));

// Fixture facts (verified against Intl):
// 2026-07-01T08:00Z = Wed 08:00 UTC = Wed 17:00 Asia/Tokyo = Wed 09:00 Europe/London (BST)
// 2026-06-27T23:00Z = Sat 23:00 UTC = Sun 08:00 Asia/Tokyo
// Europe/London springs forward 2026-03-29 01:00 UTC (GMT→BST),
// falls back 2026-10-25 01:00 UTC (BST→GMT).

describe('isWithinWindow', () => {
  it('is true inside a plain weekday window in the local timezone', () => {
    // Wed 17:00 Tokyo — inside Wed 09:00–18:00.
    expect(
      isWithinWindow(new Date('2026-07-01T08:00:00Z'), MON_TO_FRI_9_18, 'Asia/Tokyo'),
    ).toBe(true);
    // Same instant is Wed 09:00 London — inclusive start bound.
    expect(
      isWithinWindow(new Date('2026-07-01T08:00:00Z'), MON_TO_FRI_9_18, 'Europe/London'),
    ).toBe(true);
  });

  it('treats the end bound as exclusive and the start bound as inclusive', () => {
    // Wed 18:00 Tokyo sharp — window over.
    expect(
      isWithinWindow(new Date('2026-07-01T09:00:00Z'), MON_TO_FRI_9_18, 'Asia/Tokyo'),
    ).toBe(false);
    // Wed 17:59 Tokyo — still in.
    expect(
      isWithinWindow(new Date('2026-07-01T08:59:00Z'), MON_TO_FRI_9_18, 'Asia/Tokyo'),
    ).toBe(true);
    // Wed 09:00 Tokyo sharp — just started.
    expect(
      isWithinWindow(new Date('2026-07-01T00:00:00Z'), MON_TO_FRI_9_18, 'Asia/Tokyo'),
    ).toBe(true);
    expect(
      isWithinWindow(new Date('2026-06-30T23:59:00Z'), MON_TO_FRI_9_18, 'Asia/Tokyo'),
    ).toBe(false);
  });

  it('handles weekday rollover across timezones (Sat UTC is already Sun in Tokyo)', () => {
    const sundayMorning: Window[] = [{ weekday: 0, startMinute: 7 * 60, endMinute: 10 * 60 }];
    const now = new Date('2026-06-27T23:00:00Z'); // Sat UTC, Sun 08:00 Tokyo
    expect(isWithinWindow(now, sundayMorning, 'Asia/Tokyo')).toBe(true);
    expect(isWithinWindow(now, sundayMorning, 'UTC')).toBe(false);
    expect(isWithinWindow(now, sundayMorning, 'Europe/London')).toBe(false);
  });

  it('handles midnight-adjacent windows split across two weekdays', () => {
    const lateNight: Window[] = [
      { weekday: 2, startMinute: 23 * 60, endMinute: 1440 }, // Tue 23:00–24:00
      { weekday: 3, startMinute: 0, endMinute: 2 * 60 }, // Wed 00:00–02:00
    ];
    // Tue 23:30 Tokyo = 2026-06-30T14:30Z
    expect(isWithinWindow(new Date('2026-06-30T14:30:00Z'), lateNight, 'Asia/Tokyo')).toBe(true);
    // Wed 00:30 Tokyo = 2026-06-30T15:30Z
    expect(isWithinWindow(new Date('2026-06-30T15:30:00Z'), lateNight, 'Asia/Tokyo')).toBe(true);
    // Wed 02:00 Tokyo sharp = 2026-06-30T17:00Z — outside (exclusive end).
    expect(isWithinWindow(new Date('2026-06-30T17:00:00Z'), lateNight, 'Asia/Tokyo')).toBe(false);
    // Tue 22:59 Tokyo — before it starts.
    expect(isWithinWindow(new Date('2026-06-30T13:59:00Z'), lateNight, 'Asia/Tokyo')).toBe(false);
  });

  it('respects DST: London spring-forward skips 01:00–02:00 local', () => {
    const earlySunday: Window[] = [{ weekday: 0, startMinute: 0, endMinute: 3 * 60 }];
    // 2026-03-29T00:30Z is Sun 00:30 GMT — in window.
    expect(isWithinWindow(new Date('2026-03-29T00:30:00Z'), earlySunday, 'Europe/London')).toBe(
      true,
    );
    // 2026-03-29T01:30Z is Sun 02:30 BST (01:xx never happens) — still in window.
    expect(isWithinWindow(new Date('2026-03-29T01:30:00Z'), earlySunday, 'Europe/London')).toBe(
      true,
    );
    // 2026-03-29T02:00Z is Sun 03:00 BST — window over.
    expect(isWithinWindow(new Date('2026-03-29T02:00:00Z'), earlySunday, 'Europe/London')).toBe(
      false,
    );
  });

  it('respects DST: London fall-back repeats 01:00–02:00 local', () => {
    const w: Window[] = [{ weekday: 0, startMinute: 60, endMinute: 120 }]; // Sun 01:00–02:00
    // 2026-10-25T00:30Z = Sun 01:30 BST (first pass) — in.
    expect(isWithinWindow(new Date('2026-10-25T00:30:00Z'), w, 'Europe/London')).toBe(true);
    // 2026-10-25T01:30Z = Sun 01:30 GMT (second pass) — in again.
    expect(isWithinWindow(new Date('2026-10-25T01:30:00Z'), w, 'Europe/London')).toBe(true);
    // 2026-10-25T02:30Z = Sun 02:30 GMT — out.
    expect(isWithinWindow(new Date('2026-10-25T02:30:00Z'), w, 'Europe/London')).toBe(false);
  });

  it('returns false for an empty window list', () => {
    expect(isWithinWindow(new Date('2026-07-01T08:00:00Z'), [], 'Asia/Tokyo')).toBe(false);
  });
});

describe('windowsOverlapNow', () => {
  it('is true only when BOTH pets are inside their own local windows', () => {
    const tokyo = MON_TO_FRI_9_18;
    const london = MON_TO_FRI_9_18;
    // Wed 08:00 UTC → Tokyo 17:00 (in), London 09:00 (in).
    expect(
      windowsOverlapNow(tokyo, 'Asia/Tokyo', london, 'Europe/London', new Date('2026-07-01T08:00:00Z')),
    ).toBe(true);
    // Wed 09:00 UTC → Tokyo 18:00 (out, exclusive end), London 10:00 (in).
    expect(
      windowsOverlapNow(tokyo, 'Asia/Tokyo', london, 'Europe/London', new Date('2026-07-01T09:00:00Z')),
    ).toBe(false);
    // Wed 07:00 UTC → Tokyo 16:00 (in), London 08:00 (out).
    expect(
      windowsOverlapNow(tokyo, 'Asia/Tokyo', london, 'Europe/London', new Date('2026-07-01T07:00:00Z')),
    ).toBe(false);
  });

  it('is symmetric in its arguments', () => {
    const now = new Date('2026-07-01T08:00:00Z');
    expect(
      windowsOverlapNow(MON_TO_FRI_9_18, 'Asia/Tokyo', MON_TO_FRI_9_18, 'Europe/London', now),
    ).toBe(
      windowsOverlapNow(MON_TO_FRI_9_18, 'Europe/London', MON_TO_FRI_9_18, 'Asia/Tokyo', now),
    );
  });

  it('handles the case where the two pets are on different local weekdays', () => {
    // Sat 22:30 UTC: Tokyo already Sunday 07:30, London (BST) still Saturday 23:30.
    const tokyoSunday: Window[] = [{ weekday: 0, startMinute: 0, endMinute: 1440 }];
    const londonSaturday: Window[] = [{ weekday: 6, startMinute: 0, endMinute: 1440 }];
    const now = new Date('2026-06-27T22:30:00Z');
    expect(
      windowsOverlapNow(tokyoSunday, 'Asia/Tokyo', londonSaturday, 'Europe/London', now),
    ).toBe(true);
    // Half an hour later London ticks over to Sunday — its Saturday-only
    // schedule no longer matches, so the overlap is gone.
    expect(
      windowsOverlapNow(
        tokyoSunday,
        'Asia/Tokyo',
        londonSaturday,
        'Europe/London',
        new Date('2026-06-27T23:00:00Z'),
      ),
    ).toBe(false);
  });
});

describe('currentOverlapEnd', () => {
  it('returns null when the pets do not overlap now', () => {
    expect(
      currentOverlapEnd(
        MON_TO_FRI_9_18,
        'Asia/Tokyo',
        MON_TO_FRI_9_18,
        'Europe/London',
        new Date('2026-07-01T07:00:00Z'), // London not yet in window
      ),
    ).toBeNull();
  });

  it('returns the earlier of the two pets’ window ends as a UTC instant', () => {
    // Wed 08:00 UTC. Tokyo window ends 18:00 JST = 09:00 UTC.
    // London window ends 18:00 BST = 17:00 UTC. Overlap ends at the earlier.
    const end = currentOverlapEnd(
      MON_TO_FRI_9_18,
      'Asia/Tokyo',
      MON_TO_FRI_9_18,
      'Europe/London',
      new Date('2026-07-01T08:00:00Z'),
    );
    expect(end).toEqual(new Date('2026-07-01T09:00:00Z'));
  });

  it('picks the other pet when its end comes first', () => {
    const londonMorning: Window[] = [{ weekday: 3, startMinute: 9 * 60, endMinute: 10 * 60 }];
    const end = currentOverlapEnd(
      MON_TO_FRI_9_18,
      'Asia/Tokyo',
      londonMorning,
      'Europe/London',
      new Date('2026-07-01T08:00:00Z'),
    );
    // London window ends 10:00 BST = 09:00 UTC; Tokyo also ends 09:00 UTC — tie.
    expect(end).toEqual(new Date('2026-07-01T09:00:00Z'));

    const londonShort: Window[] = [{ weekday: 3, startMinute: 9 * 60, endMinute: 9 * 60 + 30 }];
    const end2 = currentOverlapEnd(
      MON_TO_FRI_9_18,
      'Asia/Tokyo',
      londonShort,
      'Europe/London',
      new Date('2026-07-01T08:00:00Z'),
    );
    // London ends 09:30 BST = 08:30 UTC — before Tokyo's 09:00 UTC.
    expect(end2).toEqual(new Date('2026-07-01T08:30:00Z'));
  });

  it('chains windows across midnight into the next weekday', () => {
    // Tokyo: Wed 09:00–24:00 then Thu 00:00–02:00 → contiguous, ends Thu 02:00 JST
    // = Wed 17:00 UTC.
    const tokyo: Window[] = [
      { weekday: 3, startMinute: 9 * 60, endMinute: 1440 },
      { weekday: 4, startMinute: 0, endMinute: 2 * 60 },
    ];
    // Partner in UTC: Wed 00:00–24:00 then Thu 00:00–24:00 → ends Fri 00:00 UTC.
    const partner: Window[] = [
      { weekday: 3, startMinute: 0, endMinute: 1440 },
      { weekday: 4, startMinute: 0, endMinute: 1440 },
    ];
    const end = currentOverlapEnd(
      tokyo,
      'Asia/Tokyo',
      partner,
      'UTC',
      new Date('2026-07-01T08:00:00Z'), // Wed 17:00 JST — inside both
    );
    expect(end).toEqual(new Date('2026-07-01T17:00:00Z'));
  });

  it('chains back-to-back same-day windows', () => {
    // Tokyo: Wed 09:00–12:00 and Wed 12:00–15:00 → contiguous to 15:00 JST
    // = 06:00 UTC.
    const tokyo: Window[] = [
      { weekday: 3, startMinute: 9 * 60, endMinute: 12 * 60 },
      { weekday: 3, startMinute: 12 * 60, endMinute: 15 * 60 },
    ];
    const always: Window[] = [{ weekday: 3, startMinute: 0, endMinute: 1440 }];
    const end = currentOverlapEnd(
      tokyo,
      'Asia/Tokyo',
      always,
      'UTC',
      new Date('2026-07-01T01:00:00Z'), // Wed 10:00 JST
    );
    expect(end).toEqual(new Date('2026-07-01T06:00:00Z'));
  });

  it('terminates (capped) when windows cover the entire week', () => {
    const allWeek: Window[] = Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      startMinute: 0,
      endMinute: 1440,
    }));
    const now = new Date('2026-07-01T08:00:00Z');
    const end = currentOverlapEnd(allWeek, 'Asia/Tokyo', allWeek, 'UTC', now);
    expect(end).not.toBeNull();
    // Capped roughly one week out; must be strictly in the future.
    expect(end!.getTime()).toBeGreaterThan(now.getTime());
    expect(end!.getTime() - now.getTime()).toBeLessThanOrEqual(8 * 24 * 60 * 60 * 1000);
  });

  it('is DST-aware when the window end crosses a transition (London spring forward)', () => {
    // Sun 00:00–04:00 London on 2026-03-29: clocks jump 01:00→02:00 UTC-wise,
    // so local 04:00 BST is 03:00 UTC (only 3 real hours after midnight).
    const london: Window[] = [{ weekday: 0, startMinute: 0, endMinute: 4 * 60 }];
    const always: Window[] = Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      startMinute: 0,
      endMinute: 720, // stop chaining; partner out at 12:00 UTC — irrelevant here
    }));
    const end = currentOverlapEnd(
      london,
      'Europe/London',
      always,
      'UTC',
      new Date('2026-03-29T00:30:00Z'), // Sun 00:30 GMT
    );
    expect(end).toEqual(new Date('2026-03-29T03:00:00Z'));
  });

  it('is DST-aware across London fall-back (extra real hour)', () => {
    // Sun 00:00–03:00 London on 2026-10-25: clocks fall back at 02:00 BST →
    // 01:00 GMT, so local 03:00 GMT is 03:00 UTC (4 real hours after midnight BST).
    const london: Window[] = [{ weekday: 0, startMinute: 0, endMinute: 3 * 60 }];
    const utcAll: Window[] = [
      { weekday: 6, startMinute: 0, endMinute: 1440 },
      { weekday: 0, startMinute: 0, endMinute: 720 },
    ];
    const end = currentOverlapEnd(
      london,
      'Europe/London',
      utcAll,
      'UTC',
      new Date('2026-10-24T23:30:00Z'), // Sun 00:30 BST in London; Sat 23:30 UTC
    );
    expect(end).toEqual(new Date('2026-10-25T03:00:00Z'));
  });
});
