import { vec2, vec3 } from '@bridge/geom';
import { describe, expect, it } from 'vitest';
import { createAlignment, suggestOrigin } from './alignment.ts';
import { MissingProfileError, StationOutOfRangeError } from './errors.ts';
import { syntheticAlignmentData } from './testing/synthetic.ts';

const data = syntheticAlignmentData(vec2(-600000, -1200000), 2000);
const origin = suggestOrigin(data);

describe('suggestOrigin', () => {
  it('rounds the alignment start to 100 m and keeps H₀ = 0', () => {
    // začiatok osi: E = −599 876,544, N = −1 199 921,1
    expect(origin).toEqual(vec3(-599900, -1199900, 0));
  });
});

describe('createAlignment', () => {
  const { alignment, issues } = createAlignment(data, origin);

  it('exposes length, station start and element list', () => {
    expect(issues).toEqual([]);
    expect(alignment.length).toBeCloseTo(435, 9);
    expect(alignment.staStart).toBe(2000);
    expect(alignment.elements.map((e) => e.kind)).toEqual([
      'line',
      'spiral',
      'arc',
      'spiral',
      'line',
      'spiral',
      'arc',
      'spiral',
      'line',
    ]);
    expect(alignment.elements[1]?.sStart).toBeCloseTo(50, 9);
    expect(alignment.elements[1]?.sEnd).toBeCloseTo(110, 9);
  });

  it('evaluates 3D point, grade and frame', () => {
    const e = alignment.evaluate(20);
    const h = alignment.evaluateHorizontal(20);
    expect(e.point.x).toBe(h.point.x);
    expect(e.point.y).toBe(h.point.y);
    expect(e.point.z).toBeCloseTo(250 + 20 * (3 / 150), 12);
    expect(e.grade).toBeCloseTo(3 / 150, 12);
    expect(e.frame.origin).toEqual(e.point);
    expect(e.frame.normal.z).toBe(0);
  });

  it('round-trips evaluate → offset along frame normal → project', () => {
    for (let s = 0.25; s < alignment.length; s += 4.1) {
      const { frame } = alignment.evaluate(s);
      for (const offset of [-8, 3.3]) {
        const p = vec2(
          frame.origin.x + offset * frame.normal.x,
          frame.origin.y + offset * frame.normal.y,
        );
        const r = alignment.project(p);
        expect(Math.abs((r?.s ?? Number.NaN) - s)).toBeLessThan(1e-6);
        expect(Math.abs((r?.offset ?? Number.NaN) - offset)).toBeLessThan(1e-6);
      }
    }
  });

  it('throws typed errors outside the alignment and without a profile', () => {
    expect(() => alignment.evaluate(-1)).toThrow(StationOutOfRangeError);
    const flat = createAlignment({ ...data, profiles: [] }, origin).alignment;
    expect(() => flat.evaluate(10)).toThrow(MissingProfileError);
    expect(flat.evaluateHorizontal(10).point).toBeDefined();
  });
});
