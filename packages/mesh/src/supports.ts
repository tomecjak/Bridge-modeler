import { type Polygon2D, type Vec2, vec2 } from '@bridge/geom';
import {
  BEARING_PLAN_SIZE,
  type SupportResult,
  supportParts,
  transverseOffset,
} from '@bridge/sections';
import type { GeometryKernel } from './kernel.ts';
import { mergeMeshes, type TriangleMesh } from './mesh.ts';

/**
 * Teleso podpery (Fáza 5, ADR 0010): hranoly z `supportParts` (základ, driek / stĺpy alebo časti opory) a ložiská
 * ako kvádre od hornej hrany podpery po spodok NK.
 * Prázdna sieť, ak podpera nie je vyhodnotená.
 */
export function supportMesh<S>(kernel: GeometryKernel<S>, r: SupportResult): TriangleMesh {
  const parts = supportParts(r);
  if (parts.length === 0) return mergeMeshes([]);
  const solids: S[] = [];
  const xOf = (p: Vec2) => transverseOffset(r, p);
  // plochy lineárne medzi ložiskami → pôdorys sa delí na pásy v priečnych polohách ložísk
  const cuts = [...new Set(r.bearings.map((b) => b.x))].sort((a, b) => a - b);
  const slabs = [-Infinity, ...cuts, Infinity];
  for (const part of parts) {
    const pieces = part.foldsAtBearings
      ? slabs
          .slice(1)
          .map((hi, i) => clipToSlab(part.plan, xOf, slabs[i] as number, hi))
          .filter((piece) => piece.length >= 3)
      : [part.plan];
    solids.push(kernel.prism(pieces, part.bottom, part.top));
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
export function clipToSlab(
  poly: Polygon2D,
  x: (p: Vec2) => number,
  lo: number,
  hi: number,
): Vec2[] {
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
