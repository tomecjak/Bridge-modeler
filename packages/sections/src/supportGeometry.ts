import { centroid, type Polygon2D, type Vec2, vec2 } from '@bridge/geom';
import { abutmentParts, type SolidPart, transverseOffset } from './abutment.ts';
import { type SupportResult, seatAt } from './supports.ts';

/** Počet strán mnohouholníka, ktorým sa v pôdoryse nahradí kruhový stĺp. */
const CIRCLE_SEGMENTS = 32;

export interface SupportPlan {
  /** obrysy drieku / stĺpov / opory (prah, múrik, krídla) v pôdoryse (lokálne súradnice) */
  body: Polygon2D[];
  /** `undefined` = bez základu (hrúbka 0) */
  footing: Polygon2D | undefined;
}

export interface SupportElevation {
  /**
   * Pohľad na podperu premietnutý do roviny priečneho rezu NK: X = kolmá vzdialenosť od osi NK [m] (+ vpravo),
   * Y = výška (lokálne z). Horná hrana prechádza hornými hranami pri ložiskách.
   */
  body: Polygon2D[];
  footing: Polygon2D | undefined;
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
  const parts = abutmentParts(r);
  // základ opory leží pod úložným prahom, inak pod stredom podpery
  const seat = parts?.find((p) => p.name === 'seat')?.plan;
  const fc = seat ? centroid(seat) : c;
  const footing = [f.length, f.width, f.thickness].every((v) => v > 0)
    ? rectangle(fc, d, n, f.length / 2, f.width / 2)
    : undefined;
  let body: Polygon2D[] = [];
  if (g.type === 'wall' && dim.length && dim.thickness) {
    body = [rectangle(c, d, n, dim.length / 2, dim.thickness / 2)];
  } else if (parts) {
    body = parts.filter((p) => p.name !== 'stem').map((p) => p.plan);
  } else if (g.type === 'abutment' && dim.length && dim.seatLength) {
    body = [rectangle(c, d, n, dim.length / 2, dim.seatLength / 2)];
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
  const footing: Polygon2D | undefined =
    r.footing.thickness > 0
      ? [
          vec2(offset - fl, bottom - r.footing.thickness),
          vec2(offset + fl, bottom - r.footing.thickness),
          vec2(offset + fl, bottom),
          vec2(offset - fl, bottom),
        ]
      : undefined;
  return { body, footing };
}

/**
 * Podpera ako zvislé hranoly (ADR 0008, 0010): základ (ak má hrúbku), opora z `abutmentParts`, inak driek / stĺpy
 * od hornej hrany základu po hornú hranu podpery (`seatAt`, lineárne medzi ložiskami). Prázdne, ak podpera nie je
 * vyhodnotená. Spoločné pre 3D teleso a rez v osi mosta.
 */
export function supportParts(r: SupportResult): SolidPart[] {
  const plan = supportPlan(r);
  const top = r.foundationTop;
  if (!plan || !r.axis || !Number.isFinite(top) || r.bearings.length === 0) return [];
  const thickness = r.footing.thickness;
  const footing: SolidPart[] =
    plan.footing && thickness > 0
      ? [
          {
            name: 'footing',
            plan: plan.footing,
            bottom: () => top - thickness,
            top: () => top,
            foldsAtBearings: false,
          },
        ]
      : [];
  const body: SolidPart[] =
    abutmentParts(r) ??
    plan.body.map((b) => ({
      name: 'stem',
      plan: b,
      bottom: () => top,
      top: (p) => seatAt(r, transverseOffset(r, p)),
      foldsAtBearings: true,
    }));
  return [...footing, ...body];
}
