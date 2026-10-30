import { describe, expect, it } from 'vitest';
import { lowestCrossing } from './sectionGeometry.ts';

describe('lowestCrossing', () => {
  it('finds the bottom of a section below the reference point', () => {
    const poly = [
      { x: -2, y: 0 },
      { x: -2, y: -0.2 },
      { x: -1, y: -1.7 },
      { x: 1, y: -1.8 },
      { x: 2, y: -0.2 },
      { x: 2, y: -0.1 },
    ];
    expect(lowestCrossing([poly], 0)).toBeCloseTo(-1.75, 12);
    expect(lowestCrossing([poly], 5)).toBeUndefined();
  });
});
