import { createAlignment, suggestOrigin } from '@bridge/alignment';
import { syntheticAlignmentData } from '@bridge/alignment/testing';
import { describe, expect, it } from 'vitest';
import { clipGrid, clipTin, corridorAround, deckRanges, type Raster } from './corridor.ts';
import type { ParsedSurface } from './landxml.ts';
import { terrainTin } from './tin.ts';

const data = syntheticAlignmentData(undefined, 1000);
const origin = suggestOrigin(data);
const { alignment } = createAlignment(data, origin);
const plane = (x: number, y: number) => 250 + 0.02 * x - 0.035 * y;

/** Absolútny (EPSG:5514) pravidelný povrch okolo začiatku osi s krokom 5 m. */
function surface(): ParsedSurface {
  const start = alignment.evaluateHorizontal(0).point;
  const n = 81;
  const points: number[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = start.x - 100 + i * 5 + origin.x;
      const y = start.y - 100 + j * 5 + origin.y;
      points.push(x, y, plane(x - origin.x, y - origin.y) + 0.0004);
    }
  }
  const triangles: number[] = [];
  for (let j = 0; j + 1 < n; j++) {
    for (let i = 0; i + 1 < n; i++) {
      const a = j * n + i;
      triangles.push(a, a + 1, a + n + 1, a, a + n + 1, a + n);
    }
  }
  return { name: 'EG', points: Float64Array.from(points), triangles: Uint32Array.from(triangles) };
}

describe('corridorAround', () => {
  const corridor = corridorAround(alignment, [{ sFrom: 60, sTo: 100 }], {
    halfWidth: 20,
    margin: 10,
  });

  it('contains points within the half width of the axis inside the deck range plus margin', () => {
    const at = (s: number, offset: number) => {
      const h = alignment.evaluateHorizontal(s);
      return [
        h.point.x + offset * Math.cos(h.azimuth),
        h.point.y - offset * Math.sin(h.azimuth),
      ] as const;
    };
    expect(corridor.contains(...at(80, 0))).toBe(true);
    expect(corridor.contains(...at(80, 19.9))).toBe(true);
    expect(corridor.contains(...at(80, -19.9))).toBe(true);
    expect(corridor.contains(...at(80, 20.1))).toBe(false);
    expect(corridor.contains(...at(51, 5))).toBe(true);
    expect(corridor.contains(...at(49, 5))).toBe(false);
    expect(corridor.contains(...at(111, 0))).toBe(false);
  });

  it('covers the whole alignment without deck ranges', () => {
    const all = corridorAround(alignment, [], { halfWidth: 5, margin: 0 });
    const end = alignment.evaluateHorizontal(alignment.length - 0.5).point;
    expect(all.contains(end.x, end.y)).toBe(true);
  });
});

describe('clipTin', () => {
  const corridor = corridorAround(alignment, [{ sFrom: 60, sTo: 100 }], {
    halfWidth: 20,
    margin: 10,
  });
  const clipped = clipTin(surface(), corridor, origin);

  it('keeps triangles with centroids in the corridor in local millimetre coordinates', () => {
    expect(clipped).toBeDefined();
    const pts = clipped?.points ?? [];
    for (const v of pts) expect(Math.round(v * 1000) / 1000).toBe(v);
    const tri = clipped?.triangles ?? [];
    expect(Math.max(...tri)).toBe(pts.length / 3 - 1);
    for (let k = 0; k < tri.length; k += 3) {
      const c = [0, 1].map(
        (o) =>
          ((pts[3 * (tri[k] as number) + o] as number) +
            (pts[3 * (tri[k + 1] as number) + o] as number) +
            (pts[3 * (tri[k + 2] as number) + o] as number)) /
          3,
      ) as [number, number];
      expect(corridor.contains(...c)).toBe(true);
    }
  });

  it('keeps the terrain heights (rounded to mm)', () => {
    const tin = terrainTin(clipped as NonNullable<typeof clipped>);
    const p = alignment.evaluateHorizontal(80).point;
    expect(Math.abs((tin.elevationAt(p.x, p.y) ?? 0) - plane(p.x, p.y))).toBeLessThan(0.001);
  });

  it('is undefined when nothing lies in the corridor and deterministic otherwise', () => {
    const far = corridorAround(alignment, [{ sFrom: 400, sTo: 430 }], { halfWidth: 5, margin: 0 });
    expect(clipTin(surface(), far, origin)).toBeUndefined();
    expect(clipTin(surface(), corridor, origin)).toEqual(clipped);
  });
});

describe('clipGrid / deckRanges', () => {
  it('stores raster cells in the corridor as row runs with a local origin', () => {
    const start = alignment.evaluateHorizontal(0).point;
    const width = 120;
    const height = 120;
    const raster: Raster = {
      x0: start.x - 60 + origin.x,
      y0: start.y - 60 + origin.y,
      dx: 1,
      dy: 1,
      width,
      height,
      z: Float64Array.from({ length: width * height }, (_, k) =>
        k % 997 === 0
          ? -9999
          : plane(start.x - 60 + (k % width), start.y - 60 + Math.floor(k / width)),
      ),
      nodata: -9999,
    };
    const corridor = corridorAround(alignment, [{ sFrom: 10, sTo: 30 }], {
      halfWidth: 8,
      margin: 5,
    });
    const grid = clipGrid(raster, corridor, origin);
    expect(grid?.kind).toBe('grid');
    expect(Math.min(...(grid?.runs.map((r) => r.row) ?? []))).toBe(0);
    expect(Math.min(...(grid?.runs.map((r) => r.col) ?? []))).toBe(0);
    for (const r of grid?.runs ?? []) {
      r.z.forEach((z, k) => {
        const x = (grid?.x0 ?? 0) + (r.col + k) * 1;
        const y = (grid?.y0 ?? 0) + r.row * 1;
        expect(corridor.contains(x, y)).toBe(true);
        expect(z).toBeCloseTo(plane(x, y), 3);
      });
    }
  });

  it('finds the deck ranges on the alignment', () => {
    const axis = {
      id: 'ax',
      name: 'Os',
      alignment: alignment.name,
      horizontalOffset: { kind: 'constant' as const, value: '0' },
      verticalOffset: { kind: 'constant' as const, value: '0' },
    };
    const deck = {
      id: 'nk',
      name: 'NK',
      bridgeAxis: 'ax',
      from: 1050,
      to: 1100,
      profile: 'p',
      parameterLaws: {},
      orientation: 'vertical' as const,
    };
    expect(deckRanges(alignment, [deck], [axis])).toEqual([{ sFrom: 50, sTo: 100 }]);
    expect(deckRanges(alignment, [deck], [{ ...axis, alignment: 'iná' }])).toEqual([]);
  });
});
