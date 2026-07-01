/**
 * Timezone-correct availability window math.
 *
 * Windows are weekly recurring, expressed in minutes LOCAL to the pet's
 * timezone (matching the `availability_windows` table: weekday 0=Sunday..6,
 * startMinute 0..1439, endMinute 1..1440, startMinute < endMinute).
 *
 * A window covers the half-open local interval [startMinute, endMinute).
 * Windows that touch midnight chain: a window ending at 1440 followed by a
 * window starting at 0 on the next weekday is treated as one contiguous
 * availability period (likewise back-to-back windows on the same day).
 *
 * All timezone math goes through Intl.DateTimeFormat — no dependencies.
 *
 * MIRROR: this file is a copy of app/src/core/availability.ts (CONTRACTS.md
 * forbids cross-package imports between app/ and supabase/). Keep the two in
 * sync by copying, never by importing.
 */

export interface Window {
  /** 0 = Sunday … 6 = Saturday (matches Postgres CHECK). */
  weekday: number;
  /** Minutes from local midnight, 0..1439 inclusive. */
  startMinute: number;
  /** Minutes from local midnight, 1..1440 inclusive; exclusive bound. */
  endMinute: number;
}

const MINUTES_PER_DAY = 1440;

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

interface ZonedInstant {
  weekday: number;
  minute: number;
  year: number;
  month: number; // 1..12
  day: number; // 1..31
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(tz: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(tz, fmt);
  }
  return fmt;
}

/** Local wall-clock components of `instant` in timezone `tz`. */
function toZoned(instant: Date, tz: string): ZonedInstant {
  const parts = getFormatter(tz).formatToParts(instant);
  let weekdayName = '';
  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;
  for (const part of parts) {
    switch (part.type) {
      case 'weekday':
        weekdayName = part.value;
        break;
      case 'year':
        year = Number(part.value);
        break;
      case 'month':
        month = Number(part.value);
        break;
      case 'day':
        day = Number(part.value);
        break;
      case 'hour':
        hour = Number(part.value);
        break;
      case 'minute':
        minute = Number(part.value);
        break;
    }
  }
  const weekday = WEEKDAY_INDEX[weekdayName];
  if (weekday === undefined) {
    throw new Error(`Unrecognised weekday "${weekdayName}" for timezone "${tz}"`);
  }
  return { weekday, minute: hour * 60 + minute, year, month, day };
}

/**
 * UTC offset (ms) of `tz` at `instant`: positive when local time is ahead of
 * UTC (e.g. Asia/Tokyo → +9h).
 */
function tzOffsetMs(instant: Date, tz: string): number {
  const parts = getFormatter(tz).formatToParts(instant);
  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;
  let second = 0;
  for (const part of parts) {
    switch (part.type) {
      case 'year':
        year = Number(part.value);
        break;
      case 'month':
        month = Number(part.value);
        break;
      case 'day':
        day = Number(part.value);
        break;
      case 'hour':
        hour = Number(part.value);
        break;
      case 'minute':
        minute = Number(part.value);
        break;
      case 'second':
        second = Number(part.value);
        break;
    }
  }
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  // Drop sub-second precision from the instant; the formatter only gives us
  // second granularity.
  const truncated = Math.floor(instant.getTime() / 1000) * 1000;
  return asUtc - truncated;
}

/**
 * Convert a local wall time (year/month/day + minutes past midnight in `tz`)
 * to a UTC instant. `minutes` may exceed 1439 (spills into following days).
 *
 * Uses the standard two-pass offset iteration so DST transitions between the
 * guess and the target resolve correctly. For wall times that do not exist
 * (spring-forward gap) the result is the corresponding instant after the gap.
 */
function wallTimeToInstant(
  year: number,
  month: number,
  day: number,
  minutes: number,
  tz: string,
): Date {
  const wallAsUtc = Date.UTC(year, month - 1, day, 0, minutes);
  let guess = wallAsUtc - tzOffsetMs(new Date(wallAsUtc), tz);
  // Second pass: the offset at the guessed instant may differ from the offset
  // at the initial guess when a DST transition sits between them.
  guess = wallAsUtc - tzOffsetMs(new Date(guess), tz);
  return new Date(guess);
}

function isMinuteInWindow(weekday: number, minute: number, w: Window): boolean {
  return w.weekday === weekday && minute >= w.startMinute && minute < w.endMinute;
}

function findCurrentWindow(
  weekday: number,
  minute: number,
  windows: Window[],
): Window | null {
  for (const w of windows) {
    if (isMinuteInWindow(weekday, minute, w)) return w;
  }
  return null;
}

/**
 * True when `now`, interpreted in timezone `tz`, falls inside any of the
 * given weekly windows. Bounds are [start, end): a 09:00–18:00 window is
 * active at 09:00 sharp and inactive at 18:00 sharp.
 */
export function isWithinWindow(now: Date, windows: Window[], tz: string): boolean {
  const z = toZoned(now, tz);
  return findCurrentWindow(z.weekday, z.minute, windows) !== null;
}

/**
 * True when both pets are inside one of their own windows at instant `now`
 * (each evaluated in its own timezone) — i.e. their availability overlaps
 * right now.
 */
export function windowsOverlapNow(
  a: Window[],
  aTz: string,
  b: Window[],
  bTz: string,
  now: Date,
): boolean {
  return isWithinWindow(now, a, aTz) && isWithinWindow(now, b, bTz);
}

/**
 * End (local minutes from the current local midnight, may exceed 1440) of the
 * contiguous availability period containing (weekday, minute). Chains
 * same-day back-to-back windows and midnight-crossing continuations onto the
 * following weekday(s). Capped at 7 days to terminate on always-available
 * schedules.
 */
function contiguousEndMinutes(
  weekday: number,
  minute: number,
  windows: Window[],
): number | null {
  const current = findCurrentWindow(weekday, minute, windows);
  if (!current) return null;

  let dayOffset = 0;
  let endMinute = current.endMinute;

  // Chain at most a week's worth of continuations.
  for (let i = 0; i < 7 * windows.length + 7; i++) {
    if (dayOffset >= 7) break; // full-week coverage — cap at one week out
    let extended = false;
    if (endMinute >= MINUTES_PER_DAY) {
      // Continue on the next weekday at local midnight.
      const nextWeekday = (weekday + dayOffset + 1) % 7;
      for (const w of windows) {
        if (w.weekday === nextWeekday && w.startMinute === 0) {
          dayOffset += 1;
          endMinute = w.endMinute;
          extended = true;
          break;
        }
      }
    } else {
      // Same-day back-to-back window (e.g. 540–720 followed by 720–900).
      const thisWeekday = (weekday + dayOffset) % 7;
      for (const w of windows) {
        if (w.weekday === thisWeekday && w.startMinute === endMinute) {
          endMinute = w.endMinute;
          extended = true;
          break;
        }
      }
    }
    if (!extended) break;
  }

  return dayOffset * MINUTES_PER_DAY + endMinute;
}

/**
 * If both pets' windows overlap at `now`, returns the UTC instant at which
 * the current overlap ends — the earlier of the two pets' contiguous window
 * ends, each converted from its local wall time (DST-aware). Returns null if
 * the pets do not overlap at `now`.
 */
export function currentOverlapEnd(
  a: Window[],
  aTz: string,
  b: Window[],
  bTz: string,
  now: Date,
): Date | null {
  const za = toZoned(now, aTz);
  const zb = toZoned(now, bTz);
  const endA = contiguousEndMinutes(za.weekday, za.minute, a);
  const endB = contiguousEndMinutes(zb.weekday, zb.minute, b);
  if (endA === null || endB === null) return null;

  const instantA = wallTimeToInstant(za.year, za.month, za.day, endA, aTz);
  const instantB = wallTimeToInstant(zb.year, zb.month, zb.day, endB, bTz);
  return instantA.getTime() <= instantB.getTime() ? instantA : instantB;
}
