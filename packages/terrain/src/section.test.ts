import { createAlignment, suggestOrigin } from '@bridge/alignment';
import { syntheticAlignmentData } from '@bridge/alignment/testing';
import { vec2 } from '@bridge/geom';
import { describe, expect, it } from 'vitest';
import { crossSection, cutPolyline, profileAlong } from './section.ts';
import { createTin, type Tin } from './tin.ts';

const plane = (x: number, y: number) => 250 + 0.02 * x - 0.035 * y;

/** Pravidelný TIN n × n bodov s krokom `step` od (x0, y0); `hole` = vynechané bunky. */
function gridTin(
  n: number,
  step: number,
  x0 = 0,
  y0 = 0,
  z: (x: number, y: number) => number = plane,
  hole: (i: number, j: number) => boolean = () => false,
): Tin {
  const points: number[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = x0 + i * step;
      const y = y0 + j * step;
      points.push(x, y, z(x, y));
    }
  }
  const triangles: number[] = [];
  for (let j = 0; j + 1 < n; j++) {
    for (let i = 0; i + 1 < n; i++) {
      if (hole(i, j)) continue;
      const a = j * n + i;
      triangles.push(a, a + 1, a + n + 1, a, a + n + 1, a + n);
    }
  }
  return createTin(points, triangles);
}

/** Leží bod na niektorej hrane TIN? */
function onEdge(tin: Tin, x: number, y: number): boolean {
  const p = tin.points;
  const t = tin.triangles;
  for (let k = 0; k < t.length / 3; k++) {
    for (let e = 0; e < 3; e++) {
      const i = 3 * (t[3 * k + e] as number);
      const j = 3 * (t[3 * k + ((e + 1) % 3)] as number);
      const ax = p[i] as number;
      const ay = p[i + 1] as number;
      const ex = (p[j] as number) - ax;
      const ey = (p[j + 1] as number) - ay;
      const cross = (x - ax) * ey - (y - ay) * ex;
      const dot = ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey);
      if (Math.abs(cross) < 1e-9 && dot >= -1e-12 && dot <= 1 + 1e-12) return true;
    }
  }
  return false;
}

describe('cutPolyline', () => {
  const tin = gridTin(11, 10);

  it('follows a plane exactly with a point on every TIN edge crossed', () => {
    const runs = cutPolyline(tin, [vec2(3, 7), vec2(57, 41), vec2(95, 12)]);
    expect(runs).toHaveLength(1);
    const run = runs[0] ?? [];
    for (const p of run) expect(p.z).toBeCloseTo(plane(p.x, p.y), 9);
    // vnútorné body sú priesečníky s hranami, okrem vrcholu polyline
    for (const p of run.slice(1, -1)) {
      if (Math.abs(p.x - 57) < 1e-9 && Math.abs(p.y - 41) < 1e-9) continue;
      expect(onEdge(tin, p.x, p.y)).toBe(true);
    }
    expect(run.length).toBeGreaterThan(20);
    const d = run.map((p) => p.d);
    expect(d).toEqual([...d].sort((a, b) => a - b));
    expect(run[run.length - 1]?.d).toBeCloseTo(Math.hypot(54, 34) + Math.hypot(38, 29), 9);
  });

  it('captures the ridge of a non-planar surface at the edge', () => {
    // hrebeň v x = 50: z = 10 − |x − 50|·0,1 (na rovine by stred chýbal)
    const ridge = gridTin(11, 10, 0, 0, (x) => 10 - Math.abs(x - 50) * 0.1);
    const run = cutPolyline(ridge, [vec2(5, 33), vec2(95, 33)])[0] ?? [];
    expect(Math.max(...run.map((p) => p.z))).toBeCloseTo(10, 9);
  });

  it('breaks the line where it leaves the surface or crosses a hole', () => {
    const holed = gridTin(11, 10, 0, 0, plane, (i, j) => i === 5 && j === 3);
    const runs = cutPolyline(holed, [vec2(-20, 35), vec2(120, 35)]);
    expect(runs).toHaveLength(2);
    expect(runs[0]?.[0]?.x).toBeCloseTo(0, 9);
    expect(runs[0]?.at(-1)?.x).toBeCloseTo(50, 9);
    expect(runs[1]?.[0]?.x).toBeCloseTo(60, 9);
    expect(runs[1]?.at(-1)?.x).toBeCloseTo(100, 9);
  });

  it('returns nothing for a line completely outside', () => {
    expect(cutPolyline(tin, [vec2(200, 200), vec2(300, 300)])).toEqual([]);
  });
});

describe('profileAlong / crossSection', () => {
  const data = syntheticAlignmentData(undefined, 1000);
  const { alignment } = createAlignment(data, suggestOrigin(data));
  // terén okolo začiatku syntetickej osi (lokálne súradnice)
  const start = alignment.evaluateHorizontal(0).point;
  const tin = gridTin(61, 5, start.x - 150, start.y - 150);

  it('cuts the terrain along the axis in stations with the plane heights', () => {
    const runs = profileAlong(tin, alignment, 0, 120);
    expect(runs).toHaveLength(1);
    const run = runs[0] ?? [];
    expect(run[0]?.s).toBeCloseTo(0, 9);
    expect(run.at(-1)?.s).toBeCloseTo(120, 9);
    for (const p of run) {
      const q = alignment.evaluateHorizontal(p.s).point;
      // os je nahradená tetivami ≤ 1 m (oblúk R 250) → poloha bodu na mm
      expect(p.z).toBeCloseTo(plane(q.x, q.y), 3);
    }
  });

  it('cuts across the axis at a station with offsets positive to the right', () => {
    const [run] = crossSection(tin, alignment, 30, -20, 25);
    expect(run?.[0]?.x).toBeCloseTo(-20, 9);
    expect(run?.at(-1)?.x).toBeCloseTo(25, 9);
    const h = alignment.evaluateHorizontal(30);
    for (const p of run ?? []) {
      const x = h.point.x + p.x * Math.cos(h.azimuth);
      const y = h.point.y - p.x * Math.sin(h.azimuth);
      expect(p.z).toBeCloseTo(plane(x, y), 9);
    }
    // vpravo od osi (azimut ~ 0,6 rad) klesá y → terén stúpa
    expect((run?.at(-1)?.z ?? 0) > (run?.[0]?.z ?? 0)).toBe(true);
  });
});
