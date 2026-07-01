/**
 * Pure HH:MM <-> minutes-past-midnight helpers for the availability editor.
 * Minutes match the `availability_windows` columns: start 0..1439, end 1..1440
 * ("24:00" is a valid END meaning local midnight, exclusive).
 */

export const WEEKDAY_LABELS: readonly string[] = [
  'Sun',
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
];

const HHMM_RE = /^(\d{1,2}):(\d{2})$/;

/**
 * Parse "H:MM"/"HH:MM" to minutes past midnight, or null when malformed.
 * Accepts 00:00..23:59, plus "24:00" (=1440) for window ends.
 */
export function parseHHMM(text: string): number | null {
  const match = HHMM_RE.exec(text.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (minutes > 59) return null;
  if (hours === 24) return minutes === 0 ? 1440 : null;
  if (hours > 23) return null;
  return hours * 60 + minutes;
}

/** Format minutes past midnight (0..1440) as "HH:MM"; 1440 → "24:00". */
export function formatHHMM(totalMinutes: number): string {
  if (
    !Number.isInteger(totalMinutes) ||
    totalMinutes < 0 ||
    totalMinutes > 1440
  ) {
    throw new Error(`formatHHMM: out-of-range minutes ${totalMinutes}`);
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}`;
}

export interface ParsedWindowTimes {
  startMinute: number;
  endMinute: number;
}

/**
 * Validate an editor row: both times parse, start is a valid start
 * (0..1439), end a valid end (1..1440), and start < end.
 */
export function parseWindowTimes(
  startText: string,
  endText: string,
): ParsedWindowTimes | null {
  const startMinute = parseHHMM(startText);
  const endMinute = parseHHMM(endText);
  if (startMinute === null || endMinute === null) return null;
  if (startMinute > 1439) return null;
  if (endMinute < 1) return null;
  if (startMinute >= endMinute) return null;
  return { startMinute, endMinute };
}
