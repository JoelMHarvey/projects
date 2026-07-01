import { describe, expect, it } from 'vitest';
import type { Window } from '../core/availability';
import { filterMatches, schedulesEverOverlap, windowFromRow } from './matching';
import type { PetRow } from './types';

// Weekday convention: 0=Sunday .. 6=Saturday.
const MON_TO_FRI_9_18: Window[] = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startMinute: 9 * 60,
  endMinute: 18 * 60,
}));

// A Sunday — start of a representative week (fixture from core availability
// tests: 2026-07-01T08:00Z is Wed 17:00 Tokyo / Wed 09:00 London BST).
const REFERENCE = new Date('2026-06-28T00:00:00Z');

function makePet(overrides: Partial<PetRow> & Pick<PetRow, 'id' | 'owner_id'>): PetRow {
  return {
    name: 'Bird',
    species: 'bird',
    photo_url: null,
    personality_tags: null,
    timezone: 'UTC',
    created_at: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

describe('windowFromRow', () => {
  it('maps snake_case row fields to the core Window shape', () => {
    expect(
      windowFromRow({ weekday: 3, start_minute: 540, end_minute: 1080 }),
    ).toEqual({ weekday: 3, startMinute: 540, endMinute: 1080 });
  });
});

describe('schedulesEverOverlap', () => {
  it('detects identical schedules in the same timezone', () => {
    expect(
      schedulesEverOverlap(MON_TO_FRI_9_18, 'UTC', MON_TO_FRI_9_18, 'UTC', REFERENCE),
    ).toBe(true);
  });

  it('detects a cross-timezone overlap (Tokyo 9-18 vs London 9-18)', () => {
    // Tokyo Mon-Fri 09:00-18:00 = 00:00-09:00 UTC; London (BST) = 08:00-17:00
    // UTC — they share 08:00-09:00 UTC on weekdays.
    expect(
      schedulesEverOverlap(
        MON_TO_FRI_9_18,
        'Asia/Tokyo',
        MON_TO_FRI_9_18,
        'Europe/London',
        REFERENCE,
      ),
    ).toBe(true);
  });

  it('is false for adjacent, non-overlapping windows (half-open bounds)', () => {
    const a: Window[] = [{ weekday: 1, startMinute: 540, endMinute: 600 }];
    const b: Window[] = [{ weekday: 1, startMinute: 600, endMinute: 660 }];
    expect(schedulesEverOverlap(a, 'UTC', b, 'UTC', REFERENCE)).toBe(false);
  });

  it('is false for windows on different weekdays', () => {
    const a: Window[] = [{ weekday: 1, startMinute: 540, endMinute: 1080 }];
    const b: Window[] = [{ weekday: 2, startMinute: 540, endMinute: 1080 }];
    expect(schedulesEverOverlap(a, 'UTC', b, 'UTC', REFERENCE)).toBe(false);
  });

  it('finds a short 5-minute overlap at the default sampling step', () => {
    const a: Window[] = [{ weekday: 1, startMinute: 540, endMinute: 600 }];
    const b: Window[] = [{ weekday: 1, startMinute: 595, endMinute: 700 }];
    expect(schedulesEverOverlap(a, 'UTC', b, 'UTC', REFERENCE)).toBe(true);
  });

  it('is false when either pet has no windows', () => {
    expect(
      schedulesEverOverlap([], 'UTC', MON_TO_FRI_9_18, 'UTC', REFERENCE),
    ).toBe(false);
    expect(
      schedulesEverOverlap(MON_TO_FRI_9_18, 'UTC', [], 'UTC', REFERENCE),
    ).toBe(false);
  });
});

describe('filterMatches', () => {
  const myPet = makePet({ id: 'pet-me', owner_id: 'owner-me' });

  it('keeps same-species pets with overlapping schedules only', () => {
    const goodBird = makePet({ id: 'pet-good', owner_id: 'owner-2' });
    const wrongSpecies = makePet({
      id: 'pet-cat',
      owner_id: 'owner-3',
      species: 'cat',
    });
    const noOverlap = makePet({ id: 'pet-night', owner_id: 'owner-4' });
    const nightWindows: Window[] = [{ weekday: 6, startMinute: 0, endMinute: 60 }];

    const result = filterMatches({
      myPet,
      myWindows: MON_TO_FRI_9_18,
      candidates: [
        { pet: goodBird, windows: MON_TO_FRI_9_18 },
        { pet: wrongSpecies, windows: MON_TO_FRI_9_18 },
        { pet: noOverlap, windows: nightWindows },
      ],
      now: REFERENCE,
    });
    expect(result.map((m) => m.pet.id)).toEqual(['pet-good']);
  });

  it('excludes my own pets and pets of the same owner', () => {
    const siblingPet = makePet({ id: 'pet-sibling', owner_id: 'owner-me' });
    const result = filterMatches({
      myPet,
      myWindows: MON_TO_FRI_9_18,
      candidates: [
        { pet: myPet, windows: MON_TO_FRI_9_18 },
        { pet: siblingPet, windows: MON_TO_FRI_9_18 },
      ],
      now: REFERENCE,
    });
    expect(result).toEqual([]);
  });

  it('returns nothing when my pet has no availability', () => {
    const other = makePet({ id: 'pet-other', owner_id: 'owner-2' });
    const result = filterMatches({
      myPet,
      myWindows: [],
      candidates: [{ pet: other, windows: MON_TO_FRI_9_18 }],
      now: REFERENCE,
    });
    expect(result).toEqual([]);
  });
});
