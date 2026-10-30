import { describe, expect, it } from 'vitest';
import { formatGrade, formatNumber } from './number.ts';

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
