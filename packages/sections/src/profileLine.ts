import type { Alignment } from '@bridge/alignment';
import { type Vec2, vec2 } from '@bridge/geom';
import type { AxisLength } from './axisLength.ts';

/** Druh čiary pozdĺžneho profilu (Fáza 10b, ADR 0007). */
export type ProfileLineKind =
  | 'road'
  | 'bridgeAxis'
  | 'deckEdge'
  | 'bridgeEdge'
  | 'alignment'
  | 'planLine';

export interface ProfileLinePoint {
  /** rozvinutá dĺžka čiary = x profilu [m] */
  u: number;
  /** bod čiary v pôdoryse (lokálne súradnice) */
  point: Vec2;
  /** spojité staničenie osi cesty v päte kolmice; `undefined` mimo osi cesty */
  s: number | undefined;
}

/**
 * Čiara, v ktorej sa kreslí pozdĺžny profil: body s rozvinutou dĺžkou `u` a prevody na staničenie osi cesty.
 * Pri osi mosta je `u` dĺžka po osi mosta, pri inej osi z LandXML jej staničenie, inde dĺžka od začiatku čiary.
 */
export interface ProfileLine {
  kind: ProfileLineKind;
  /** os cesty, na ktorú sa premieta staničenie (podpery, NK, niveleta) */
  road: Alignment;
  /** os, ktorej staničenie sa popisuje na osi x: iná os z LandXML, inak os cesty */
  labelAlignment: Alignment;
  points: readonly ProfileLinePoint[];
  uFrom: number;
  uTo: number;
  pointAt(u: number): Vec2;
  /** spojité staničenie osi cesty pre `u` (päta kolmice) */
  stationAt(u: number): number | undefined;
  /** `u` pre spojité staničenie osi cesty (prvý priesečník čiary s priečnou rovinou v `s`) */
  lengthAt(s: number): number | undefined;
}

/** Spojité staničenia s krokom ≤ `step` a so stykmi prvkov osi presne. */
function stationsAlong(alignment: Alignment, sFrom: number, sTo: number, step: number): number[] {
  const keys = [sFrom, sTo, ...alignment.elements.map((e) => e.sStart)]
    .filter((s) => s >= sFrom && s <= sTo)
    .sort((a, b) => a - b);
  const out: number[] = [];
  for (let i = 0; i + 1 < keys.length; i++) {
    const a = keys[i] as number;
    const b = keys[i + 1] as number;
    if (b - a < 1e-9) continue;
    const n = Math.max(1, Math.ceil((b - a) / step));
    for (let k = 0; k < n; k++) out.push(a + ((b - a) * k) / n);
  }
  out.push(sTo);
  return out;
}

/** Index úseku ⟨values[i], values[i + 1]⟩ s hodnotou `v` (vzostupné hodnoty). */
function segmentOf(values: readonly number[], v: number): number {
  let lo = 0;
  let hi = values.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((values[mid] as number) <= v) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Prevody podľa bodov čiary (lineárna interpolácia medzi bodmi). */
function fromPoints(
  kind: ProfileLineKind,
  road: Alignment,
  labelAlignment: Alignment,
  points: ProfileLinePoint[],
): ProfileLine {
  const us = points.map((p) => p.u);
  const at = (u: number) => {
    const i = segmentOf(us, u);
    const a = points[i] as ProfileLinePoint;
    const b = (points[i + 1] ?? a) as ProfileLinePoint;
    const k = b.u > a.u ? (u - a.u) / (b.u - a.u) : 0;
    return { a, b, k };
  };
  return {
    kind,
    road,
    labelAlignment,
    points,
    uFrom: points[0]?.u ?? 0,
    uTo: points[points.length - 1]?.u ?? 0,
    pointAt(u) {
      const { a, b, k } = at(u);
      return vec2(a.point.x + k * (b.point.x - a.point.x), a.point.y + k * (b.point.y - a.point.y));
    },
    stationAt(u) {
      const { a, b, k } = at(u);
      if (a.s === undefined || b.s === undefined) return undefined;
      return a.s + k * (b.s - a.s);
    },
    lengthAt(s) {
      for (let i = 0; i + 1 < points.length; i++) {
        const a = points[i] as ProfileLinePoint;
        const b = points[i + 1] as ProfileLinePoint;
        if (a.s === undefined || b.s === undefined) continue;
        if ((a.s - s) * (b.s - s) > 0) continue;
        const k = b.s !== a.s ? (s - a.s) / (b.s - a.s) : 0;
        return a.u + k * (b.u - a.u);
      }
      return undefined;
    },
  };
}

/** Os cesty: u = spojité staničenie. */
export function roadProfileLine(road: Alignment, step = 1): ProfileLine {
  const points = stationsAlong(road, 0, road.length, step).map((s) => ({
    u: s,
    point: road.evaluateHorizontal(s).point,
    s,
  }));
  return {
    ...fromPoints('road', road, road, points),
    pointAt: (u) => road.evaluateHorizontal(Math.min(road.length, Math.max(0, u))).point,
    stationAt: (u) => u,
    lengthAt: (s) => s,
  };
}

/** Bod osi mosta na `s`: bod osi cesty + posun · vodorovná normála vpravo. */
function axisPoint(road: Alignment, measure: AxisLength, s: number): Vec2 {
  const r = road.evaluateHorizontal(Math.min(road.length, Math.max(0, s)));
  const h = measure.offsetAt(s);
  return vec2(r.point.x + h * Math.cos(r.azimuth), r.point.y - h * Math.sin(r.azimuth));
}

/** Os mosta: u = vodorovná dĺžka po osi mosta (`bridgeAxisLength`), body na celej osi cesty. */
export function bridgeAxisProfileLine(road: Alignment, measure: AxisLength, step = 1): ProfileLine {
  const points = stationsAlong(road, 0, road.length, step).map((s) => ({
    u: measure.lengthAt(s),
    point: axisPoint(road, measure, s),
    s,
  }));
  return {
    ...fromPoints('bridgeAxis', road, road, points),
    pointAt: (u) => axisPoint(road, measure, measure.stationAt(u)),
    stationAt: (u) => measure.stationAt(u),
    lengthAt: (s) => measure.lengthAt(s),
  };
}

/**
 * Lomená čiara v pôdoryse (okraj NK, okraj mosta, čiara v pôdoryse): u = dĺžka od prvého vrcholu, úseky zahustené na
 * ≤ `step` kvôli premietnutiu na os cesty.
 */
export function polylineProfileLine(
  kind: 'deckEdge' | 'bridgeEdge' | 'planLine',
  vertices: readonly Vec2[],
  road: Alignment,
  step = 1,
): ProfileLine {
  const points: ProfileLinePoint[] = [];
  let u = 0;
  const push = (p: Vec2) => points.push({ u, point: p, s: road.project(p)?.s });
  vertices.forEach((p, i) => {
    const prev = vertices[i - 1];
    if (!prev) {
      push(p);
      return;
    }
    const len = Math.hypot(p.x - prev.x, p.y - prev.y);
    if (len < 1e-9) return;
    const n = Math.max(1, Math.ceil(len / step));
    const u0 = u;
    for (let k = 1; k <= n; k++) {
      u = u0 + (len * k) / n;
      push(vec2(prev.x + ((p.x - prev.x) * k) / n, prev.y + ((p.y - prev.y) * k) / n));
    }
  });
  return fromPoints(kind, road, road, points);
}

/** Iná os z LandXML: u = jej spojité staničenie, popis v jej km. */
export function alignmentProfileLine(other: Alignment, road: Alignment, step = 1): ProfileLine {
  const points = stationsAlong(other, 0, other.length, step).map((s) => {
    const point = other.evaluateHorizontal(s).point;
    return { u: s, point, s: road.project(point)?.s };
  });
  return {
    ...fromPoints('alignment', road, other, points),
    pointAt: (u) => other.evaluateHorizontal(Math.min(other.length, Math.max(0, u))).point,
  };
}
