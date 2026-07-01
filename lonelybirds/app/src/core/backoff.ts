/**
 * Exponential backoff with optional jitter, used by terminals to reconnect
 * after a network drop.
 */

export interface BackoffOptions {
  /** Delay for the first attempt (attempt 0). Default 1000ms. */
  baseMs?: number;
  /** Upper cap on the returned delay. Default 30000ms. */
  maxMs?: number;
  /**
   * When true, the delay is scaled by a random factor in [0.5, 1) ("equal
   * jitter") so simultaneous reconnectors decorrelate but never wait longer
   * than the deterministic delay. Default false.
   */
  jitter?: boolean;
  /** RNG in [0, 1) used when jitter is enabled. Default Math.random. */
  rng?: () => number;
}

/**
 * Delay in ms before retry number `attempt` (0-indexed: attempt 0 is the
 * first retry). Deterministic schedule is `min(baseMs * 2^attempt, maxMs)`;
 * with `jitter: true` the result is uniformly drawn from [delay/2, delay).
 */
export function nextBackoffMs(attempt: number, options: BackoffOptions = {}): number {
  const { baseMs = 1000, maxMs = 30000, jitter = false, rng = Math.random } = options;

  if (!Number.isFinite(attempt) || attempt < 0) {
    throw new Error(`attempt must be a non-negative number, got ${attempt}`);
  }
  if (baseMs <= 0 || maxMs <= 0) {
    throw new Error('baseMs and maxMs must be positive');
  }

  // 2^attempt overflows quickly; clamp the exponent so the math stays exact.
  const exponent = Math.min(Math.floor(attempt), 30);
  const deterministic = Math.min(baseMs * 2 ** exponent, maxMs);

  if (!jitter) return deterministic;

  const factor = 0.5 + rng() * 0.5;
  return Math.floor(deterministic * factor);
}
