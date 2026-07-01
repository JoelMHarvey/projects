/** Sanity tests for the _shared mirror of app/src/core/pairing.ts. */
import { describe, expect, it } from 'vitest';
import { PAIRING_CODE_LENGTH, generatePairingCode, isValidPairingCode } from './pairing.ts';

describe('generatePairingCode (mirror)', () => {
  it('produces 6 digits and preserves leading zeros', () => {
    expect(generatePairingCode(() => 0)).toBe('000000');
    expect(generatePairingCode(() => 0.999999)).toBe('999999');
  });

  it('maps an injected rng sequence digit by digit', () => {
    const seq = [0.05, 0.15, 0.25, 0.35, 0.45, 0.95];
    let i = 0;
    expect(generatePairingCode(() => seq[i++] ?? 0)).toBe('012349');
  });

  it('always yields a valid code with the default rng', () => {
    for (let i = 0; i < 50; i++) {
      const code = generatePairingCode();
      expect(code).toHaveLength(PAIRING_CODE_LENGTH);
      expect(isValidPairingCode(code)).toBe(true);
    }
  });

  it('rejects an rng outside [0, 1)', () => {
    expect(() => generatePairingCode(() => 1)).toThrow();
    expect(() => generatePairingCode(() => -0.1)).toThrow();
  });
});

describe('isValidPairingCode (mirror)', () => {
  it('accepts exactly six ASCII digits', () => {
    expect(isValidPairingCode('000000')).toBe(true);
    expect(isValidPairingCode('123456')).toBe(true);
  });

  it('rejects everything else', () => {
    for (const bad of ['12345', '1234567', '12 456', '12a456', ' 123456', '123456\n', '']) {
      expect(isValidPairingCode(bad)).toBe(false);
    }
  });
});
