import type { TerrainData } from '@bridge/model';

export interface Bounds2 {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Nepravidelná trojuholníková sieť terénu (ADR 0011) v lokálnych súradniciach s priestorovým indexom.
 * Výška je lineárna na trojuholníku; mimo povrchu `undefined`.
 */
export interface Tin {
  /** body x, y, z za sebou */
  readonly points: Float64Array;
  /** trojice indexov bodov */
  readonly triangles: Uint32Array;
  readonly bounds: Bounds2;
  elevationAt(x: number, y: number): number | undefined;
  /** indexy trojuholníkov, ktorých obálka môže zasahovať do obdĺžnika (bez duplicít) */
  candidates(minX: number, minY: number, maxX: number, maxY: number): Iterable<number>;
}

/** Relatívna tolerancia barycentrických súradníc (bod na hrane patrí obom trojuholníkom). */
const EPS = 1e-9;

export function createTin(points: ArrayLike<number>, triangles: ArrayLike<number>): Tin {
  const p = Float64Array.from(points);
  const t = Uint32Array.from(triangles);
  const nt = t.length / 3;
  const bounds: Bounds2 = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (let k = 0; k < t.length; k++) {
    const i = 3 * (t[k] as number);
    const x = p[i] as number;
    const y = p[i + 1] as number;
    if (x < bounds.minX) bounds.minX = x;
    if (y < bounds.minY) bounds.minY = y;
    if (x > bounds.maxX) bounds.maxX = x;
    if (y > bounds.maxY) bounds.maxY = y;
  }

  // pravidelná mriežka buniek ≈ 2 trojuholníky na bunku; bunka → trojuholníky (CSR polia)
  const w = Math.max(bounds.maxX - bounds.minX, 1e-9);
  const h = Math.max(bounds.maxY - bounds.minY, 1e-9);
  const cell = Math.sqrt((w * h) / Math.max(nt / 2, 1));
  const nx = Math.max(1, Math.min(4096, Math.ceil(w / cell)));
  const ny = Math.max(1, Math.min(4096, Math.ceil(h / cell)));
  const cx = (x: number) => Math.min(nx - 1, Math.max(0, Math.floor(((x - bounds.minX) / w) * nx)));
  const cy = (y: number) => Math.min(ny - 1, Math.max(0, Math.floor(((y - bounds.minY) / h) * ny)));
  const box = (k: number) => {
    const a = 3 * (t[3 * k] as number);
    const b = 3 * (t[3 * k + 1] as number);
    const c = 3 * (t[3 * k + 2] as number);
    const xs = [p[a] as number, p[b] as number, p[c] as number];
    const ys = [p[a + 1] as number, p[b + 1] as number, p[c + 1] as number];
    return [
      cx(Math.min(...xs)),
      cy(Math.min(...ys)),
      cx(Math.max(...xs)),
      cy(Math.max(...ys)),
    ] as const;
  };
  const counts = new Uint32Array(nx * ny + 1);
  for (let k = 0; k < nt; k++) {
    const [i0, j0, i1, j1] = box(k);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const c = j * nx + i + 1;
        counts[c] = (counts[c] as number) + 1;
      }
    }
  }
  for (let c = 1; c < counts.length; c++)
    counts[c] = (counts[c] as number) + (counts[c - 1] as number);
  const items = new Uint32Array(counts[nx * ny] as number);
  const fill = counts.slice(0, nx * ny);
  for (let k = 0; k < nt; k++) {
    const [i0, j0, i1, j1] = box(k);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const c = j * nx + i;
        items[fill[c] as number] = k;
        fill[c] = (fill[c] as number) + 1;
      }
    }
  }

  function* candidates(minX: number, minY: number, maxX: number, maxY: number): Iterable<number> {
    if (maxX < bounds.minX || maxY < bounds.minY || minX > bounds.maxX || minY > bounds.maxY)
      return;
    const seen = new Set<number>();
    for (let j = cy(minY); j <= cy(maxY); j++) {
      for (let i = cx(minX); i <= cx(maxX); i++) {
        const c = j * nx + i;
        for (let q = counts[c] as number; q < (counts[c + 1] as number); q++) {
          const k = items[q] as number;
          if (seen.has(k)) continue;
          seen.add(k);
          yield k;
        }
      }
    }
  }

  function elevationAt(x: number, y: number): number | undefined {
    if (x < bounds.minX || y < bounds.minY || x > bounds.maxX || y > bounds.maxY) return undefined;
    const c = cy(y) * nx + cx(x);
    for (let q = counts[c] as number; q < (counts[c + 1] as number); q++) {
      const z = triangleElevation(p, t, items[q] as number, x, y);
      if (z !== undefined) return z;
    }
    return undefined;
  }

  return { points: p, triangles: t, bounds, elevationAt, candidates };
}

/** Výška v bode trojuholníka `k` (barycentricky), `undefined` mimo neho. */
export function triangleElevation(
  p: Float64Array,
  t: Uint32Array,
  k: number,
  x: number,
  y: number,
): number | undefined {
  const a = 3 * (t[3 * k] as number);
  const b = 3 * (t[3 * k + 1] as number);
  const c = 3 * (t[3 * k + 2] as number);
  const ax = p[a] as number;
  const ay = p[a + 1] as number;
  const bx = (p[b] as number) - ax;
  const by = (p[b + 1] as number) - ay;
  const qx = (p[c] as number) - ax;
  const qy = (p[c + 1] as number) - ay;
  const det = bx * qy - by * qx;
  if (det === 0) return undefined;
  const px = x - ax;
  const py = y - ay;
  const u = (px * qy - py * qx) / det;
  const v = (bx * py - by * px) / det;
  if (u < -EPS || v < -EPS || u + v > 1 + EPS) return undefined;
  const za = p[a + 2] as number;
  return za + u * ((p[b + 2] as number) - za) + v * ((p[c + 2] as number) - za);
}

/**
 * Mriežka rastra → TIN: bod v strede každej bunky s výškou, dva trojuholníky na každú úplnú štvoricu bodov
 * s uhlopriečkou z ľavého dolného do pravého horného rohu (ADR 0011). Poradie bodov podľa úsekov riadkov.
 */
export function gridToTin(grid: Extract<TerrainData, { kind: 'grid' }>): {
  points: number[];
  triangles: number[];
} {
  const points: number[] = [];
  const index = new Map<string, number>();
  for (const run of grid.runs) {
    run.z.forEach((z, k) => {
      const col = run.col + k;
      index.set(`${run.row}:${col}`, points.length / 3);
      points.push(grid.x0 + col * grid.dx, grid.y0 + run.row * grid.dy, z);
    });
  }
  const triangles: number[] = [];
  for (const run of grid.runs) {
    for (let k = 0; k < run.z.length; k++) {
      const r = run.row;
      const c = run.col + k;
      const ll = index.get(`${r}:${c}`);
      const lr = index.get(`${r}:${c + 1}`);
      const ul = index.get(`${r + 1}:${c}`);
      const ur = index.get(`${r + 1}:${c + 1}`);
      if (ll === undefined || lr === undefined || ul === undefined || ur === undefined) continue;
      triangles.push(ll, lr, ur, ll, ur, ul);
    }
  }
  return { points, triangles };
}

/** TIN z uložených dát terénu (TIN priamo, mriežka cez `gridToTin`). */
export function terrainTin(data: TerrainData): Tin {
  if (data.kind === 'tin') return createTin(data.points, data.triangles);
  const { points, triangles } = gridToTin(data);
  return createTin(points, triangles);
}
