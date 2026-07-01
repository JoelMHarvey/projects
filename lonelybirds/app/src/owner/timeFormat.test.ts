import { describe, expect, it } from 'vitest';
import { formatHHMM, parseHHMM, parseWindowTimes } from './timeFormat';

describe('parseHHMM', () => {
  it('parses common times', () => {
    expect(parseHHMM('09:00')).toBe(540);
    expect(parseHHMM('9:05')).toBe(545);
    expect(parseHHMM('00:00')).toBe(0);
    expect(parseHHMM('23:59')).toBe(1439);
  });

  it('accepts 24:00 as end-of-day', () => {
    expect(parseHHMM('24:00')).toBe(1440);
    expect(parseHHMM('24:01')).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(parseHHMM('')).toBeNull();
    expect(parseHHMM('9')).toBeNull();
    expect(parseHHMM('09:60')).toBeNull();
    expect(parseHHMM('25:00')).toBeNull();
    expect(parseHHMM('nine am')).toBeNull();
    expect(parseHHMM('09:0')).toBeNull();
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseHHMM(' 18:00 ')).toBe(1080);
  });
});

describe('formatHHMM', () => {
  it('formats with zero padding and round-trips parseHHMM', () => {
    expect(formatHHMM(540)).toBe('09:00');
    expect(formatHHMM(0)).toBe('00:00');
    expect(formatHHMM(1439)).toBe('23:59');
    expect(formatHHMM(1440)).toBe('24:00');
    expect(parseHHMM(formatHHMM(755))).toBe(755);
  });

  it('throws on out-of-range values', () => {
    expect(() => formatHHMM(-1)).toThrow();
    expect(() => formatHHMM(1441)).toThrow();
    expect(() => formatHHMM(1.5)).toThrow();
  });
});

describe('parseWindowTimes', () => {
  it('accepts a valid ordered pair', () => {
    expect(parseWindowTimes('09:00', '18:00')).toEqual({
      startMinute: 540,
      endMinute: 1080,
    });
    expect(parseWindowTimes('00:00', '24:00')).toEqual({
      startMinute: 0,
      endMinute: 1440,
    });
  });

  it('rejects reversed, equal, or unparseable pairs', () => {
    expect(parseWindowTimes('18:00', '09:00')).toBeNull();
    expect(parseWindowTimes('09:00', '09:00')).toBeNull();
    expect(parseWindowTimes('24:00', '24:00')).toBeNull(); // start must be <= 23:59
    expect(parseWindowTimes('foo', '18:00')).toBeNull();
  });
});
