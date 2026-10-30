import { describe, expect, it } from 'vitest';
import { type Polygon2D, pointInPolygon, signedArea } from './polygon.ts';
import { triangulatePolygon } from './triangulate.ts';
import { type Vec2, vec2 } from './vec.ts';

const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  vec2(x0, y0),
  vec2(x1, y0),
  vec2(x1, y1),
  vec2(x0, y1),
];

/** Trojuholníky ako trojice bodov (indexy do obrysu, za ním dutiny v poradí). */
function triangles(outer: Polygon2D, holes: Polygon2D[] = []): [Vec2, Vec2, Vec2][] {
  const all = [...outer, ...holes.flat()];
  const idx = triangulatePolygon(outer, holes);
  expect(idx.length % 3).toBe(0);
  const out: [Vec2, Vec2, Vec2][] = [];
  for (let i = 0; i < idx.length; i += 3) {
    out.push([all[idx[i] as number], all[idx[i + 1] as number], all[idx[i + 2] as number]] as [
      Vec2,
      Vec2,
      Vec2,
    ]);
  }
  return out;
}

const triArea = (t: [Vec2, Vec2, Vec2]) => signedArea(t);
const triCentroid = (t: [Vec2, Vec2, Vec2]) =>
  vec2((t[0].x + t[1].x + t[2].x) / 3, (t[0].y + t[1].y + t[2].y) / 3);

/** Triangulácia pokrýva oblasť: súčet plôch = plocha obrysu − dutiny, všetky CCW, ťažiská vnútri. */
function expectCovers(outer: Polygon2D, holes: Polygon2D[] = []) {
  const tris = triangles(outer, holes);
  const expected =
    Math.abs(signedArea(outer)) - holes.reduce((a, h) => a + Math.abs(signedArea(h)), 0);
  let sum = 0;
  for (const t of tris) {
    expect(triArea(t)).toBeGreaterThan(0);
    sum += triArea(t);
    const c = triCentroid(t);
    expect(pointInPolygon(c, outer)).toBe(true);
    for (const h of holes) expect(pointInPolygon(c, h)).toBe(false);
  }
  expect(sum).toBeCloseTo(expected, 9);
  return tris;
}

describe('triangulatePolygon', () => {
  it('splits a square into two CCW triangles', () => {
    expect(expectCovers(rect(0, 0, 2, 2))).toHaveLength(2);
  });

  it('accepts a clockwise outline and still returns CCW triangles', () => {
    expectCovers(rect(0, 0, 3, 1).reverse());
  });

  it('triangulates a non-convex comb', () => {
    const comb = [
      vec2(0, 0),
      vec2(5, 0),
      vec2(5, 3),
      vec2(4, 3),
      vec2(4, 1),
      vec2(3, 1),
      vec2(3, 3),
      vec2(2, 3),
      vec2(2, 1),
      vec2(1, 1),
      vec2(1, 3),
      vec2(0, 3),
    ];
    // vrcholy, ktoré po odrezaní zubov ležia na priamke, sa vynechajú → najviac n − 2 trojuholníkov
    expect(expectCovers(comb).length).toBeLessThanOrEqual(comb.length - 2);
  });

  it('skips collinear vertices without losing area', () => {
    expectCovers([vec2(0, 0), vec2(1, 0), vec2(2, 0), vec2(2, 1), vec2(1, 1), vec2(0, 1)]);
  });

  it('cuts out one hole', () => {
    expectCovers(rect(0, 0, 4, 4), [rect(1, 1, 3, 3).reverse()]);
  });

  it('cuts out several holes in any orientation', () => {
    expectCovers(rect(0, 0, 10, 4), [
      rect(1, 1, 3, 3),
      rect(4, 1, 6, 3).reverse(),
      rect(7, 1, 9, 3),
    ]);
  });

  it('handles a box girder with a void touching the bridge line of a reflex vertex', () => {
    const outer = [
      vec2(-6, 0),
      vec2(6, 0),
      vec2(6, -0.25),
      vec2(3, -0.4),
      vec2(2.5, -2),
      vec2(-2.5, -2),
      vec2(-3, -0.4),
      vec2(-6, -0.25),
    ];
    const hole = [vec2(-2, -0.5), vec2(-2, -1.7), vec2(2, -1.7), vec2(2, -0.5)];
    expectCovers(outer, [hole]);
  });

  it('covers random star-shaped outlines with a hole (property)', () => {
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let k = 0; k < 50; k++) {
      const n = 5 + Math.floor(rnd() * 30);
      const star = Array.from({ length: n }, (_, i) => {
        const t = (2 * Math.PI * i) / n;
        const r = 3 + rnd() * 2;
        return vec2(r * Math.cos(t), r * Math.sin(t));
      });
      expectCovers(star, [rect(-1, -1, 1 + rnd(), 1)]);
    }
  });

  it('returns nothing for degenerate input', () => {
    expect(triangulatePolygon([vec2(0, 0), vec2(1, 0)])).toEqual([]);
    expect(triangulatePolygon([vec2(0, 0), vec2(1, 0), vec2(2, 0)])).toEqual([]);
  });
});
