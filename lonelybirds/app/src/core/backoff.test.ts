import { describe, expect, it } from 'vitest';
import { nextBackoffMs } from './backoff';

describe('nextBackoffMs', () => {
  it('doubles from baseMs with the defaults (1s, 2s, 4s, ...)', () => {
    expect(nextBackoffMs(0)).toBe(1000);
    expect(nextBackoffMs(1)).toBe(2000);
    expect(nextBackoffMs(2)).toBe(4000);
    expect(nextBackoffMs(3)).toBe(8000);
    expect(nextBackoffMs(4)).toBe(16000);
  });

  it('caps at maxMs (default 30000)', () => {
    expect(nextBackoffMs(5)).toBe(30000); // 32000 capped
    expect(nextBackoffMs(10)).toBe(30000);
    expect(nextBackoffMs(1000)).toBe(30000); // huge attempt must not overflow
  });

  it('honours custom baseMs and maxMs', () => {
    expect(nextBackoffMs(0, { baseMs: 500 })).toBe(500);
    expect(nextBackoffMs(2, { baseMs: 500 })).toBe(2000);
    expect(nextBackoffMs(3, { baseMs: 500, maxMs: 3000 })).toBe(3000);
    expect(nextBackoffMs(0, { baseMs: 5000, maxMs: 4000 })).toBe(4000);
  });

  it('applies jitter within [delay/2, delay)', () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      const deterministic = nextBackoffMs(attempt);
      for (let i = 0; i < 20; i++) {
        const jittered = nextBackoffMs(attempt, { jitter: true });
        expect(jittered).toBeGreaterThanOrEqual(deterministic / 2);
        expect(jittered).toBeLessThanOrEqual(deterministic);
      }
    }
  });

  it('is deterministic with an injected rng', () => {
    expect(nextBackoffMs(1, { jitter: true, rng: () => 0 })).toBe(1000); // 2000 * 0.5
    expect(nextBackoffMs(1, { jitter: true, rng: () => 0.5 })).toBe(1500); // 2000 * 0.75
    expect(nextBackoffMs(1, { jitter: true, rng: () => 0.999999 })).toBeLessThan(2000);
  });

  it('ignores jitter=false regardless of rng', () => {
    expect(nextBackoffMs(2, { jitter: false, rng: () => 0 })).toBe(4000);
  });

  it('rejects invalid inputs', () => {
    expect(() => nextBackoffMs(-1)).toThrow();
    expect(() => nextBackoffMs(Number.NaN)).toThrow();
    expect(() => nextBackoffMs(0, { baseMs: 0 })).toThrow();
    expect(() => nextBackoffMs(0, { maxMs: -5 })).toThrow();
  });

  it('never exceeds maxMs even with jitter', () => {
    for (let i = 0; i < 50; i++) {
      expect(nextBackoffMs(20, { jitter: true })).toBeLessThanOrEqual(30000);
    }
  });
});
