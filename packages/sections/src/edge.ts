import type { Alignment } from '@bridge/alignment';
import { type Vec2, vec2 } from '@bridge/geom';
import {
  type CurveRef,
  type ModelIssue,
  type PlanLine,
  type Survey,
  surveyLineName,
} from '@bridge/model';
import { findSurveyLine } from './survey.ts';

/** Krivky, na ktoré sa môže odkazovať okraj NK: osi z LandXML, čiary v pôdoryse a čiary meračky. */
export interface EdgeCurveContext {
  alignments: ReadonlyMap<string, Alignment>;
  planLines: readonly PlanLine[];
  /** meračky (ADR 0021); bez nich sa čiara meračky nenájde */
  surveys?: readonly Survey[];
}

type EdgeResult = { ok: true; value: number } | { ok: false; issue: ModelIssue };

/**
 * Najväčšia hľadaná vzdialenosť okraja od osi mosta [m]. Vzdialenejší priesečník (napr. s krátkou osou vetvy,
 * ktorú kolmica z iného úseku pretne o stovky metrov ďalej) sa za okraj NK nepovažuje (predpoklad, PLAN.md §7).
 */
export const MAX_EDGE_DISTANCE = 50;

/** Tolerancia tetivy polyline osi pre prvý odhad priesečníka [m]; presná hodnota sa dopočíta. */
const ESTIMATE_TOLERANCE = 0.01;
/** Presnosť priesečníka s osou z LandXML (odsadenie od nej) [m]. */
const REFINE_TOLERANCE = 1e-10;

/** Názov krivky do hlásení: názov osi, názov čiary, alebo id neznámej čiary. */
export function edgeCurveName(ctx: EdgeCurveContext, ref: CurveRef): string {
  if (ref.type === 'alignment') return ref.name;
  if (ref.type === 'planLine') return ctx.planLines.find((l) => l.id === ref.id)?.name ?? ref.id;
  const found = findSurveyLine(ctx.surveys, ref);
  return found ? surveyLineName(found.survey, found.line.id) : ref.line;
}

/** Body lomenej čiary krivky (čiara v pôdoryse, čiara meračky); undefined pre os z LandXML alebo neznámu čiaru. */
function curvePolyline(ctx: EdgeCurveContext, ref: CurveRef): readonly Vec2[] | undefined {
  if (ref.type === 'planLine') return ctx.planLines.find((l) => l.id === ref.id)?.points;
  if (ref.type === 'survey') return findSurveyLine(ctx.surveys, ref)?.line.points;
  return undefined;
}

/**
 * Vzdialenosť od bodu osi mosta `origin` ku krivke po vodorovnej normále vpravo `normal` (jednotkovej) na strane `side`
 * — najbližší priesečník na tej strane. Čiara v pôdoryse priamo, os z LandXML odhadom z polyline a spresnením
 * sečnicovou metódou na odsadenie 0 od osi (≤ 1e-10 m). Bez priesečníka `EdgeCurveNotReached` (`station` doplní volajúci).
 */
export function edgeDistance(
  ctx: EdgeCurveContext,
  ref: CurveRef,
  origin: Vec2,
  normal: Vec2,
  side: 'left' | 'right',
  station = Number.NaN,
): EdgeResult {
  const curve = edgeCurveName(ctx, ref);
  const d = side === 'right' ? normal : vec2(-normal.x, -normal.y);
  const notReached: EdgeResult = {
    ok: false,
    issue: { code: 'EdgeCurveNotReached', curve, station },
  };
  if (ref.type !== 'alignment') {
    const line = curvePolyline(ctx, ref);
    if (!line) return { ok: false, issue: { code: 'EdgeCurveNotFound', curve } };
    const t = rayPolyline(origin, d, line);
    return t === undefined || t > MAX_EDGE_DISTANCE
      ? notReached
      : { ok: true, value: Math.max(0, t) };
  }
  const alignment = ctx.alignments.get(ref.name);
  if (!alignment) return { ok: false, issue: { code: 'EdgeCurveNotFound', curve } };
  // tetiva leží vnútri oblúka → pri krivke tesne pri osi môže odhad vyjsť mierne za počiatkom
  const estimate = rayPolyline(origin, d, alignmentPolyline(alignment), -4 * ESTIMATE_TOLERANCE);
  if (estimate === undefined) return notReached;
  const t = estimate > MAX_EDGE_DISTANCE + 1 ? undefined : refine(alignment, origin, d, estimate);
  return t === undefined || t > MAX_EDGE_DISTANCE ? notReached : { ok: true, value: t };
}

/**
 * Spojité staničenia osi cesty, kde má vzdialenosť ku krivke zlom: vrcholy čiary a styky prvkov osi z LandXML
 * premietnuté na os cesty (bod osi mosta leží na tej istej normále ako bod osi cesty). Zoradené, bez duplicít.
 */
export function edgeBreaks(ctx: EdgeCurveContext, ref: CurveRef, road: Alignment): number[] {
  let points: Vec2[] = [];
  if (ref.type !== 'alignment') {
    points = [...(curvePolyline(ctx, ref) ?? [])];
  } else {
    const a = ctx.alignments.get(ref.name);
    if (a) {
      points = [...a.elements.map((e) => e.sStart), a.length].map(
        (s) => a.evaluateHorizontal(s).point,
      );
    }
  }
  const out: number[] = [];
  for (const p of points) {
    const s = road.project(p)?.s;
    if (s === undefined) continue;
    if (!out.some((x) => Math.abs(x - s) < 1e-9)) out.push(s);
  }
  return out.sort((a, b) => a - b);
}

/** Najmenší parameter t ≥ `minT` priesečníka polpriamky origin + t·d s lomenou čiarou (záporné t → 0, ak `minT` ≈ 0). */
function rayPolyline(
  origin: Vec2,
  d: Vec2,
  points: readonly Vec2[],
  minT = -1e-9,
): number | undefined {
  let best: number | undefined;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i] as Vec2;
    const b = points[i + 1] as Vec2;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const den = d.x * ey - d.y * ex;
    if (Math.abs(den) < 1e-15) continue;
    const ax = a.x - origin.x;
    const ay = a.y - origin.y;
    const t = (ax * ey - ay * ex) / den;
    const u = (ax * d.y - ay * d.x) / den;
    if (t < minT || u < -1e-12 || u > 1 + 1e-12) continue;
    if (best === undefined || t < best) best = t;
  }
  return best;
}

// polyline osi sa počíta raz pre každú vyhodnotenú os
const polylines = new WeakMap<Alignment, Vec2[]>();

/** Os z LandXML ako lomená čiara s tetivou ≤ `ESTIMATE_TOLERANCE` (vrcholy v stykoch prvkov). */
function alignmentPolyline(a: Alignment): Vec2[] {
  const hit = polylines.get(a);
  if (hit) return hit;
  const stations: number[] = [];
  for (const e of a.elements) {
    const k =
      e.data.kind === 'line'
        ? 0
        : e.data.kind === 'arc'
          ? 1 / e.data.radius
          : 1 / Math.min(e.data.radiusStart ?? Infinity, e.data.radiusEnd ?? Infinity);
    const step = k > 0 ? Math.sqrt((8 * ESTIMATE_TOLERANCE) / k) : Infinity;
    const n = Math.max(1, Math.ceil((e.sEnd - e.sStart) / step));
    for (let i = 0; i < n; i++) stations.push(e.sStart + ((e.sEnd - e.sStart) * i) / n);
  }
  stations.push(a.length);
  const points = stations.map((s) => a.evaluateHorizontal(s).point);
  polylines.set(a, points);
  return points;
}

/** Spresní t tak, aby bod origin + t·d ležal na osi (odsadenie 0); mimo rozsahu osi `undefined`. */
function refine(a: Alignment, origin: Vec2, d: Vec2, t0: number): number | undefined {
  const f = (t: number) => a.project(vec2(origin.x + t * d.x, origin.y + t * d.y))?.offset;
  let x0 = t0;
  let f0 = f(x0);
  if (f0 === undefined) return undefined;
  if (Math.abs(f0) < REFINE_TOLERANCE) return x0 >= -1e-9 ? Math.max(0, x0) : undefined;
  let x1 = t0 + 1e-3;
  let f1 = f(x1);
  for (let i = 0; i < 30 && f1 !== undefined; i++) {
    if (Math.abs(f1) < REFINE_TOLERANCE) return x1 >= -1e-9 ? Math.max(0, x1) : undefined;
    if (f1 === f0) break;
    const x2 = x1 - (f1 * (x1 - x0)) / (f1 - f0);
    x0 = x1;
    f0 = f1;
    x1 = x2;
    f1 = f(x1);
  }
  return undefined;
}
