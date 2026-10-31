import type { Alignment } from '@bridge/alignment';
import type { Polygon2D, Vec2 } from '@bridge/geom';
import {
  lowestCrossing,
  type SuperstructureSection,
  type SupportResult,
  supportElevation,
} from '@bridge/sections';

export interface DrawnSection {
  id: string;
  name: string;
  /** obrysy v rovine rezu: X = vzdialenosť od osi cesty vpravo [m], Y = výška [m n. m.] */
  loops: { role: 'outer' | 'void'; points: Vec2[] }[];
  /** bod osi mosta (referenčný bod prierezu) */
  axis: Vec2;
  /** šírka a výška v osi NK [m] (zvislý rez obrysom v referenčnom bode) */
  width: number;
  heightAtAxis: number | undefined;
  left: number;
  right: number;
  top: number;
}

/**
 * Premietne prierezy NK do roviny priečneho rezu kolmého na os cesty na staničení `s`:
 * X pozdĺž vodorovnej normály osi cesty, Y = absolútna výška.
 */
export function projectSection(
  section: SuperstructureSection,
  road: Alignment,
  s: number,
  id: string,
  name: string,
): DrawnSection | undefined {
  if (section.loops.length === 0 || !section.axis) return undefined;
  const r = road.evaluateHorizontal(s);
  const nx = Math.cos(r.azimuth);
  const ny = -Math.sin(r.azimuth);
  const z0 = road.origin.z;
  const toPlane = (p: Vec2): Vec2 => {
    const w = section.toWorld(p);
    return { x: (w.x - r.point.x) * nx + (w.y - r.point.y) * ny, y: w.z + z0 };
  };
  const loops = section.loops.map((l) => ({ role: l.role, points: l.polygon.map(toPlane) }));
  const outer = loops.filter((l) => l.role === 'outer').flatMap((l) => l.points);
  const xs = outer.map((p) => p.x);
  const axis = toPlane({ x: 0, y: 0 });
  const bottom = lowestCrossing(
    section.loops.filter((l) => l.role === 'outer').flatMap((l) => [l.polygon]),
    0,
  );
  return {
    id,
    name,
    loops,
    axis,
    width: Math.max(...xs) - Math.min(...xs),
    heightAtAxis: bottom === undefined ? undefined : -bottom,
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.max(...outer.map((p) => p.y)),
  };
}

/** Pohľad na podperu v rovine priečneho rezu: X od osi cesty, Y v m n. m.; `undefined`, ak nie je vyhodnotená. */
export function projectSupport(
  r: SupportResult,
  z0: number,
): { id: string; name: string; body: Polygon2D[]; footing: Polygon2D | undefined } | undefined {
  const el = supportElevation(r);
  if (!el || !r.axis) return undefined;
  const dx = r.axis.horizontalOffset;
  const move = (poly: Polygon2D) => poly.map((p) => ({ x: p.x + dx, y: p.y + z0 }));
  return {
    id: r.support.id,
    name: r.support.name,
    body: el.body.map(move),
    footing: el.footing && move(el.footing),
  };
}
