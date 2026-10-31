import type { Alignment } from '@bridge/alignment';
import { type Vec2, vec2 } from '@bridge/geom';
import type { Tin } from './tin.ts';

export interface CutPoint {
  /** vzdialenosť od začiatku polyline [m] */
  d: number;
  x: number;
  y: number;
  z: number;
}

/** Zhodné parametre na úsečke (zlúčia sa do jedného bodu). */
const SAME_T = 1e-12;

/**
 * Rez terénom pozdĺž polyline: súvislé úseky (mimo povrchu sa čiara preruší) s bodmi na každej hrane TIN,
 * v koncoch a vrcholoch polyline (ak ležia na povrchu). Medzi bodmi je terén lineárny.
 */
export function cutPolyline(tin: Tin, line: readonly Vec2[]): CutPoint[][] {
  const runs: CutPoint[][] = [];
  let run: CutPoint[] = [];
  const close = () => {
    if (run.length >= 2) runs.push(run);
    run = [];
  };
  let d0 = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i] as Vec2;
    const b = line[i + 1] as Vec2;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ts = segmentEvents(tin, a, b);
    const at = (t: number) => vec2(a.x + t * (b.x - a.x), a.y + t * (b.y - a.y));
    for (let k = 0; k < ts.length; k++) {
      const t = ts[k] as number;
      if (k > 0) {
        // úsek medzi udalosťami je na povrchu, ak je na ňom jeho stred
        const mid = at((t + (ts[k - 1] as number)) / 2);
        if (tin.elevationAt(mid.x, mid.y) === undefined) close();
      }
      const p = at(t);
      const z = tin.elevationAt(p.x, p.y);
      if (z === undefined) {
        close();
        continue;
      }
      const d = d0 + t * len;
      const last = run[run.length - 1];
      if (last && Math.abs(last.d - d) < 1e-9) continue;
      run.push({ d, x: p.x, y: p.y, z });
    }
    d0 += len;
  }
  close();
  return runs;
}

/** Parametre t ∈ [0, 1] priesečníkov úsečky s hranami trojuholníkov a jej koncov, zoradené. */
function segmentEvents(tin: Tin, a: Vec2, b: Vec2): number[] {
  const ts = [0, 1];
  const p = tin.points;
  const t = tin.triangles;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const found = tin.candidates(
    Math.min(a.x, b.x),
    Math.min(a.y, b.y),
    Math.max(a.x, b.x),
    Math.max(a.y, b.y),
  );
  for (const k of found) {
    for (let e = 0; e < 3; e++) {
      const i = 3 * (t[3 * k + e] as number);
      const j = 3 * (t[3 * k + ((e + 1) % 3)] as number);
      const ex = (p[j] as number) - (p[i] as number);
      const ey = (p[j + 1] as number) - (p[i + 1] as number);
      const den = dx * ey - dy * ex;
      if (den === 0) continue; // rovnobežná hrana — jej koncové body pokryjú susedné hrany
      const wx = (p[i] as number) - a.x;
      const wy = (p[i + 1] as number) - a.y;
      const s = (wx * ey - wy * ex) / den; // na úsečke
      const u = (wx * dy - wy * dx) / den; // na hrane
      if (s >= 0 && s <= 1 && u >= 0 && u <= 1) ts.push(s);
    }
  }
  ts.sort((x, y) => x - y);
  return ts.filter((v, k) => k === 0 || v - (ts[k - 1] as number) > SAME_T);
}

export interface ProfilePoint {
  /** spojité staničenie osi [m] */
  s: number;
  /** výška terénu (lokálne z) */
  z: number;
}

/**
 * Pozdĺžny profil terénu po osi cesty v rozsahu `sFrom`–`sTo`: os sa nahradí polyline s vrcholmi na stykoch prvkov
 * a s krokom ≤ `step`; staničenie bodu rezu sa interpoluje medzi vrcholmi.
 */
export function profileAlong(
  tin: Tin,
  alignment: Alignment,
  sFrom: number,
  sTo: number,
  step = 1,
): ProfilePoint[][] {
  const breaks = [sFrom, sTo, ...alignment.elements.map((e) => e.sStart)]
    .filter((s) => s >= sFrom && s <= sTo)
    .sort((a, b) => a - b);
  const stations: number[] = [];
  for (let i = 0; i + 1 < breaks.length; i++) {
    const a = breaks[i] as number;
    const b = breaks[i + 1] as number;
    if (b - a < 1e-9) continue;
    const n = Math.max(1, Math.ceil((b - a) / step));
    for (let k = 0; k < n; k++) stations.push(a + ((b - a) * k) / n);
  }
  stations.push(sTo);
  return profileAlongLine(
    tin,
    stations.map((s) => ({ s, point: alignment.evaluateHorizontal(s).point })),
  );
}

/**
 * Pozdĺžny profil terénu po polyline so staničením vo vrcholoch (napr. os mosta posunutá od osi cesty):
 * staničenie bodu rezu sa interpoluje medzi vrcholmi.
 */
export function profileAlongLine(
  tin: Tin,
  line: readonly { s: number; point: Vec2 }[],
): ProfilePoint[][] {
  const cum = [0];
  for (let i = 1; i < line.length; i++) {
    const a = (line[i - 1] as (typeof line)[number]).point;
    const b = (line[i] as (typeof line)[number]).point;
    cum.push((cum[i - 1] as number) + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const station = (i: number) => (line[i] as (typeof line)[number]).s;
  const toS = (d: number) => {
    let i = 1;
    while (i < cum.length - 1 && (cum[i] as number) < d) i++;
    const c0 = cum[i - 1] as number;
    const c1 = cum[i] as number;
    const k = c1 > c0 ? (d - c0) / (c1 - c0) : 0;
    return station(i - 1) + k * (station(i) - station(i - 1));
  };
  return cutPolyline(
    tin,
    line.map((p) => p.point),
  ).map((r) => r.map((p) => ({ s: toS(p.d), z: p.z })));
}

export interface CrossPoint {
  /** odsadenie od osi cesty [m], + vpravo v smere staničenia */
  x: number;
  z: number;
}

/** Priečny rez terénom kolmo na os cesty na staničení `s` od odsadenia `left` po `right` (left < right). */
export function crossSection(
  tin: Tin,
  alignment: Alignment,
  s: number,
  left: number,
  right: number,
): CrossPoint[][] {
  const h = alignment.evaluateHorizontal(s);
  const n = vec2(Math.cos(h.azimuth), -Math.sin(h.azimuth)); // vodorovne vpravo
  const at = (x: number) => vec2(h.point.x + x * n.x, h.point.y + x * n.y);
  return cutPolyline(tin, [at(left), at(right)]).map((r) =>
    r.map((p) => ({ x: left + p.d, z: p.z })),
  );
}
