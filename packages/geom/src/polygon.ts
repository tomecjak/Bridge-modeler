import { type Vec2, vec2 } from './vec.ts';

/** Uzavretý polygón; posledný bod sa s prvým spája implicitne (neopakuje sa). */
export type Polygon2D = readonly Vec2[];

/** Znamienková plocha (kladná pre poradie proti smeru hodinových ručičiek). */
export function signedArea(p: Polygon2D): number {
  let sum = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i] as Vec2;
    const b = p[(i + 1) % p.length] as Vec2;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export const isCounterClockwise = (p: Polygon2D): boolean => signedArea(p) > 0;

/**
 * Ťažisko polygónu. Počíta sa relatívne k prvému bodu, aby veľké súradnice nestratili presnosť.
 */
export function centroid(p: Polygon2D): Vec2 {
  const o = p[0] ?? vec2(0, 0);
  let area2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i] as Vec2;
    const b = p[(i + 1) % p.length] as Vec2;
    const ax = a.x - o.x;
    const ay = a.y - o.y;
    const bx = b.x - o.x;
    const by = b.y - o.y;
    const cross = ax * by - bx * ay;
    area2 += cross;
    cx += (ax + bx) * cross;
    cy += (ay + by) * cross;
  }
  return vec2(o.x + cx / (3 * area2), o.y + cy / (3 * area2));
}

/** Plocha a ťažisko oblasti „obrys mínus dutiny“ (nezávisle od orientácie vstupov). */
export function regionProperties(
  outer: Polygon2D,
  voids: readonly Polygon2D[],
): { area: number; centroid: Vec2 } {
  const parts = [
    { area: Math.abs(signedArea(outer)), c: centroid(outer), sign: 1 },
    ...voids.map((v) => ({ area: Math.abs(signedArea(v)), c: centroid(v), sign: -1 })),
  ];
  let area = 0;
  let sx = 0;
  let sy = 0;
  for (const part of parts) {
    area += part.sign * part.area;
    sx += part.sign * part.area * part.c.x;
    sy += part.sign * part.area * part.c.y;
  }
  return { area, centroid: vec2(sx / area, sy / area) };
}

function orient(a: Vec2, b: Vec2, c: Vec2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: Vec2, b: Vec2, p: Vec2, tol: number): boolean {
  return (
    Math.min(a.x, b.x) - tol <= p.x &&
    p.x <= Math.max(a.x, b.x) + tol &&
    Math.min(a.y, b.y) - tol <= p.y &&
    p.y <= Math.max(a.y, b.y) + tol
  );
}

/** Pretínajú sa (alebo dotýkajú) úsečky ab a cd? `tol` je dĺžková tolerancia [m]. */
export function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2, tol: number): boolean {
  const scale = (u: Vec2, v: Vec2) => Math.hypot(v.x - u.x, v.y - u.y) || 1;
  const d1 = orient(c, d, a) / scale(c, d);
  const d2 = orient(c, d, b) / scale(c, d);
  const d3 = orient(a, b, c) / scale(a, b);
  const d4 = orient(a, b, d) / scale(a, b);
  if (
    ((d1 > tol && d2 < -tol) || (d1 < -tol && d2 > tol)) &&
    ((d3 > tol && d4 < -tol) || (d3 < -tol && d4 > tol))
  ) {
    return true;
  }
  return (
    (Math.abs(d1) <= tol && onSegment(c, d, a, tol)) ||
    (Math.abs(d2) <= tol && onSegment(c, d, b, tol)) ||
    (Math.abs(d3) <= tol && onSegment(a, b, c, tol)) ||
    (Math.abs(d4) <= tol && onSegment(a, b, d, tol))
  );
}

/** Dvojice nesusediacich hrán [i, j] (hrana i = bod i → i+1), ktoré sa pretínajú alebo dotýkajú. */
export function selfIntersections(p: Polygon2D, tol: number): [number, number][] {
  const n = p.length;
  const result: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // prvá a posledná hrana susedia
      const a = p[i] as Vec2;
      const b = p[(i + 1) % n] as Vec2;
      const c = p[j] as Vec2;
      const d = p[(j + 1) % n] as Vec2;
      if (segmentsIntersect(a, b, c, d, tol)) result.push([i, j]);
    }
  }
  return result;
}

/** Indexy bodov, ktoré splývajú s nasledujúcim bodom (vrátane spoja posledný → prvý). */
export function duplicateVertices(p: Polygon2D, tol: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i] as Vec2;
    const b = p[(i + 1) % p.length] as Vec2;
    if (Math.hypot(a.x - b.x, a.y - b.y) <= tol) result.push(i);
  }
  return result;
}

/** Leží bod vnútri polygónu? (lúčový test; body na hrane nie sú definované) */
export function pointInPolygon(pt: Vec2, p: Polygon2D): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i] as Vec2;
    const b = p[j] as Vec2;
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}
