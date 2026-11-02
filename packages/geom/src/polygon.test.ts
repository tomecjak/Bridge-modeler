import { describe, expect, it } from 'vitest';
import {
  centroid,
  clipPolygonHalfPlane,
  duplicateVertices,
  isCounterClockwise,
  pointInPolygon,
  regionProperties,
  selfIntersections,
  signedArea,
} from './polygon.ts';
import { rotate2, vec2 } from './vec.ts';

const square = [vec2(0, 0), vec2(2, 0), vec2(2, 2), vec2(0, 2)];
const TOL = 1e-9;

describe('area, centroid, orientation', () => {
  it('computes signed area and centroid of a square', () => {
    expect(signedArea(square)).toBe(4);
    expect(signedArea([...square].reverse())).toBe(-4);
    expect(centroid(square)).toEqual(vec2(1, 1));
    expect(isCounterClockwise(square)).toBe(true);
  });

  it('computes the centroid of a triangle', () => {
    const c = centroid([vec2(0, 0), vec2(3, 0), vec2(0, 3)]);
    expect(c.x).toBeCloseTo(1, 15);
    expect(c.y).toBeCloseTo(1, 15);
  });

  it('is invariant to translation and rotation (property)', () => {
    const shape = [vec2(0, 0), vec2(4, 0), vec2(4, 1), vec2(1, 1), vec2(1, 3), vec2(0, 3)];
    const a0 = signedArea(shape);
    for (let i = 0; i < 20; i++) {
      const angle = i * 0.37;
      const moved = shape.map((p) => {
        const r = rotate2(p, angle);
        return vec2(r.x + 1000 * i, r.y - 500 * i);
      });
      expect(signedArea(moved)).toBeCloseTo(a0, 6);
      const c = centroid(moved);
      const expected = rotate2(centroid(shape), angle);
      expect(c.x).toBeCloseTo(expected.x + 1000 * i, 6);
      expect(c.y).toBeCloseTo(expected.y - 500 * i, 6);
    }
  });
});

describe('region with voids', () => {
  it('subtracts voids from area and moves the centroid', () => {
    const hole = [vec2(0.5, 0.5), vec2(0.5, 1.5), vec2(1, 1.5), vec2(1, 0.5)]; // CW
    const r = regionProperties(square, [hole]);
    expect(r.area).toBeCloseTo(3.5, 15);
    // ťažisko sa posunie od otvoru doprava
    expect(r.centroid.x).toBeCloseTo((4 * 1 - 0.5 * 0.75) / 3.5, 15);
    expect(r.centroid.y).toBeCloseTo(1, 15);
  });
});

describe('validity checks', () => {
  it('detects self-intersections of non-adjacent edges', () => {
    const bowtie = [vec2(0, 0), vec2(2, 2), vec2(2, 0), vec2(0, 2)];
    expect(selfIntersections(bowtie, TOL)).toEqual([[0, 2]]);
    expect(selfIntersections(square, TOL)).toEqual([]);
  });

  it('detects a vertex touching a non-adjacent edge', () => {
    const touching = [vec2(0, 0), vec2(4, 0), vec2(4, 4), vec2(2, 0), vec2(0, 4)];
    expect(selfIntersections(touching, TOL).length).toBeGreaterThan(0);
  });

  it('detects duplicate consecutive vertices including the closing edge', () => {
    expect(duplicateVertices([vec2(0, 0), vec2(1, 0), vec2(1, 0), vec2(0, 1)], TOL)).toEqual([1]);
    expect(duplicateVertices([vec2(0, 0), vec2(1, 0), vec2(0, 0)], TOL)).toEqual([2]);
  });

  it('tests point containment', () => {
    expect(pointInPolygon(vec2(1, 1), square)).toBe(true);
    expect(pointInPolygon(vec2(3, 1), square)).toBe(false);
  });
});

describe('clipPolygonHalfPlane', () => {
  it('keeps the part on the side of the normal', () => {
    const half = clipPolygonHalfPlane(square, vec2(1, 0), vec2(1, 0));
    expect(signedArea(half)).toBeCloseTo(2, 12);
    expect(half.every((p) => p.x >= 1 - TOL)).toBe(true);
    expect(clipPolygonHalfPlane(square, vec2(1, 0), vec2(-1, 0)).length).toBeGreaterThan(2);
  });

  it('returns the whole or nothing when the line misses the polygon', () => {
    expect(clipPolygonHalfPlane(square, vec2(-1, 0), vec2(1, 0))).toEqual(square);
    expect(clipPolygonHalfPlane(square, vec2(3, 0), vec2(1, 0))).toEqual([]);
  });

  it('clips a skew strip of a concave polygon exactly', () => {
    // L-tvar 3 × 3 bez štvorca 2 × 2 vpravo hore (plocha 5), šikmá priamka x + y ≥ 1
    const l = [vec2(0, 0), vec2(3, 0), vec2(3, 1), vec2(1, 1), vec2(1, 3), vec2(0, 3)];
    const clipped = clipPolygonHalfPlane(l, vec2(1, 0), vec2(1, 1));
    // odrezaný trojuholník (0,0), (1,0), (0,1) má plochu 0,5
    expect(Math.abs(signedArea(clipped))).toBeCloseTo(4.5, 12);
  });
});
