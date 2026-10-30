import { type Polygon2D, signedArea } from './polygon.ts';
import type { Vec2 } from './vec.ts';

/** Sínus uhla zlomu, pod ktorým sa vrchol považuje za ležiaci na priamke (vynechá sa). */
const COLLINEAR_SIN = 1e-10;

const cross = (a: Vec2, b: Vec2, c: Vec2) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const same = (a: Vec2, b: Vec2) => a.x === b.x && a.y === b.y;

/**
 * Triangulácia mnohouholníka s dutinami (ear clipping, dutiny pripojené premostením k obrysu).
 * Vráti trojice indexov do zoznamu „body obrysu, za nimi body dutín v poradí“; trojuholníky sú CCW.
 * Vrcholy na priamke sa vynechajú; degenerovaný vstup vráti prázdne pole. Určené pre malé mnohouholníky
 * (prierezy, pôdorysy podpier) — zložitosť O(n²).
 */
export function triangulatePolygon(outer: Polygon2D, holes: readonly Polygon2D[] = []): number[] {
  if (outer.length < 3 || signedArea(outer) === 0) return [];
  const pts: Vec2[] = [...outer, ...holes.flat()];
  let ring = outer.map((_, i) => i);
  if (signedArea(outer) < 0) ring.reverse();

  let offset = outer.length;
  const rings: number[][] = [];
  for (const h of holes) {
    const idx = h.map((_, i) => offset + i);
    offset += h.length;
    if (h.length < 3 || signedArea(h) === 0) continue;
    if (signedArea(h) > 0) idx.reverse();
    rings.push(idx);
  }
  const maxX = (r: number[]) => Math.max(...r.map((i) => (pts[i] as Vec2).x));
  rings.sort((a, b) => maxX(b) - maxX(a));
  for (const h of rings) ring = bridgeHole(pts, ring, h);
  return earClip(pts, ring);
}

/** Pripojí dutinu (CW) k obrysu (CCW) dvojicou zhodných hrán z najpravejšieho vrcholu dutiny. */
function bridgeHole(pts: readonly Vec2[], ring: number[], hole: number[]): number[] {
  const p = (i: number) => pts[i] as Vec2;
  let mi = 0;
  for (let k = 1; k < hole.length; k++) {
    if (p(hole[k] as number).x > p(hole[mi] as number).x) mi = k;
  }
  const m = p(hole[mi] as number);

  // najbližší priesečník lúča z M v smere +x s hranou obrysu
  let bestX = Number.POSITIVE_INFINITY;
  let edge = -1;
  for (let k = 0; k < ring.length; k++) {
    const a = p(ring[k] as number);
    const b = p(ring[(k + 1) % ring.length] as number);
    if ((a.y - m.y) * (b.y - m.y) > 0 || a.y === b.y) continue;
    const x = a.x + ((m.y - a.y) * (b.x - a.x)) / (b.y - a.y);
    if (x >= m.x && x < bestX) {
      bestX = x;
      edge = k;
    }
  }
  if (edge < 0) return ring;
  const ea = ring[edge] as number;
  const eb = ring[(edge + 1) % ring.length] as number;
  let target = p(ea).x > p(eb).x ? ea : eb;
  const hit = { x: bestX, y: m.y };

  // ak v trojuholníku M–priesečník–kandidát leží iný vrchol, viditeľný je ten s najmenším uhlom od lúča
  const t = p(target);
  const [u, v, w] = cross(m, hit, t) >= 0 ? [m, hit, t] : [m, t, hit];
  let bestAngle = Number.POSITIVE_INFINITY;
  let bestDist = Number.POSITIVE_INFINITY;
  // lúč trafil priamo vrchol → je viditeľný, trojuholník je degenerovaný
  for (const i of same(t, hit) ? [] : ring) {
    const q = p(i);
    if (same(q, t) || same(q, m)) continue;
    if (cross(u, v, q) < 0 || cross(v, w, q) < 0 || cross(w, u, q) < 0) continue;
    const angle = Math.abs(Math.atan2(q.y - m.y, q.x - m.x));
    const dist = Math.hypot(q.x - m.x, q.y - m.y);
    if (angle < bestAngle || (angle === bestAngle && dist < bestDist)) {
      bestAngle = angle;
      bestDist = dist;
      target = i;
    }
  }

  // pri vrchole použitom viackrát (staršie premostenie) vyber výskyt, do ktorého klinu smeruje M
  const tp = p(target);
  let at = -1;
  for (let k = 0; k < ring.length; k++) {
    if (!same(p(ring[k] as number), tp)) continue;
    if (at < 0) at = k;
    const prev = p(ring[(k + ring.length - 1) % ring.length] as number);
    const next = p(ring[(k + 1) % ring.length] as number);
    if (inWedge(prev, tp, next, m)) {
      at = k;
      break;
    }
  }
  const loop = [...hole.slice(mi), ...hole.slice(0, mi), hole[mi] as number];
  return [...ring.slice(0, at + 1), ...loop, ring[at] as number, ...ring.slice(at + 1)];
}

/** Leží smer z `b` do `q` vo vnútornom kline CCW obrysu vo vrchole `b` (medzi `b→c` a `b→a`)? */
function inWedge(a: Vec2, b: Vec2, c: Vec2, q: Vec2): boolean {
  return cross(a, b, c) >= 0
    ? cross(b, c, q) >= 0 && cross(a, b, q) >= 0
    : cross(b, c, q) >= 0 || cross(a, b, q) >= 0;
}

function earClip(pts: readonly Vec2[], ring: number[]): number[] {
  const p = (i: number) => pts[i] as Vec2;
  const out: number[] = [];
  const r = ring.slice();
  let k = 0;
  let misses = 0;
  // ak sa uchu nedá nájsť (vrcholy presne na uhlopriečke, napr. dutiny v jednej rade), pripustia sa vrcholy na hranách
  let strict = true;
  while (r.length >= 3) {
    if (misses >= r.length) {
      if (!strict) break;
      strict = false;
      misses = 0;
    }
    const n = r.length;
    k %= n;
    const ia = r[(k + n - 1) % n] as number;
    const ib = r[k] as number;
    const ic = r[(k + 1) % n] as number;
    const a = p(ia);
    const b = p(ib);
    const c = p(ic);
    const cr = cross(a, b, c);
    const lab = Math.hypot(b.x - a.x, b.y - a.y);
    const lbc = Math.hypot(c.x - b.x, c.y - b.y);
    if (lab === 0 || lbc === 0 || Math.abs(cr) <= COLLINEAR_SIN * lab * lbc) {
      r.splice(k, 1); // vrchol na priamke alebo zdvojený — plochu nemení
      misses = 0;
      continue;
    }
    if (cr > 0 && !blocksEar(pts, r, a, b, c, strict)) {
      out.push(ia, ib, ic);
      r.splice(k, 1);
      misses = 0;
      strict = true;
      continue;
    }
    k++;
    misses++;
  }
  return out;
}

/** Leží niektorý iný vrchol obrysu v trojuholníku a–b–c (pri `inclusive` aj na jeho hranách)? */
function blocksEar(
  pts: readonly Vec2[],
  r: readonly number[],
  a: Vec2,
  b: Vec2,
  c: Vec2,
  inclusive: boolean,
): boolean {
  for (const i of r) {
    const q = pts[i] as Vec2;
    if (same(q, a) || same(q, b) || same(q, c)) continue;
    const [u, v, w] = [cross(a, b, q), cross(b, c, q), cross(c, a, q)];
    if (inclusive ? u >= 0 && v >= 0 && w >= 0 : u > 0 && v > 0 && w > 0) return true;
  }
  return false;
}
