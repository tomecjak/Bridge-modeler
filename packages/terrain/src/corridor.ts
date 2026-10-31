import type { Alignment } from '@bridge/alignment';
import type { Vec2, Vec3 } from '@bridge/geom';
import type { BridgeAxis, StudyArea, Superstructure, TerrainData } from '@bridge/model';
import type { ParsedSurface } from './landxml.ts';
import type { Bounds2 } from './tin.ts';

export interface CorridorOptions {
  /** pol šírky pásu okolo osi cesty [m] */
  halfWidth: number;
  /** presah za koniec NK v osi [m] */
  margin: number;
}

export const DEFAULT_CORRIDOR: CorridorOptions = { halfWidth: 60, margin: 50 };

/** Krok vzorkovania osi pre koridor [m]. */
const STEP = 2;

export interface Corridor {
  /** bod v lokálnych súradniciach leží v koridore */
  contains(x: number, y: number): boolean;
  /** obálka koridoru v lokálnych súradniciach */
  bounds: Bounds2;
}

/** Rozsahy NK na osi cesty v spojitom staničení (podľa osí mosta, ktoré na nej ležia). */
export function deckRanges(
  alignment: Alignment,
  superstructures: readonly Superstructure[],
  bridgeAxes: readonly BridgeAxis[],
): { sFrom: number; sTo: number }[] {
  return superstructures.flatMap((sup) => {
    const axis = bridgeAxes.find((a) => a.id === sup.bridgeAxis);
    if (axis?.alignment !== alignment.name) return [];
    const sFrom = alignment.stationing.fromDisplay(sup.from);
    const sTo = alignment.stationing.fromDisplay(sup.to);
    return sFrom === undefined || sTo === undefined ? [] : [{ sFrom, sTo }];
  });
}

/** Oblasť mosta (Fáza 10a) na osi cesty v spojitom staničení; prázdne, ak nie je alebo leží na inej osi. */
export function studyRanges(
  alignment: Alignment,
  studyArea: StudyArea | null,
): { sFrom: number; sTo: number }[] {
  if (studyArea?.alignment !== alignment.name) return [];
  const a = alignment.stationing.fromDisplay(studyArea.from);
  const b = alignment.stationing.fromDisplay(studyArea.to);
  return a === undefined || b === undefined ? [] : [{ sFrom: Math.min(a, b), sTo: Math.max(a, b) }];
}

/** Rozsahy, okolo ktorých sa orezáva terén: NK na osi cesty, inak oblasť mosta; prázdne = celá os. */
export function bridgeRanges(
  alignment: Alignment,
  superstructures: readonly Superstructure[],
  bridgeAxes: readonly BridgeAxis[],
  studyArea: StudyArea | null,
): { sFrom: number; sTo: number }[] {
  const decks = deckRanges(alignment, superstructures, bridgeAxes);
  return decks.length > 0 ? decks : studyRanges(alignment, studyArea);
}

/**
 * Koridor (ADR 0011): pás `halfWidth` okolo osi cesty v rozsahoch NK ± `margin`; bez rozsahov celá os.
 * Os sa nahradí polyline s krokom 2 m; bod je v koridore, ak je od niektorej úsečky ďalej najviac `halfWidth`
 * (za krajnými bodmi rozsahu sa koridor kolmo uzatvára).
 */
export function corridorAround(
  alignment: Alignment,
  ranges: readonly { sFrom: number; sTo: number }[],
  options: CorridorOptions = DEFAULT_CORRIDOR,
): Corridor {
  const spans = (ranges.length > 0 ? ranges : [{ sFrom: 0, sTo: alignment.length }]).map((r) => ({
    from: Math.max(0, Math.min(r.sFrom, r.sTo) - options.margin),
    to: Math.min(alignment.length, Math.max(r.sFrom, r.sTo) + options.margin),
  }));
  const segments: { a: Vec2; b: Vec2; first: boolean; last: boolean }[] = [];
  for (const { from, to } of spans) {
    const n = Math.max(1, Math.ceil((to - from) / STEP));
    const pts = Array.from({ length: n + 1 }, (_, k) =>
      alignment.evaluateHorizontal(from + ((to - from) * k) / n),
    ).map((h) => h.point);
    for (let k = 0; k < n; k++) {
      segments.push({
        a: pts[k] as Vec2,
        b: pts[k + 1] as Vec2,
        first: k === 0,
        last: k === n - 1,
      });
    }
  }

  const w = options.halfWidth;
  const bounds: Bounds2 = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const { a, b } of segments) {
    for (const p of [a, b]) {
      bounds.minX = Math.min(bounds.minX, p.x - w);
      bounds.minY = Math.min(bounds.minY, p.y - w);
      bounds.maxX = Math.max(bounds.maxX, p.x + w);
      bounds.maxY = Math.max(bounds.maxY, p.y + w);
    }
  }
  // hash buniek veľkosti `halfWidth` → úsečky, ktorých obálka (zväčšená o `halfWidth`) do bunky zasahuje
  const size = Math.max(w, STEP);
  const cells = new Map<string, number[]>();
  const key = (i: number, j: number) => `${i}:${j}`;
  segments.forEach(({ a, b }, k) => {
    const i0 = Math.floor((Math.min(a.x, b.x) - w) / size);
    const i1 = Math.floor((Math.max(a.x, b.x) + w) / size);
    const j0 = Math.floor((Math.min(a.y, b.y) - w) / size);
    const j1 = Math.floor((Math.max(a.y, b.y) + w) / size);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const list = cells.get(key(i, j));
        if (list) list.push(k);
        else cells.set(key(i, j), [k]);
      }
    }
  });

  function contains(x: number, y: number): boolean {
    if (x < bounds.minX || y < bounds.minY || x > bounds.maxX || y > bounds.maxY) return false;
    // najbližšia úsečka; za koncom rozsahu (pred prvou / za poslednou) je bod mimo koridoru
    let best = Infinity;
    let outside = false;
    for (const k of cells.get(key(Math.floor(x / size), Math.floor(y / size))) ?? []) {
      const { a, b, first, last } = segments[k] as (typeof segments)[number];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const t = len2 > 0 ? ((x - a.x) * dx + (y - a.y) * dy) / len2 : 0;
      const tc = Math.max(0, Math.min(1, t));
      const d = Math.hypot(x - a.x - tc * dx, y - a.y - tc * dy);
      if (d < best) {
        best = d;
        outside = (first && t < 0) || (last && t > 1);
      }
    }
    return best <= w && !outside;
  }

  return { contains, bounds };
}

/**
 * Obdĺžnik zarovnaný na osi E/N okolo mosta (ADR 0011, doplnok): obálka osi cesty v rozsahoch NK ± `margin`
 * zväčšená o `margin` na všetky strany a zaokrúhlená na celé metre (bunky DMR, okraje mapy). Bez rozsahov celá os.
 */
export function rectangleAround(
  alignment: Alignment,
  ranges: readonly { sFrom: number; sTo: number }[],
  margin: number,
): Corridor {
  const spans = (ranges.length > 0 ? ranges : [{ sFrom: 0, sTo: alignment.length }]).map((r) => ({
    from: Math.max(0, Math.min(r.sFrom, r.sTo) - margin),
    to: Math.min(alignment.length, Math.max(r.sFrom, r.sTo) + margin),
  }));
  const b: Bounds2 = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const { from, to } of spans) {
    const n = Math.max(1, Math.ceil((to - from) / STEP));
    for (let k = 0; k <= n; k++) {
      const p = alignment.evaluateHorizontal(from + ((to - from) * k) / n).point;
      b.minX = Math.min(b.minX, p.x);
      b.minY = Math.min(b.minY, p.y);
      b.maxX = Math.max(b.maxX, p.x);
      b.maxY = Math.max(b.maxY, p.y);
    }
  }
  const bounds: Bounds2 = {
    minX: Math.floor(b.minX - margin),
    minY: Math.floor(b.minY - margin),
    maxX: Math.ceil(b.maxX + margin),
    maxY: Math.ceil(b.maxY + margin),
  };
  return {
    bounds,
    contains: (x, y) =>
      x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY,
  };
}

const mm = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Oreže TIN na koridor: ponechá trojuholníky s ťažiskom v koridore, body prevedie do lokálnych súradníc
 * (zaokrúhlené na mm) a zachová ich poradie zo súboru. `undefined`, ak v koridore nič nie je.
 */
export function clipTin(
  surface: ParsedSurface,
  corridor: Corridor,
  origin: Vec3,
): Extract<TerrainData, { kind: 'tin' }> | undefined {
  const p = surface.points;
  const t = surface.triangles;
  const used = new Uint8Array(p.length / 3);
  const kept: number[] = [];
  for (let k = 0; k < t.length; k += 3) {
    const a = 3 * (t[k] as number);
    const b = 3 * (t[k + 1] as number);
    const c = 3 * (t[k + 2] as number);
    const x = ((p[a] as number) + (p[b] as number) + (p[c] as number)) / 3 - origin.x;
    const y = ((p[a + 1] as number) + (p[b + 1] as number) + (p[c + 1] as number)) / 3 - origin.y;
    if (!corridor.contains(x, y)) continue;
    kept.push(t[k] as number, t[k + 1] as number, t[k + 2] as number);
    used[t[k] as number] = 1;
    used[t[k + 1] as number] = 1;
    used[t[k + 2] as number] = 1;
  }
  if (kept.length === 0) return undefined;
  const remap = new Int32Array(used.length).fill(-1);
  const points: number[] = [];
  for (let i = 0; i < used.length; i++) {
    if (!used[i]) continue;
    remap[i] = points.length / 3;
    points.push(
      mm((p[3 * i] as number) - origin.x),
      mm((p[3 * i + 1] as number) - origin.y),
      mm((p[3 * i + 2] as number) - origin.z),
    );
  }
  return { kind: 'tin', points, triangles: kept.map((i) => remap[i] as number) };
}

/** Raster výšok v EPSG:5514: stred bunky (0, 0), krok, riadky rastú na sever. */
export interface Raster {
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  width: number;
  height: number;
  /** výšky po riadkoch (riadok 0 = najjužnejší) */
  z: ArrayLike<number>;
  nodata?: number | undefined;
}

/**
 * Oreže raster na koridor (ADR 0011): bunky so stredom v koridore a s platnou výškou ako úseky riadkov;
 * pôvod sa posunie na prvú použitú bunku, súradnice lokálne a zaokrúhlené na mm.
 */
export function clipGrid(
  raster: Raster,
  corridor: Corridor,
  origin: Vec3,
): Extract<TerrainData, { kind: 'grid' }> | undefined {
  const runs: { row: number; col: number; z: number[] }[] = [];
  for (let row = 0; row < raster.height; row++) {
    const y = raster.y0 + row * raster.dy - origin.y;
    let run: { row: number; col: number; z: number[] } | undefined;
    for (let col = 0; col < raster.width; col++) {
      const z = raster.z[row * raster.width + col] as number;
      const x = raster.x0 + col * raster.dx - origin.x;
      const valid = Number.isFinite(z) && z !== raster.nodata && corridor.contains(x, y);
      if (!valid) {
        run = undefined;
        continue;
      }
      if (!run) {
        run = { row, col, z: [] };
        runs.push(run);
      }
      run.z.push(mm(z - origin.z));
    }
  }
  if (runs.length === 0) return undefined;
  const row0 = Math.min(...runs.map((r) => r.row));
  const col0 = Math.min(...runs.map((r) => r.col));
  return {
    kind: 'grid',
    x0: mm(raster.x0 + col0 * raster.dx - origin.x),
    y0: mm(raster.y0 + row0 * raster.dy - origin.y),
    dx: raster.dx,
    dy: raster.dy,
    runs: runs.map((r) => ({ row: r.row - row0, col: r.col - col0, z: r.z })),
  };
}
