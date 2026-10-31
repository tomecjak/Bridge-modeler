import { type Polygon2D, type Vec2, vec2 } from '@bridge/geom';
import { type SupportResult, seatAt, supportPlan } from '@bridge/sections';
import type { GeometryKernel } from './kernel.ts';
import { mergeMeshes, type TriangleMesh } from './mesh.ts';

/** Pôdorysný rozmer ložiska v 3D náhľade [m] (len zobrazenie; výška = výška uloženia). */
export const BEARING_PLAN_SIZE = 0.6;

/**
 * Teleso podpery (Fáza 5): základ ako kváder pod hornou hranou základu, driek / stĺpy / opora ako hranol
 * od hornej hrany základu po hornú hranu podpery (`seatAt`, lineárne medzi ložiskami) a ložiská ako kvádre
 * od hornej hrany podpery po spodok NK. Prázdna sieť, ak podpera nie je vyhodnotená.
 */
export function supportMesh<S>(kernel: GeometryKernel<S>, r: SupportResult): TriangleMesh {
  const plan = supportPlan(r);
  const axis = r.axis;
  const top = r.foundationTop;
  if (!plan || !axis || !Number.isFinite(top) || r.bearings.length === 0) return mergeMeshes([]);
  const solids: S[] = [];
  const thickness = r.footing.thickness;
  if (plan.footing && thickness > 0) {
    solids.push(
      kernel.prism(
        plan.footing,
        () => top - thickness,
        () => top,
      ),
    );
  }

  // priečna poloha x od osi NK; horná hrana je lineárna medzi ložiskami → pôdorys sa delí na pásy medzi nimi
  const n = vec2(axis.frame.normal.x, axis.frame.normal.y);
  const o = vec2(axis.point.x, axis.point.y);
  const xOf = (p: Vec2) => (p.x - o.x) * n.x + (p.y - o.y) * n.y;
  const cuts = [...new Set(r.bearings.map((b) => b.x))].sort((a, b) => a - b);
  const slabs = [-Infinity, ...cuts, Infinity];
  for (const body of plan.body) {
    const pieces = slabs
      .slice(1)
      .map((hi, i) => clipToSlab(body, xOf, slabs[i] as number, hi))
      .filter((piece) => piece.length >= 3);
    solids.push(
      kernel.prism(
        pieces,
        () => top,
        (p) => seatAt(r, xOf(p)),
      ),
    );
  }

  const d = r.direction;
  const across = vec2(d.y, -d.x);
  const h = BEARING_PLAN_SIZE / 2;
  for (const b of r.bearings) {
    if (!(b.soffit - b.seat > 0)) continue;
    const c = b.plan;
    const corner = (su: number, sv: number) =>
      vec2(c.x + su * h * d.x + sv * h * across.x, c.y + su * h * d.y + sv * h * across.y);
    solids.push(
      kernel.prism(
        [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)],
        () => b.seat,
        () => b.soffit,
      ),
    );
  }
  return mergeMeshes(solids.map((s) => kernel.tessellate(s)));
}

/** Časť konvexného mnohouholníka s `lo ≤ x(p) ≤ hi` (Sutherland–Hodgman pre dve rovnobežné priamky). */
function clipToSlab(poly: Polygon2D, x: (p: Vec2) => number, lo: number, hi: number): Vec2[] {
  const clip = (input: readonly Vec2[], inside: (v: number) => boolean, limit: number): Vec2[] => {
    const out: Vec2[] = [];
    for (let i = 0; i < input.length; i++) {
      const a = input[i] as Vec2;
      const b = input[(i + 1) % input.length] as Vec2;
      const xa = x(a);
      const xb = x(b);
      if (inside(xa)) out.push(a);
      if (inside(xa) !== inside(xb)) {
        const t = (limit - xa) / (xb - xa);
        out.push(vec2(a.x + t * (b.x - a.x), a.y + t * (b.y - a.y)));
      }
    }
    return out;
  };
  let out: Vec2[] = [...poly];
  if (Number.isFinite(lo)) out = clip(out, (v) => v >= lo, lo);
  if (Number.isFinite(hi)) out = clip(out, (v) => v <= hi, hi);
  return out;
}
