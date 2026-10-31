import { describe, expect, it } from 'vitest';
import { formatGrade, formatNumber, parseNumber } from './number.ts';

describe('formatNumber', () => {
  it('uses decimal comma and space thousands separator', () => {
    expect(formatNumber(-1069592.0042, 3)).toBe('-1 069 592,004');
    expect(formatNumber(723.35, 2)).toBe('723,35');
  });

  it('does not show negative zero', () => {
    expect(formatNumber(-0.0001, 3)).toBe('0,000');
  });

  it('formats grades in percent', () => {
    expect(formatGrade(-0.0138)).toBe('-1,380 %');
  });
});

describe('parseNumber', () => {
  it('reads numbers formatted for display and typed by hand', () => {
    expect(parseNumber(formatNumber(9500, 0))).toBe(9500);
    expect(parseNumber('10 250,5')).toBe(10250.5);
    expect(parseNumber(' -1.25 ')).toBe(-1.25);
    expect(parseNumber('.5')).toBe(0.5);
  });

  it('rejects anything else', () => {
    for (const text of ['', ' ', 'abc', '9,5,5', '9 500 mm', '1e3']) {
      expect(parseNumber(text)).toBeUndefined();
    }
  });
});
