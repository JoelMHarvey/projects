/**
 * Pure match-filtering logic (species + schedule overlap) built on the core
 * availability library. No supabase, no React — unit-tested under Node.
 */

import { isWithinWindow, type Window } from '../core/availability';
import type { AvailabilityWindowRow, PetRow } from './types';

/** Map an `availability_windows` row to the core `Window` shape. */
export function windowFromRow(
  row: Pick<AvailabilityWindowRow, 'weekday' | 'start_minute' | 'end_minute'>,
): Window {
  return {
    weekday: row.weekday,
    startMinute: row.start_minute,
    endMinute: row.end_minute,
  };
}

const MINUTES_PER_WEEK = 7 * 24 * 60;

/**
 * Sampling resolution for weekly schedule-overlap detection. Overlaps shorter
 * than this may be missed — acceptable for matching (the availability editor
 * works in whole minutes but real schedules are hour-scale).
 */
export const DEFAULT_OVERLAP_STEP_MINUTES = 5;

/**
 * True when the two pets' weekly schedules (each local to its own timezone)
 * are ever simultaneously active during the 7 days starting at `reference`.
 * Weekly windows repeat, so any 7-day span is representative (up to DST
 * skew of an hour around transitions — irrelevant at matching granularity).
 */
export function schedulesEverOverlap(
  aWindows: Window[],
  aTz: string,
  bWindows: Window[],
  bTz: string,
  reference: Date,
  stepMinutes: number = DEFAULT_OVERLAP_STEP_MINUTES,
): boolean {
  if (aWindows.length === 0 || bWindows.length === 0) return false;
  if (stepMinutes <= 0) throw new Error('stepMinutes must be positive');
  const stepMs = stepMinutes * 60_000;
  const samples = Math.ceil(MINUTES_PER_WEEK / stepMinutes);
  for (let i = 0; i < samples; i++) {
    const t = new Date(reference.getTime() + i * stepMs);
    if (isWithinWindow(t, aWindows, aTz) && isWithinWindow(t, bWindows, bTz)) {
      return true;
    }
  }
  return false;
}

export interface MatchCandidate {
  pet: PetRow;
  windows: Window[];
}

export interface FilterMatchesInput {
  myPet: Pick<PetRow, 'id' | 'owner_id' | 'species' | 'timezone'>;
  myWindows: Window[];
  candidates: MatchCandidate[];
  /** Start of the representative week; defaults to now. */
  now?: Date;
  stepMinutes?: number;
}

/**
 * P0 matching: same species, different owner, weekly schedules overlap.
 * (No ML — a plain filter per spec §7.)
 */
export function filterMatches(input: FilterMatchesInput): MatchCandidate[] {
  const { myPet, myWindows, candidates } = input;
  const now = input.now ?? new Date();
  if (myWindows.length === 0) return [];
  return candidates.filter(
    (c) =>
      c.pet.id !== myPet.id &&
      c.pet.owner_id !== myPet.owner_id &&
      c.pet.species === myPet.species &&
      schedulesEverOverlap(
        myWindows,
        myPet.timezone,
        c.windows,
        c.pet.timezone,
        now,
        input.stepMinutes,
      ),
  );
}
