import type { Alignment } from '@bridge/alignment';
import { type Polygon2D, pointInPolygon, type Vec2, vec2 } from '@bridge/geom';
import { type BridgeAxis, evaluateLaw, type ParameterSet } from '@bridge/model';
import type { SolidPart } from './abutment.ts';
import { highestCrossing, lowestCrossing } from './crossing.ts';
import type { DeckSamples } from './deckSampling.ts';
import type { BridgeAxisPoint, SuperstructureSection } from './superstructure.ts';

/** Bod osi mosta v pôdoryse so spojitým staničením osi cesty. */
export interface AxisLinePoint {
  s: number;
  point: Vec2;
}

/**
 * Os mosta v pôdoryse ako polyline (ADR 0007): bod osi cesty + vodorovný posun vpravo, s vrcholmi na stykoch prvkov
 * a krokom ≤ `step`. Rozsah sa oreže na os cesty; nevyhodnotiteľný posun sa berie ako 0.
 */
export function bridgeAxisPlan(
  axis: BridgeAxis,
  alignment: Alignment,
  parameters: ParameterSet,
  sFrom: number,
  sTo: number,
  step = 1,
): AxisLinePoint[] {
  const a = Math.max(0, sFrom);
  const b = Math.min(alignment.length, sTo);
  if (!(b > a)) return [];
  const keys = [a, b, ...alignment.elements.map((e) => e.sStart)]
    .filter((s) => s >= a && s <= b)
    .sort((p, q) => p - q);
  const stations: number[] = [];
  for (let i = 0; i + 1 < keys.length; i++) {
    const s0 = keys[i] as number;
    const s1 = keys[i + 1] as number;
    if (s1 - s0 < 1e-9) continue;
    const n = Math.max(1, Math.ceil((s1 - s0) / step));
    for (let k = 0; k < n; k++) stations.push(s0 + ((s1 - s0) * k) / n);
  }
  stations.push(b);
  return stations.map((s) => {
    const station = alignment.stationing.toDisplay(s).station;
    const values = parameters.evaluateAt(station).values;
    const h = evaluateLaw(axis.horizontalOffset, 'length', (n) => values.get(n), station);
    const offset = h.ok ? h.value : 0;
    const r = alignment.evaluateHorizontal(s);
    // vodorovná normála vpravo od smeru staničenia
    const point = vec2(
      r.point.x + offset * Math.cos(r.azimuth),
      r.point.y - offset * Math.sin(r.azimuth),
    );
    return { s, point };
  });
}

/** Rez časťou podpery v osi mosta: obrys v rovine rezu (x = staničenie s, y = lokálne z). */
export interface AxisCut {
  part: SolidPart['name'];
  outline: Polygon2D;
}

/**
 * Rozvinutý rez častí podpery zvislou plochou cez os mosta (Fáza 6, z parametrov, nie z 3D siete): úseky osi vnútri
 * pôdorysu časti → obrys v rovine rezu (x = staničenie s, y = lokálne z) z hornej a spodnej plochy časti. Plochy sa
 * vzorkujú vo vrcholoch osi a krokom ≤ `maxStep` [m].
 */
export function cutAlongAxis(
  parts: readonly SolidPart[],
  line: readonly AxisLinePoint[],
  maxStep = 0.5,
): AxisCut[] {
  if (line.length < 2) return [];
  const cum = [0];
  for (let i = 1; i < line.length; i++) {
    const p = (line[i - 1] as AxisLinePoint).point;
    const q = (line[i] as AxisLinePoint).point;
    cum.push((cum[i - 1] as number) + Math.hypot(q.x - p.x, q.y - p.y));
  }
  const at = (d: number): AxisLinePoint => {
    let i = 1;
    while (i < cum.length - 1 && (cum[i] as number) < d) i++;
    const c0 = cum[i - 1] as number;
    const c1 = cum[i] as number;
    const k = c1 > c0 ? Math.max(0, Math.min(1, (d - c0) / (c1 - c0))) : 0;
    const a = line[i - 1] as AxisLinePoint;
    const b = line[i] as AxisLinePoint;
    return {
      s: a.s + k * (b.s - a.s),
      point: vec2(a.point.x + k * (b.point.x - a.point.x), a.point.y + k * (b.point.y - a.point.y)),
    };
  };

  const out: AxisCut[] = [];
  for (const part of parts) {
    for (const [d0, d1] of insideIntervals(part.plan, line, cum)) {
      const ds = [d0, ...cum.filter((d) => d > d0 && d < d1), d1];
      const fine: number[] = [];
      for (let i = 0; i + 1 < ds.length; i++) {
        const a = ds[i] as number;
        const b = ds[i + 1] as number;
        const n = Math.max(1, Math.ceil((b - a) / maxStep));
        for (let k = 0; k < n; k++) fine.push(a + ((b - a) * k) / n);
      }
      fine.push(d1);
      const pts = fine.map(at);
      out.push({
        part: part.name,
        outline: [
          ...pts.map((p) => vec2(p.s, part.top(p.point))),
          ...[...pts].reverse().map((p) => vec2(p.s, part.bottom(p.point))),
        ],
      });
    }
  }
  return out;
}

/** Úseky polyline (vzdialenosť po nej od začiatku) vnútri mnohouholníka. */
function insideIntervals(
  poly: Polygon2D,
  line: readonly AxisLinePoint[],
  cum: readonly number[],
): [number, number][] {
  const intervals: [number, number][] = [];
  let open: number | undefined;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = (line[i] as AxisLinePoint).point;
    const b = (line[i + 1] as AxisLinePoint).point;
    const ts = [0, 1];
    for (let j = 0; j < poly.length; j++) {
      const t = segmentParameter(a, b, poly[j] as Vec2, poly[(j + 1) % poly.length] as Vec2);
      if (t !== undefined) ts.push(t);
    }
    ts.sort((p, q) => p - q);
    const d0 = cum[i] as number;
    const len = (cum[i + 1] as number) - d0;
    for (let k = 0; k + 1 < ts.length; k++) {
      const t0 = ts[k] as number;
      const t1 = ts[k + 1] as number;
      if (t1 - t0 < 1e-12) continue;
      const tm = (t0 + t1) / 2;
      const inside = pointInPolygon(vec2(a.x + tm * (b.x - a.x), a.y + tm * (b.y - a.y)), poly);
      if (inside && open === undefined) open = d0 + t0 * len;
      if (!inside && open !== undefined) {
        intervals.push([open, d0 + t0 * len]);
        open = undefined;
      }
    }
  }
  if (open !== undefined) intervals.push([open, cum[cum.length - 1] as number]);
  return intervals.filter(([p, q]) => q - p > 1e-6);
}

/** Parameter t ∈ [0, 1] priesečníka úsečky ab s úsečkou cd; `undefined` pri rovnobežných alebo bez priesečníka. */
function segmentParameter(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number | undefined {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-15) return undefined;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : undefined;
}

/** Rez NK v osi mosta: obrysy v rovine rezu (x = staničenie s, y = lokálne z). */
export interface DeckLongitudinal {
  /** vonkajší obrys (súvislé úseky, kde os mosta pretína prierez) */
  outer: Polygon2D[];
  /** dutiny pretnuté osou mosta */
  voids: Polygon2D[];
}

/**
 * Rozvinutý pozdĺžny rez NK v osi mosta (Fáza 6, z parametrov): v každej vzorke najvyšší a najnižší priesečník
 * zvislice x = 0 (referenčný bod) s vonkajšími obrysmi a zvlášť s každou dutinou; po sebe idúce vzorky tvoria obrys.
 * NK leží na osi presne v rozsahu od–do (koniec podľa opory sa v osi nemení).
 */
export function deckLongitudinal(samples: Pick<DeckSamples, 'sections'>): DeckLongitudinal {
  type Run = { last: number; top: Vec2[]; bottom: Vec2[] };
  const runs = new Map<string, Run[]>();
  const cut = (key: string, k: number, top?: Vec2, bottom?: Vec2) => {
    if (!top || !bottom || top.y - bottom.y < 1e-9) return;
    const list = runs.get(key) ?? [];
    runs.set(key, list);
    let run = list[list.length - 1];
    if (run?.last !== k - 1) {
      run = { last: k, top: [], bottom: [] };
      list.push(run);
    }
    run.last = k;
    run.top.push(top);
    run.bottom.push(bottom);
  };
  samples.sections.forEach((sec, k) => {
    if (!sec.axis) return;
    const z = (y: number | undefined) =>
      y === undefined ? undefined : vec2(sec.s, sec.toWorld(vec2(0, y)).z);
    const outer = sec.loops.filter((l) => l.role === 'outer').map((l) => l.polygon);
    cut('outer', k, z(highestCrossing(outer, 0)), z(lowestCrossing(outer, 0)));
    for (const l of sec.loops.filter((loop) => loop.role === 'void')) {
      cut(
        `void:${l.name}`,
        k,
        z(highestCrossing([l.polygon], 0)),
        z(lowestCrossing([l.polygon], 0)),
      );
    }
  });
  const outline = (r: Run): Polygon2D => [...r.top, ...[...r.bottom].reverse()];
  const result: DeckLongitudinal = { outer: [], voids: [] };
  for (const [key, list] of runs) {
    const polys = list.filter((r) => r.top.length >= 2).map(outline);
    if (key === 'outer') result.outer.push(...polys);
    else result.voids.push(...polys);
  }
  return result;
}

/** Okraj NK sa reže tesne dnu, aby bolo vidno čelo konzoly [m]. */
const EDGE_INSET = 1e-3;
/** Priesečník čiary bližšie k okraju ako táto hodnota sa posunie na okraj [m]. */
const EDGE_SNAP = 5e-3;
/** Najväčšia vzdialenosť priesečníka čiary s rovinou prierezu od osi mosta [m]. */
const CROSSING_REACH = 100;

interface CutValues {
  u: number;
  top: number;
  bottom: number;
  voids: Map<string, { top: number; bottom: number }>;
}

/**
 * Rozvinutý rez NK zvislou plochou cez ľubovoľnú čiaru v pôdoryse (Fáza 10b, z parametrov, ADR 0007): v každej vzorke
 * NK priesečník čiary s rovinou prierezu (os mosta + x · vodorovná normála), zvislica v odsadení x pretne vonkajšie
 * obrysy a dutiny. Konce NK sú šikmé roviny rovnobežné s osou krajnej opory ako v obryse NK (prierez sa za koncovú
 * rovinu predlžuje po dotyčnici); okraj NK sa reže 1 mm dnu. Výsledok v rovine rezu: x = u čiary, y = lokálne z.
 */
export function deckCutAlong(
  samples: Pick<DeckSamples, 'sections' | 'sFrom' | 'sTo' | 'endAngles'>,
  line: readonly { u: number; point: Vec2 }[],
): DeckLongitudinal {
  const sections = samples.sections.filter((s) => s.axis && s.loops.length > 0);
  const result: DeckLongitudinal = { outer: [], voids: [] };
  const first = sections[0];
  const last = sections[sections.length - 1];
  if (!first || !last || line.length < 2) return result;

  // úseky čiary v okolí NK (obdĺžnik okolo osi mosta s rezervou na šírku NK)
  const reach = Math.max(
    ...sections.flatMap((sec) => sec.loops.flatMap((l) => l.polygon.map((p) => Math.abs(p.x)))),
  );
  const pad = reach + 1;
  const xs = sections.map((sec) => sec.axis?.point.x ?? 0);
  const ys = sections.map((sec) => sec.axis?.point.y ?? 0);
  const box = {
    minX: Math.min(...xs) - pad,
    maxX: Math.max(...xs) + pad,
    minY: Math.min(...ys) - pad,
    maxY: Math.max(...ys) + pad,
  };
  const near: number[] = [];
  for (let i = 0; i + 1 < line.length; i++) {
    const a = (line[i] as (typeof line)[number]).point;
    const b = (line[i + 1] as (typeof line)[number]).point;
    if (Math.max(a.x, b.x) < box.minX || Math.min(a.x, b.x) > box.maxX) continue;
    if (Math.max(a.y, b.y) < box.minY || Math.min(a.y, b.y) > box.maxY) continue;
    near.push(i);
  }

  /** priesečník čiary s priamkou o + x · d najbližšie k o: dĺžka u a parameter x */
  const crossing = (o: Vec2, d: Vec2): { u: number; x: number } | undefined => {
    let best: { u: number; x: number } | undefined;
    for (const i of near) {
      const a = line[i] as (typeof line)[number];
      const b = line[i + 1] as (typeof line)[number];
      const ex = b.point.x - a.point.x;
      const ey = b.point.y - a.point.y;
      const den = ex * d.y - ey * d.x;
      if (Math.abs(den) < 1e-12) continue;
      const wx = o.x - a.point.x;
      const wy = o.y - a.point.y;
      const t = (wx * d.y - wy * d.x) / den;
      if (t < -1e-9 || t > 1 + 1e-9) continue;
      const x = (wx * ey - wy * ex) / den;
      if (Math.abs(x) > CROSSING_REACH) continue;
      if (!best || Math.abs(x) < Math.abs(best.x)) best = { u: a.u + t * (b.u - a.u), x };
    }
    return best;
  };

  const unit = (v: { x: number; y: number }) => {
    const n = Math.hypot(v.x, v.y);
    return vec2(v.x / n, v.y / n);
  };
  /** rez prierezom `sec` zvislicou v odsadení x; `dz` posun výšky (predĺženie za koncovú rovinu) */
  const cutAt = (
    sec: SuperstructureSection,
    x: number,
    u: number,
    dz = 0,
  ): CutValues | undefined => {
    const outer = sec.loops.filter((l) => l.role === 'outer').map((l) => l.polygon);
    const all = outer.flat();
    const xMin = Math.min(...all.map((p) => p.x));
    const xMax = Math.max(...all.map((p) => p.x));
    let xc = x;
    if (xc > xMax - EDGE_INSET && xc < xMax + EDGE_SNAP) xc = xMax - EDGE_INSET;
    if (xc < xMin + EDGE_INSET && xc > xMin - EDGE_SNAP) xc = xMin + EDGE_INSET;
    const top = highestCrossing(outer, xc);
    const bottom = lowestCrossing(outer, xc);
    if (top === undefined || bottom === undefined || top - bottom < 1e-9) return undefined;
    const z = (y: number) => sec.toWorld(vec2(xc, y)).z + dz;
    const voids = new Map<string, { top: number; bottom: number }>();
    for (const l of sec.loops.filter((loop) => loop.role === 'void')) {
      const vt = highestCrossing([l.polygon], xc);
      const vb = lowestCrossing([l.polygon], xc);
      if (vt !== undefined && vb !== undefined && vt - vb > 1e-9)
        voids.set(l.name, { top: z(vt), bottom: z(vb) });
    }
    return { u, top: z(top), bottom: z(bottom), voids };
  };

  const cot0 = cot(samples.endAngles.start);
  const cot1 = cot(samples.endAngles.end);
  const entries: CutValues[] = [];
  for (const sec of sections) {
    const axis = sec.axis as BridgeAxisPoint;
    const c = crossing(vec2(axis.point.x, axis.point.y), unit(axis.frame.normal));
    if (!c) continue;
    // za šikmou koncovou rovinou NK v odsadení x nie je
    if (sec.s < samples.sFrom - c.x * cot0 - 1e-9 || sec.s > samples.sTo - c.x * cot1 + 1e-9)
      continue;
    const v = cutAt(sec, c.x, c.u);
    if (v) entries.push(v);
  }
  // konce NK: priesečník čiary so šikmou koncovou rovinou, prierez konca predĺžený po dotyčnici
  for (const [sec, k] of [
    [first, cot0],
    [last, cot1],
  ] as const) {
    const axis = sec.axis as BridgeAxisPoint;
    const n = unit(axis.frame.normal);
    const t3 = axis.frame.tangent;
    const th = Math.hypot(t3.x, t3.y);
    const t = vec2(t3.x / th, t3.y / th);
    const c = crossing(vec2(axis.point.x, axis.point.y), vec2(n.x - k * t.x, n.y - k * t.y));
    if (!c) continue;
    const v = cutAt(sec, c.x, c.u, -c.x * k * (t3.z / th));
    if (v) entries.push(v);
  }
  entries.sort((a, b) => a.u - b.u);

  type Run = { top: Vec2[]; bottom: Vec2[] };
  const outline = (r: Run): Polygon2D => [...r.top, ...[...r.bottom].reverse()];
  const runs = new Map<string, Run[]>();
  const open = new Map<string, Run>();
  for (const e of entries) {
    const keys = new Set(['outer', ...[...e.voids.keys()].map((n) => `void:${n}`)]);
    for (const [key, run] of open) {
      if (!keys.has(key)) {
        open.delete(key);
        runs.set(key, [...(runs.get(key) ?? []), run]);
      }
    }
    for (const key of keys) {
      const v = key === 'outer' ? e : e.voids.get(key.slice(5));
      if (!v) continue;
      let run = open.get(key);
      if (!run) {
        run = { top: [], bottom: [] };
        open.set(key, run);
      }
      run.top.push(vec2(e.u, v.top));
      run.bottom.push(vec2(e.u, v.bottom));
    }
  }
  for (const [key, run] of open) runs.set(key, [...(runs.get(key) ?? []), run]);
  for (const [key, list] of runs) {
    const polys = list.filter((r) => r.top.length >= 2).map(outline);
    if (key === 'outer') result.outer.push(...polys);
    else result.voids.push(...polys);
  }
  return result;
}

const cot = (a: number) => Math.cos(a) / Math.sin(a);
