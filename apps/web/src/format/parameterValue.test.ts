import { describe, expect, it } from 'vitest';
import { formatParameterValue } from './parameterValue.ts';

describe('formatParameterValue', () => {
  it('shows lengths in mm, angles in degrees and slopes in percent', () => {
    expect(formatParameterValue('length', 1.55)).toBe('1 550,0 mm');
    expect(formatParameterValue('angle', 30)).toBe('30,0000 °');
    expect(formatParameterValue('slope', -0.025)).toBe('-2,500 %');
    expect(formatParameterValue('none', 2)).toBe('2,0000');
  });
});
