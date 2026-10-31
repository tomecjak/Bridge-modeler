import { vec2 } from '@bridge/geom';
import { describe, expect, it } from 'vitest';
import { highestCrossing, lowestCrossing } from './crossing.ts';

// trám: horný povrch s priečnym sklonom, spodok vodorovný pod stenou
const deck = [
  vec2(-6, 0.15),
  vec2(-6, -0.1),
  vec2(-2, -0.5),
  vec2(-1.5, -1.5),
  vec2(1.5, -1.5),
  vec2(2, -0.5),
  vec2(6, -0.1),
  vec2(6, -0.15),
];

describe('crossings of a vertical line with the deck outline', () => {
  it('finds the lowest point (soffit) and the highest point (top surface)', () => {
    expect(lowestCrossing([deck], 0)).toBeCloseTo(-1.5, 12);
    expect(highestCrossing([deck], 0)).toBeCloseTo(0, 12);
    expect(highestCrossing([deck], 3)).toBeCloseTo(-0.075, 12);
    expect(highestCrossing([deck], -6)).toBeCloseTo(0.15, 12);
  });

  it('returns undefined outside the outline', () => {
    expect(highestCrossing([deck], 7)).toBeUndefined();
    expect(lowestCrossing([deck], -7)).toBeUndefined();
  });
});
