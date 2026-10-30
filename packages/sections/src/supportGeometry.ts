import { type Polygon2D, type Vec2, vec2 } from '@bridge/geom';
import type { SupportResult } from './supports.ts';

/** Počet strán mnohouholníka, ktorým sa v pôdoryse nahradí kruhový stĺp. */
const CIRCLE_SEGMENTS = 32;

export interface SupportPlan {
  /** obrysy drieku / stĺpov / opory v pôdoryse (lokálne súradnice) */
  body: Polygon2D[];
  footing: Polygon2D;
}

export interface SupportElevation {
  /**
   * Pohľad na podperu premietnutý do roviny priečneho rezu NK: X = kolmá vzdialenosť od osi NK [m] (+ vpravo),
   * Y = výška (lokálne z). Horná hrana prechádza hornými hranami pri ložiskách.
   */
  body: Polygon2D[];
  footing: Polygon2D;
}

/** Obdĺžnik so stredom `c`, polovičnými rozmermi `a` pozdĺž `u` a `b` pozdĺž `v` (CCW). */
function rectangle(c: Vec2, u: Vec2, v: Vec2, a: number, b: number): Polygon2D {
  const p = (su: number, sv: number) =>
    vec2(c.x + su * a * u.x + sv * b * v.x, c.y + su * a * u.y + sv * b * v.y);
  return [p(-1, -1), p(1, -1), p(1, 1), p(-1, 1)];
}

function circle(c: Vec2, r: number): Polygon2D {
  return Array.from({ length: CIRCLE_SEGMENTS }, (_, i) => {
    const t = (2 * Math.PI * i) / CIRCLE_SEGMENTS;
    return vec2(c.x + r * Math.cos(t), c.y + r * Math.sin(t));
  });
}

/** Stredy stĺpov pozdĺž osi podpery (vzdialenosť od stredu podpery v smere osi). */
export function columnOffsets(count: number, spacing: number): number[] {
  return Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * spacing);
}

/** Pôdorys podpery a základu (ADR 0008): dĺžky pozdĺž osi podpery, hrúbky kolmo na ňu. */
export function supportPlan(r: SupportResult): SupportPlan | undefined {
  const d = r.direction;
  const n = vec2(d.y, -d.x); // kolmo na os podpery
  const c = r.center;
  const g = r.support.geometry;
  const dim = r.dimensions;
  const f = r.footing;
  if (![f.length, f.width].every((v) => v > 0)) return undefined;
  const footing = rectangle(c, d, n, f.length / 2, f.width / 2);
  let body: Polygon2D[] = [];
  if (g.type === 'wall' && dim.length && dim.thickness) {
    body = [rectangle(c, d, n, dim.length / 2, dim.thickness / 2)];
  } else if (g.type === 'abutment' && dim.length && dim.stemThickness && dim.seatLength) {
    body = [rectangle(c, d, n, dim.length / 2, Math.max(dim.stemThickness, dim.seatLength) / 2)];
  } else if (g.type === 'columns' && dim.count && dim.spacing !== undefined) {
    body = columnOffsets(dim.count, dim.spacing).map((o) => {
      const p = vec2(c.x + o * d.x, c.y + o * d.y);
      return g.shape === 'circle' && dim.diameter
        ? circle(p, dim.diameter / 2)
        : rectangle(p, d, n, (dim.width ?? 0) / 2, (dim.depth ?? 0) / 2);
    });
  }
  return { body, footing };
}

/** Horná hrana podpery v mieste X (lineárne medzi ložiskami, mimo nich konštantne). */
export function seatAt(r: SupportResult, x: number): number {
  const b = [...r.bearings].sort((p, q) => p.x - q.x);
  if (b.length === 0) return Number.NaN;
  const first = b[0] as SupportResult['bearings'][number];
  const last = b[b.length - 1] as SupportResult['bearings'][number];
  if (x <= first.x) return first.seat;
  if (x >= last.x) return last.seat;
  for (let i = 1; i < b.length; i++) {
    const p = b[i - 1] as SupportResult['bearings'][number];
    const q = b[i] as SupportResult['bearings'][number];
    if (x <= q.x) return p.seat + ((q.seat - p.seat) * (x - p.x)) / (q.x - p.x);
  }
  return last.seat;
}

/** Pohľad na podperu v rovine priečneho rezu NK (pre náhľad prierezu na staničení podpery). */
export function supportElevation(r: SupportResult): SupportElevation | undefined {
  if (r.bearings.length === 0 || !Number.isFinite(r.foundationTop)) return undefined;
  const sin = Math.sin(r.crossingAngle);
  // stred podpery: kolmá vzdialenosť od osi NK = offset (uložený ako stred na osi podpery)
  const n = r.axis?.frame.normal;
  const p = r.axis?.point;
  const offset = n && p ? (r.center.x - p.x) * n.x + (r.center.y - p.y) * n.y : 0;
  const bottom = r.foundationTop;
  const block = (x0: number, x1: number): Polygon2D => [
    vec2(x0, bottom),
    vec2(x1, bottom),
    vec2(x1, seatAt(r, x1)),
    vec2(x0, seatAt(r, x0)),
  ];
  const g = r.support.geometry;
  const dim = r.dimensions;
  let body: Polygon2D[] = [];
  if (g.type === 'columns' && dim.count && dim.spacing !== undefined) {
    const half = ((g.shape === 'circle' ? dim.diameter : dim.width) ?? 0) / 2;
    body = columnOffsets(dim.count, dim.spacing).map((o) => {
      const x = offset - o * sin;
      return block(x - half * sin, x + half * sin);
    });
  } else {
    const half = (dim.length ?? 0) / 2;
    body = [block(offset - half * sin, offset + half * sin)];
  }
  const fl = (r.footing.length / 2) * sin;
  const footing: Polygon2D = [
    vec2(offset - fl, bottom - r.footing.thickness),
    vec2(offset + fl, bottom - r.footing.thickness),
    vec2(offset + fl, bottom),
    vec2(offset - fl, bottom),
  ];
  return { body, footing };
}
