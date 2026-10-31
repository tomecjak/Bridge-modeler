import type { TerrainData } from '@bridge/model';
import { describe, expect, it } from 'vitest';
import { createTin, gridToTin, terrainTin } from './tin.ts';

const plane = (x: number, y: number) => 250 + 0.02 * x - 0.035 * y;

/** Nepravidelný TIN: mriežka n × n bodov s posunutými vnútornými bodmi, z na rovine. */
function jitteredTin(n: number, step = 5) {
  const points: number[] = [];
  let seed = 3;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647 - 0.5;
  };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const inner = i > 0 && j > 0 && i < n - 1 && j < n - 1;
      const x = i * step + (inner ? rnd() * step * 0.6 : 0);
      const y = j * step + (inner ? rnd() * step * 0.6 : 0);
      points.push(x, y, plane(x, y));
    }
  }
  const triangles: number[] = [];
  for (let j = 0; j + 1 < n; j++) {
    for (let i = 0; i + 1 < n; i++) {
      const a = j * n + i;
      triangles.push(a, a + 1, a + n + 1, a, a + n + 1, a + n);
    }
  }
  return { points, triangles };
}

describe('createTin — výška v bode', () => {
  const { points, triangles } = jitteredTin(30);
  const tin = createTin(points, triangles);

  it('interpolates a plane exactly anywhere inside', () => {
    for (const [x, y] of [
      [1, 1],
      [72.3, 41.9],
      [144.9, 0.1],
      [17.5, 133.3],
    ] as const) {
      expect(tin.elevationAt(x, y)).toBeCloseTo(plane(x, y), 9);
    }
  });

  it('returns the vertex height on a vertex and a value on an edge', () => {
    expect(tin.elevationAt(points[0] as number, points[1] as number)).toBeCloseTo(plane(0, 0), 9);
    expect(tin.elevationAt(145, 70)).toBeCloseTo(plane(145, 70), 9);
  });

  it('returns undefined outside the surface', () => {
    expect(tin.elevationAt(-0.01, 10)).toBeUndefined();
    expect(tin.elevationAt(10, 145.01)).toBeUndefined();
    expect(tin.elevationAt(1e6, 1e6)).toBeUndefined();
  });

  it('reports bounds and candidate triangles of a rectangle', () => {
    expect(tin.bounds).toEqual({ minX: 0, minY: 0, maxX: 145, maxY: 145 });
    const found = [...tin.candidates(10, 10, 12, 12)];
    expect(found.length).toBeGreaterThan(0);
    expect(found.length).toBeLessThan(triangles.length / 3);
  });

  it('builds the index for 100 000 triangles quickly', () => {
    const big = jitteredTin(225, 1);
    // najlepší z 3 behov: krátka záťaž počítača test nezhodí
    const elapsed = Math.min(
      ...[0, 1, 2].map(() => {
        const start = Date.now();
        const t = createTin(big.points, big.triangles);
        for (let k = 0; k < 10000; k++) t.elevationAt((k * 7.3) % 224, (k * 3.1) % 224);
        return Date.now() - start;
      }),
    );
    expect(elapsed).toBeLessThan(1000);
  });
});

describe('gridToTin — mriežka rastra', () => {
  // 4 × 3 bunky, stred [0, 0] v (100, 200), krok 2 m × 1 m; bunka [1, 2] chýba (nodata)
  const z = (row: number, col: number) => plane(100 + col * 2, 200 + row);
  const grid: Extract<TerrainData, { kind: 'grid' }> = {
    kind: 'grid',
    x0: 100,
    y0: 200,
    dx: 2,
    dy: 1,
    runs: [
      { row: 0, col: 0, z: [0, 1, 2, 3].map((c) => z(0, c)) },
      { row: 1, col: 0, z: [0, 1].map((c) => z(1, c)) },
      { row: 1, col: 3, z: [z(1, 3)] },
      { row: 2, col: 0, z: [0, 1, 2, 3].map((c) => z(2, c)) },
    ],
  };

  it('triangulates complete cells with a fixed diagonal', () => {
    const { points, triangles } = gridToTin(grid);
    expect(points.length / 3).toBe(11);
    // úplné sú len bunky v stĺpci 0 (riadky 0–1 a 1–2); bunky okolo chýbajúceho bodu odpadnú
    expect(triangles.length / 3).toBe(4);
  });

  it('gives the same plane heights as the raster and a hole around missing cells', () => {
    const tin = terrainTin(grid);
    expect(tin.elevationAt(101, 200.5)).toBeCloseTo(plane(101, 200.5), 9);
    expect(tin.elevationAt(101.5, 201.7)).toBeCloseTo(plane(101.5, 201.7), 9);
    expect(tin.elevationAt(104, 201)).toBeUndefined();
  });

  it('reads TIN terrain data directly', () => {
    const tin = terrainTin({
      kind: 'tin',
      points: [0, 0, 1, 10, 0, 2, 0, 10, 3],
      triangles: [0, 1, 2],
    });
    expect(tin.elevationAt(5, 0)).toBeCloseTo(1.5, 12);
  });
});
