import { describe, expect, it } from 'vitest';
import { generatePairingCode, isValidPairingCode, PAIRING_CODE_LENGTH } from './pairing';

describe('generatePairingCode', () => {
  it('produces exactly 6 decimal digits', () => {
    for (let i = 0; i < 200; i++) {
      const code = generatePairingCode();
      expect(code).toMatch(/^[0-9]{6}$/);
      expect(code).toHaveLength(PAIRING_CODE_LENGTH);
    }
  });

  it('preserves leading zeros (code is a string, never numeric)', () => {
    const code = generatePairingCode(() => 0); // every digit 0
    expect(code).toBe('000000');
    expect(code.length).toBe(6);
  });

  it('maps the rng deterministically to digits', () => {
    const values = [0.05, 0.15, 0.25, 0.55, 0.85, 0.999999];
    let i = 0;
    const rng = () => values[i++]!;
    expect(generatePairingCode(rng)).toBe('012589');
  });

  it('never produces a digit outside 0-9 at the rng extremes', () => {
    expect(generatePairingCode(() => 0.9999999999)).toBe('999999');
  });

  it('throws when the rng misbehaves (out of [0,1))', () => {
    expect(() => generatePairingCode(() => 1)).toThrow();
    expect(() => generatePairingCode(() => -0.1)).toThrow();
    expect(() => generatePairingCode(() => Number.NaN)).toThrow();
  });

  it('generates varied codes with the default rng', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generatePairingCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe('isValidPairingCode', () => {
  it('accepts exactly-6-digit strings including leading zeros', () => {
    expect(isValidPairingCode('123456')).toBe(true);
    expect(isValidPairingCode('000000')).toBe(true);
    expect(isValidPairingCode('012345')).toBe(true);
  });

  it('rejects wrong lengths', () => {
    expect(isValidPairingCode('')).toBe(false);
    expect(isValidPairingCode('12345')).toBe(false);
    expect(isValidPairingCode('1234567')).toBe(false);
  });

  it('rejects non-digit characters, whitespace and signs', () => {
    expect(isValidPairingCode('12345a')).toBe(false);
    expect(isValidPairingCode('12 456')).toBe(false);
    expect(isValidPairingCode(' 123456')).toBe(false);
    expect(isValidPairingCode('123456 ')).toBe(false);
    expect(isValidPairingCode('+12345')).toBe(false);
    expect(isValidPairingCode('12.456')).toBe(false);
  });

  it('rejects unicode digits (only ASCII 0-9 allowed)', () => {
    expect(isValidPairingCode('１２３４５６')).toBe(false); // full-width digits
    expect(isValidPairingCode('123٤56')).toBe(false); // arabic-indic digit
  });

  it('round-trips generated codes', () => {
    for (let i = 0; i < 50; i++) {
      expect(isValidPairingCode(generatePairingCode())).toBe(true);
    }
  });
});
