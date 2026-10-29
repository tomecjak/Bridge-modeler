import { describe, expect, it } from 'vitest';
import {
  add2,
  add3,
  cross2,
  cross3,
  distance2,
  dot2,
  dot3,
  length2,
  length3,
  normalize2,
  normalize3,
  rotate2,
  scale2,
  scale3,
  sub2,
  sub3,
  vec2,
  vec3,
} from './vec.ts';

describe('Vec2', () => {
  it('adds, subtracts and scales', () => {
    expect(add2(vec2(1, 2), vec2(3, 5))).toEqual(vec2(4, 7));
    expect(sub2(vec2(1, 2), vec2(3, 5))).toEqual(vec2(-2, -3));
    expect(scale2(vec2(1, -2), 3)).toEqual(vec2(3, -6));
  });

  it('computes dot, cross, length and distance', () => {
    expect(dot2(vec2(1, 2), vec2(3, 4))).toBe(11);
    expect(cross2(vec2(1, 0), vec2(0, 1))).toBe(1);
    expect(length2(vec2(3, 4))).toBe(5);
    expect(distance2(vec2(1, 1), vec2(4, 5))).toBe(5);
  });

  it('normalizes to unit length', () => {
    const n = normalize2(vec2(3, 4));
    expect(n.x).toBeCloseTo(0.6, 15);
    expect(n.y).toBeCloseTo(0.8, 15);
  });

  it('rotates counter-clockwise for positive angle', () => {
    const r = rotate2(vec2(1, 0), Math.PI / 2);
    expect(r.x).toBeCloseTo(0, 15);
    expect(r.y).toBeCloseTo(1, 15);
  });
});

describe('Vec3', () => {
  it('adds, subtracts and scales', () => {
    expect(add3(vec3(1, 2, 3), vec3(1, 1, 1))).toEqual(vec3(2, 3, 4));
    expect(sub3(vec3(1, 2, 3), vec3(1, 1, 1))).toEqual(vec3(0, 1, 2));
    expect(scale3(vec3(1, 2, 3), 2)).toEqual(vec3(2, 4, 6));
  });

  it('computes right-handed cross product', () => {
    expect(cross3(vec3(1, 0, 0), vec3(0, 1, 0))).toEqual(vec3(0, 0, 1));
    expect(dot3(vec3(1, 2, 3), vec3(4, 5, 6))).toBe(32);
    expect(length3(vec3(2, 3, 6))).toBe(7);
    expect(length3(normalize3(vec3(2, 3, 6)))).toBeCloseTo(1, 15);
  });
});
