import type { Raster } from './corridor.ts';
import type { TerrainIssue } from './issues.ts';
import type { Bounds2 } from './tin.ts';

/**
 * DMR 5.0 zo služby ZBGIS (ÚGKK SR, CC BY 4.0, ADR 0011): ArcGIS MapServer, vrstva 3 = výšky, vrstva 0 = pokrytie LLS.
 * Výrez rastra služba neposkytuje, výšky sa pýtajú po bodoch (`identify`, multipoint) — postup prevzatý
 * z nástroja Mini-IFC-tools (tomecjak).
 */
export const ZBGIS_DMR_URL = 'https://zbgis.skgeodesy.sk/zbgis/rest/services/LLS_DMR5/MapServer';
export const ZBGIS_DMR_ATTRIBUTION = 'DMR 5.0 © ÚGKK SR, CC BY 4.0';
const DMR_LAYER = 3;
const COVER_LAYER = 0;

export interface HttpResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

/** Podmnožina `fetch` (balíky nemajú DOM typy; testy používajú falošný server). */
export type FetchLike = (
  url: string,
  init?: { method?: string; body?: string; headers?: Record<string, string> },
) => Promise<HttpResponse>;

export interface DmrDownloadOptions {
  fetch: FetchLike;
  /** krok mriežky [m]; DMR 5.0 má bunky 1 m */
  step?: number;
  /** najviac bodov na jeden výrez — nad limitom sa krok zväčší */
  maxPoints?: number;
  /** bodov v jednej dávke `identify` a počet súbežných dávok (ako Mini-IFC-tools) */
  batch?: number;
  concurrency?: number;
  url?: string;
  onProgress?: (done: number, total: number) => void;
  /** zrušenie medzi dávkami */
  isCancelled?: () => boolean;
}

type Rings = number[][][];

/**
 * Stiahne výšky DMR 5.0 v obálke `bounds` (EPSG:5514) pre body, pre ktoré `contains` (EPSG:5514) platí.
 * Mriežka leží v stredoch buniek DMR (x.5 pri kroku 1 m); body mimo pokrytia LLS sa neposielajú.
 * Výsledok je raster s riadkami od juhu, bez dát = NaN. Nič nevyhadzuje.
 */
export async function downloadDmr(
  bounds: Bounds2,
  contains: (x: number, y: number) => boolean,
  options: DmrDownloadOptions,
): Promise<{ raster?: Raster; issues: TerrainIssue[] }> {
  const url = options.url ?? ZBGIS_DMR_URL;
  const batch = options.batch ?? 2000;
  const fail = (issue: TerrainIssue) => ({ issues: [issue] });
  try {
    const rings = await coverage(options.fetch, url, bounds);
    if (rings && rings.length === 0) return fail({ severity: 'error', code: 'OutsideCoverage' });

    // krok mriežky: bunky DMR (1 m), pri veľkom výreze väčší
    let step = Math.max(1, Math.round(options.step ?? 1));
    let grid = makeGrid(bounds, step, contains, rings);
    while (grid.points.length > (options.maxPoints ?? 120_000)) {
      step += 1;
      grid = makeGrid(bounds, step, contains, rings);
    }
    if (grid.points.length === 0) return fail({ severity: 'error', code: 'OutsideCoverage' });

    const { raster, points } = grid;
    const z = raster.z as Float64Array;
    const queue: [number, number][] = [];
    for (let o = 0; o < points.length; o += batch)
      queue.push([o, Math.min(points.length, o + batch)]);
    let done = 0;
    const worker = async (): Promise<void> => {
      for (let q = queue.shift(); q; q = queue.shift()) {
        // služba skončí dávku pri prvom bode bez dát → pokračuje sa za ním (obmedzený počet opakovaní)
        let from = q[0];
        let retries = 60;
        while (from < q[1] && retries-- > 0) {
          if (options.isCancelled?.()) throw new CancelledError();
          const part = points.slice(from, q[1]);
          const values = await identify(options.fetch, url, part);
          let p = 0;
          for (const r of values) {
            while (p < part.length && !near(part[p] as GridPoint, r)) p++;
            if (p >= part.length) break;
            z[(part[p] as GridPoint).index] = r.z;
            p++;
          }
          const advance = p >= part.length ? part.length : p + 1;
          done += advance;
          options.onProgress?.(Math.min(done, points.length), points.length);
          from += advance;
        }
      }
    };
    await Promise.all(Array.from({ length: options.concurrency ?? 4 }, worker));
    if (!z.some((v) => Number.isFinite(v))) return fail({ severity: 'error', code: 'NoData' });
    return { raster, issues: [] };
  } catch (e) {
    if (e instanceof CancelledError) return fail({ severity: 'error', code: 'Cancelled' });
    return fail({
      severity: 'error',
      code: 'ServiceUnavailable',
      detail: e instanceof Error ? e.message : String(e),
    });
  }
}

class CancelledError extends Error {}

interface GridPoint {
  x: number;
  y: number;
  /** index bunky v rastri */
  index: number;
}

function makeGrid(
  b: Bounds2,
  step: number,
  contains: (x: number, y: number) => boolean,
  rings: Rings | undefined,
): { raster: Raster; points: GridPoint[] } {
  const x0 = Math.floor(b.minX) + 0.5;
  const y0 = Math.floor(b.minY) + 0.5;
  const width = Math.max(1, Math.floor((b.maxX - x0) / step) + 1);
  const height = Math.max(1, Math.floor((b.maxY - y0) / step) + 1);
  const z = new Float64Array(width * height).fill(Number.NaN);
  const points: GridPoint[] = [];
  for (let row = 0; row < height; row++) {
    const y = y0 + row * step;
    for (let col = 0; col < width; col++) {
      const x = x0 + col * step;
      if (!contains(x, y) || (rings && !inRings(rings, x, y))) continue;
      points.push({ x, y, index: row * width + col });
    }
  }
  return { raster: { x0, y0, dx: step, dy: step, width, height, z, nodata: undefined }, points };
}

const near = (p: GridPoint, r: { x: number; y: number }) =>
  Math.abs(p.x - r.x) <= 0.01 && Math.abs(p.y - r.y) <= 0.01;

/** Polygóny pokrytia LLS v obálke; `undefined`, ak sa nedajú zistiť (filtrovanie sa vynechá). */
async function coverage(fetch: FetchLike, url: string, b: Bounds2): Promise<Rings | undefined> {
  const q =
    `${url}/${COVER_LAYER}/query?geometry=${[b.minX, b.minY, b.maxX, b.maxY].map((v) => v.toFixed(3)).join(',')}` +
    '&geometryType=esriGeometryEnvelope&inSR=5514&outSR=5514&spatialRel=esriSpatialRelIntersects' +
    '&returnGeometry=true&outFields=OBJECTID&maxAllowableOffset=1&f=json';
  try {
    const r = await fetch(q);
    if (!r.ok) return undefined;
    const d = (await r.json()) as { features?: { geometry?: { rings?: Rings } }[] };
    if (!d.features) return undefined;
    return d.features.flatMap((f) => f.geometry?.rings ?? []);
  } catch {
    return undefined;
  }
}

/** Jedna dávka `identify`: výšky bodov v poradí, v akom ich služba vrátila (s polohou). */
async function identify(
  fetch: FetchLike,
  url: string,
  pts: readonly GridPoint[],
): Promise<{ x: number; y: number; z: number }[]> {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const extent = [
    Math.min(...xs) - 1,
    Math.min(...ys) - 1,
    Math.max(...xs) + 1,
    Math.max(...ys) + 1,
  ];
  const body =
    `geometry=${encodeURIComponent(JSON.stringify({ points: pts.map((p) => [+p.x.toFixed(3), +p.y.toFixed(3)]) }))}` +
    `&geometryType=esriGeometryMultipoint&sr=5514&layers=all:${DMR_LAYER}&tolerance=0` +
    `&mapExtent=${extent.map((v) => v.toFixed(3)).join(',')}&imageDisplay=1000,1000,96&returnGeometry=true&f=json`;
  const r = await fetch(`${url}/identify`, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = (await r.json()) as {
    error?: { message?: string };
    results?: { geometry?: { x: number; y: number }; attributes?: Record<string, string> }[];
  };
  if (d.error) throw new Error(d.error.message ?? 'chyba služby');
  return (d.results ?? []).flatMap((res) => {
    const g = res.geometry;
    if (!g) return [];
    const a = res.attributes ?? {};
    const v = Number.parseFloat(a['Stretch.Pixel Value'] ?? a['Pixel Value'] ?? '');
    return [{ x: g.x, y: g.y, z: Number.isFinite(v) ? v : Number.NaN }];
  });
}

/** Leží bod v polygónoch (pravidlo párnosti cez všetky prstence)? */
function inRings(rings: Rings, x: number, y: number): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i] as number[];
      const c = ring[j] as number[];
      const ay = a[1] as number;
      const cy = c[1] as number;
      if (ay > y !== cy > y) {
        const ax = a[0] as number;
        const cx = c[0] as number;
        if (x < ((cx - ax) * (y - ay)) / (cy - ay) + ax) inside = !inside;
      }
    }
  }
  return inside;
}
