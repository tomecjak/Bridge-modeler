import { describe, expect, it } from 'vitest';
import {
  angleDifference,
  azimuthToVector,
  degToRad,
  normalizeAngle,
  radToDeg,
  TWO_PI,
  vectorToAzimuth,
} from './angle.ts';
import { vec2 } from './vec.ts';

describe('normalizeAngle', () => {
  it('maps any angle into [0, 2π)', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(TWO_PI)).toBe(0);
    expect(normalizeAngle(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2, 15);
    expect(normalizeAngle(5 * Math.PI)).toBeCloseTo(Math.PI, 14);
  });

  it('never returns 2π for tiny negative input', () => {
    const a = normalizeAngle(-1e-18);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(TWO_PI);
  });
});

describe('angleDifference', () => {
  it('returns the signed shortest difference in (-π, π]', () => {
    expect(angleDifference(0.1, TWO_PI - 0.1)).toBeCloseTo(0.2, 14);
    expect(angleDifference(TWO_PI - 0.1, 0.1)).toBeCloseTo(-0.2, 14);
  });
});

describe('azimuth (clockwise from +y)', () => {
  it('converts between azimuth and unit vector', () => {
    const east = azimuthToVector(Math.PI / 2);
    expect(east.x).toBeCloseTo(1, 15);
    expect(east.y).toBeCloseTo(0, 15);
    expect(vectorToAzimuth(vec2(0, 1))).toBe(0);
    expect(vectorToAzimuth(vec2(1, 0))).toBeCloseTo(Math.PI / 2, 15);
    expect(vectorToAzimuth(vec2(-1, 0))).toBeCloseTo((3 * Math.PI) / 2, 15);
  });

  it('converts degrees and radians', () => {
    expect(degToRad(180)).toBe(Math.PI);
    expect(radToDeg(Math.PI / 2)).toBe(90);
  });
});
