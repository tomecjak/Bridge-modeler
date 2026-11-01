import { type Polygon2D, pointInPolygon, segmentsIntersect, type Vec2, vec2 } from '@bridge/geom';
import type { IssueOwner, ModelIssue, Superstructure } from '@bridge/model';
import { lowestCrossing } from './crossing.ts';
import {
  clearanceFootprint,
  clearanceRegions,
  clearanceShape,
  type ObstacleResult,
} from './obstacles.ts';
import {
  evaluateSuperstructure,
  type SectionContext,
  type SuperstructureSection,
} from './superstructure.ts';
import { supportPlan } from './supportGeometry.ts';
import type { SupportResult } from './supports.ts';

/** Krok vzoriek po osi prekážky pri kontrole voľnej výšky [m]. */
const CHECK_STEP = 0.5;

/** Najmenšia voľná výška prekážky pod NK (ADR 0020). */
export interface FreeHeight {
  /** voľná výška = spodok NK − spodok voľného prierezu [m] */
  free: number;
  /** potrebná výška voľného prierezu v tom bode (výška bez skosenia) [m] */
  required: number;
  point: Vec2;
  /** NK a zobrazované staničenie jej osi cesty v bode */
  deck: string;
  station: number;
}

export interface ClearanceCheck {
  /** bod s najmenšou rezervou voľnej výšky (free − required) */
  minimum: FreeHeight | undefined;
  issues: ModelIssue[];
}

/** Prekrývanie dvoch mnohouholníkov v pôdoryse (vrchol vnútri alebo pretínajúce sa hrany). */
function overlaps(a: Polygon2D, b: Polygon2D): boolean {
  if (a.some((p) => pointInPolygon(p, b)) || b.some((p) => pointInPolygon(p, a))) return true;
  for (let i = 0; i < a.length; i++) {
    const p = a[i] as Vec2;
    const q = a[(i + 1) % a.length] as Vec2;
    for (let j = 0; j < b.length; j++) {
      if (segmentsIntersect(p, q, b[j] as Vec2, b[(j + 1) % b.length] as Vec2, 1e-9)) return true;
    }
  }
  return false;
}

/**
 * Kontroly prekážky (ADR 0020):
 * - `ClearanceViolated` — spodok NK nad bodom voľného prierezu je nižšie ako jeho vrch (vzorky po osi prekážky
 *   s krokom 0,5 m v odsadeniach okrajov, polovíc, osi a skosení; spodok NK z rezu prierezu ako pri ložiskách);
 * - `SupportInClearance` — pôdorys podpery zasahuje do pásu voľného prierezu;
 * - najmenšia voľná výška pod NK.
 */
export function checkClearance(
  ctx: SectionContext & { superstructures: readonly Superstructure[] },
  r: ObstacleResult,
  supports: readonly SupportResult[],
): ClearanceCheck {
  const owner: IssueOwner = { kind: 'obstacle', name: r.obstacle.name };
  const issues: ModelIssue[] = [];
  const c = r.clearance;
  if (!c) return { minimum: undefined, issues };

  // podpery v páse voľného prierezu
  const bands = clearanceFootprint(r);
  for (const s of supports) {
    const plan = supportPlan(s);
    if (!plan) continue;
    const parts = [...plan.body, ...(plan.footing ? [plan.footing] : [])];
    if (parts.some((p) => bands.some((b) => overlaps(p, b))))
      issues.push({ code: 'SupportInClearance', support: s.support.name });
  }

  // voľná výška pod NK
  const ch = (edge: number) => Math.min(c.chamfer, c.height, edge);
  const offsets = [
    ...new Set([
      -c.left,
      -c.left + ch(c.left),
      -c.left / 2,
      0,
      c.right / 2,
      c.right - ch(c.right),
      c.right,
    ]),
  ];
  let minimum: (FreeHeight & { margin: number }) | undefined;
  for (const deck of ctx.superstructures) {
    const axis = ctx.bridgeAxes.find((a) => a.id === deck.bridgeAxis);
    const road = axis && ctx.alignments.get(axis.alignment);
    const sFrom = road?.stationing.fromDisplay(deck.from);
    const sTo = road?.stationing.fromDisplay(deck.to);
    if (!road || sFrom === undefined || sTo === undefined) continue;
    const sections = new Map<number, SuperstructureSection>();
    const sectionAt = (s: number) => {
      const key = Math.round(s * 100) / 100;
      let section = sections.get(key);
      if (!section) {
        section = evaluateSuperstructure(ctx, deck, key);
        sections.set(key, section);
      }
      return section;
    };
    for (const region of clearanceRegions(r)) {
      const tFrom = region[0]?.t ?? 0;
      const tTo = region.at(-1)?.t ?? 0;
      for (let t = tFrom; t <= tTo + 1e-9; t += CHECK_STEP) {
        const level = r.levelAt(t);
        if (level === undefined) continue;
        const { point, normal } = pointAt(region, t);
        for (const x of offsets) {
          const shape = clearanceShape(c, x);
          if (!shape) continue;
          const p = vec2(point.x + x * normal.x, point.y + x * normal.y);
          const foot = road.project(p);
          if (!foot || foot.s < sFrom || foot.s > sTo) continue;
          const section = sectionAt(foot.s);
          const a = section.axis;
          if (!a || section.issues.some((i) => i.severity !== 'warning')) continue;
          const n = a.frame.normal;
          const sx = (p.x - a.point.x) * n.x + (p.y - a.point.y) * n.y;
          const outer = section.loops.filter((l) => l.role === 'outer').map((l) => l.polygon);
          const y = lowestCrossing(outer, sx);
          if (y === undefined) continue;
          const soffit = section.toWorld(vec2(sx, y)).z;
          const free = soffit - (level + shape.bottom);
          const required = shape.top - shape.bottom;
          const margin = free - required;
          if (!minimum || margin < minimum.margin)
            minimum = {
              free,
              required,
              point: p,
              deck: deck.id,
              station: road.stationing.toDisplay(foot.s).station,
              margin,
            };
        }
      }
    }
  }
  if (minimum && minimum.margin < -1e-3)
    issues.push({
      code: 'ClearanceViolated',
      required: minimum.required,
      actual: minimum.free,
      station: minimum.station,
    });
  const result = minimum && {
    free: minimum.free,
    required: minimum.required,
    point: minimum.point,
    deck: minimum.deck,
    station: minimum.station,
  };
  return { minimum: result, issues: issues.map((i) => ({ owner, ...i })) };
}

/** Bod a pravá normála osi prekážky v dĺžke t (lineárne medzi bodmi úseku). */
function pointAt(
  region: readonly { t: number; point: Vec2 }[],
  t: number,
): { point: Vec2; normal: Vec2 } {
  let i = 0;
  while (i + 2 < region.length && (region[i + 1]?.t ?? 0) < t) i++;
  const a = region[i] as { t: number; point: Vec2 };
  const b = (region[i + 1] ?? a) as { t: number; point: Vec2 };
  const k = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
  const dx = b.point.x - a.point.x;
  const dy = b.point.y - a.point.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    point: vec2(a.point.x + k * dx, a.point.y + k * dy),
    normal: vec2(dy / len, -dx / len),
  };
}
