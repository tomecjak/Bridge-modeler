import { angleDifference, distance2, vec2 } from '@bridge/geom';
import { describe, expect, it } from 'vitest';
import { StationOutOfRangeError } from '../errors.ts';
import { syntheticAlignmentData } from '../testing/synthetic.ts';
import { buildHorizontal } from './horizontal.ts';

const data = syntheticAlignmentData();
const origin = vec2(-600000, -1200000);

describe('buildHorizontal', () => {
  const { horizontal, issues } = buildHorizontal(data.horizontal, origin, data.length);

  it('builds a consistent alignment without issues', () => {
    expect(issues).toEqual([]);
    expect(horizontal.length).toBeCloseTo(435, 9);
    expect(horizontal.boundaries).toHaveLength(data.horizontal.length + 1);
  });

  it('works in local coordinates relative to the origin', () => {
    const p = horizontal.evaluate(0).point;
    expect(p.x).toBeCloseTo(123.456, 9);
    expect(p.y).toBeCloseTo(78.9, 9);
  });

  it('is continuous in position and azimuth at every element joint', () => {
    for (const s of horizontal.boundaries.slice(1, -1)) {
      const eps = 1e-9;
      const before = horizontal.evaluate(s - eps);
      const after = horizontal.evaluate(s + eps);
      expect(distance2(before.point, after.point)).toBeLessThan(1e-6);
      expect(Math.abs(angleDifference(before.azimuth, after.azimuth))).toBeLessThan(1e-9);
    }
  });

  it('reaches the declared end point of every element', () => {
    data.horizontal.forEach((e, i) => {
      const s = horizontal.boundaries[i + 1] as number;
      const p = horizontal.evaluate(s).point;
      expect(distance2(p, vec2(e.end.x - origin.x, e.end.y - origin.y))).toBeLessThan(1e-6);
    });
  });

  it('throws a typed error outside the alignment', () => {
    expect(() => horizontal.evaluate(-1)).toThrow(StationOutOfRangeError);
    expect(() => horizontal.evaluate(436)).toThrow(StationOutOfRangeError);
  });

  it('projects offset points back to station and signed offset', () => {
    for (let s = 0.5; s < horizontal.length; s += 7.3) {
      const e = horizontal.evaluate(s);
      for (const offset of [-12, 0, 4.5]) {
        const p = vec2(
          e.point.x + offset * Math.cos(e.azimuth),
          e.point.y - offset * Math.sin(e.azimuth),
        );
        const r = horizontal.project(p);
        expect(r).toBeDefined();
        expect(r?.s).toBeCloseTo(s, 6);
        expect(r?.offset).toBeCloseTo(offset, 6);
      }
    }
  });

  it('returns undefined for points beyond the alignment ends', () => {
    const start = horizontal.evaluate(0);
    const before = vec2(
      start.point.x - 10 * Math.sin(start.azimuth),
      start.point.y - 10 * Math.cos(start.azimuth),
    );
    expect(horizontal.project(before)).toBeUndefined();
  });
});

describe('buildHorizontal issues', () => {
  it('warns when an element end does not match the next geometry', () => {
    const broken: typeof data.horizontal = JSON.parse(JSON.stringify(data.horizontal));
    const arc = broken[2];
    if (arc?.kind !== 'arc') throw new Error('expected arc');
    arc.length += 0.01;
    const { issues } = buildHorizontal(broken, origin, data.length);
    expect(issues).toMatchObject([
      { code: 'GeometryMismatch', index: 2, severity: 'warning' },
      { code: 'DirectionMismatch', index: 3, severity: 'warning' },
      { code: 'LengthMismatch', severity: 'warning' },
    ]);
  });
});
