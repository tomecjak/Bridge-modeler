import { describe, expect, it } from 'vitest';
import { formatStation, parseStation } from './format.ts';

describe('formatStation', () => {
  it('formats km, meters and millimeters', () => {
    expect(formatStation(1234.567)).toBe('km 1,234 567');
    expect(formatStation(158.761)).toBe('km 0,158 761');
    expect(formatStation(5)).toBe('km 0,005 000');
  });

  it('formats negative stations with a minus sign', () => {
    expect(formatStation(-1296.651)).toBe('km -1,296 651');
    expect(formatStation(-0.5)).toBe('km -0,000 500');
  });

  it('rounds before splitting km and meters', () => {
    expect(formatStation(1999.9996)).toBe('km 2,000 000');
    expect(formatStation(-0.0004)).toBe('km 0,000 000');
  });

  it('supports other precisions', () => {
    expect(formatStation(1234.567, 2)).toBe('km 1,234 57');
    expect(formatStation(1234.567, 0)).toBe('km 1,235');
  });
});

describe('parseStation', () => {
  it('parses the formatted form and common variants', () => {
    expect(parseStation('km 1,234 567')).toBeCloseTo(1234.567, 9);
    expect(parseStation('km -1,296 651')).toBeCloseTo(-1296.651, 9);
    expect(parseStation('1,234567')).toBeCloseTo(1234.567, 9);
    expect(parseStation('1,2')).toBeCloseTo(1200, 9);
    expect(parseStation('1+234.567')).toBeCloseTo(1234.567, 9);
    expect(parseStation('1234.5')).toBeCloseTo(1234.5, 9);
    expect(parseStation(' 158.761 ')).toBeCloseTo(158.761, 9);
  });

  it('round-trips formatStation', () => {
    for (const v of [-7724.35, -0.5, 0, 0.001, 158.761, 4802.9, 12527.252]) {
      expect(parseStation(formatStation(v))).toBeCloseTo(v, 9);
    }
  });

  it('rejects invalid input', () => {
    expect(parseStation('')).toBeUndefined();
    expect(parseStation('km abc')).toBeUndefined();
    expect(parseStation('1,2,3')).toBeUndefined();
  });
});
