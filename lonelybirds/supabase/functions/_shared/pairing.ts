/**
 * Pairing-code helpers for binding a Companion Terminal device to a pet.
 * Codes are exactly 6 decimal digits; leading zeros are significant and
 * preserved (the code is a string, never a number).
 *
 * MIRROR: copy of app/src/core/pairing.ts — no cross-package imports.
 */

export const PAIRING_CODE_LENGTH = 6;

const PAIRING_CODE_RE = /^[0-9]{6}$/;

/**
 * Generate a 6-digit pairing code. `rng` must return a float in [0, 1)
 * (defaults to Math.random); injectable for deterministic tests.
 */
export function generatePairingCode(rng: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < PAIRING_CODE_LENGTH; i++) {
    const r = rng();
    if (!(r >= 0 && r < 1)) {
      throw new Error(`rng must return a value in [0, 1), got ${r}`);
    }
    code += Math.floor(r * 10).toString();
  }
  return code;
}

/**
 * True only for strings of exactly 6 ASCII digits (leading zeros allowed;
 * no whitespace, signs, or unicode digits).
 */
export function isValidPairingCode(s: string): boolean {
  return PAIRING_CODE_RE.test(s);
}
