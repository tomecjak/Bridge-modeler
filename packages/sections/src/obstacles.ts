import type { Alignment } from '@bridge/alignment';
import { azimuthToVector, type Vec2, vec2 } from '@bridge/geom';
import type {
  BridgeAxis,
  IssueOwner,
  ModelIssue,
  Obstacle,
  ParameterSet,
  PlanLine,
  Superstructure,
} from '@bridge/model';
import { evaluateNumber } from './expressions.ts';
import { bridgeAxisPlan } from './longitudinal.ts';
import { globalScope } from './superstructure.ts';

export interface ObstacleContext {
  alignments: ReadonlyMap<string, Alignment>;
  parameters: ParameterSet;
  bridgeAxes: readonly BridgeAxis[];
  superstructures: readonly Superstructure[];
  planLines: readonly PlanLine[];
}

/** Bod osi prekážky s dĺžkou `t` od jej začiatku (pri osi z LandXML spojité staničenie). */
export interface ObstaclePoint {
  t: number;
  point: Vec2;
}

/** Kríženie osi prekážky s osou mosta (ADR 0020). */
export interface ObstacleCrossing {
  bridgeAxis: string;
  /** spojité a zobrazované staničenie osi cesty mosta v priesečníku */
  s: number;
  station: number;
  /** uhol kríženia [°]: od osi mosta proti smeru hodín k osi prekážky, 0–180, 90 = kolmo (ADR 0008) */
  angle: number;
  point: Vec2;
  /** dĺžka po osi prekážky */
  t: number;
  /** spodok voľného prierezu v osi prekážky (lokálne z), ak je úroveň známa */
  level?: number;
}

/** Vyhodnotené rozmery voľného prierezu [m]. */
export interface ClearanceValues {
  left: number;
  right: number;
  height: number;
  slopeLeft: number;
  slopeRight: number;
  chamfer: number;
}

export interface ObstacleResult {
  obstacle: Obstacle;
  /** os prekážky v pôdoryse; prázdna, ak sa nedá určiť */
  points: readonly ObstaclePoint[];
  crossings: ObstacleCrossing[];
  clearance: ClearanceValues | undefined;
  /** spodok voľného prierezu v osi prekážky v dĺžke `t` (lokálne z) */
  levelAt(t: number): number | undefined;
  issues: ModelIssue[];
}

/** Polovičná dĺžka priamky ručného kríženia [m]. */
const MANUAL_REACH = 200;
/** Presah rozsahu osi mosta za NK a oblasť pri hľadaní kríženia [m]. */
const AXIS_REACH = 100;

/** Body osi z LandXML s krokom ≤ `step` a so stykmi prvkov (t = spojité staničenie). */
function alignmentPoints(a: Alignment, step = 1): ObstaclePoint[] {
  const keys = [0, a.length, ...a.elements.map((e) => e.sStart)].sort((p, q) => p - q);
  const out: ObstaclePoint[] = [];
  for (let i = 0; i + 1 < keys.length; i++) {
    const s0 = keys[i] as number;
    const s1 = keys[i + 1] as number;
    if (s1 - s0 < 1e-9) continue;
    const n = Math.max(1, Math.ceil((s1 - s0) / step));
    for (let k = 0; k < n; k++) {
      const t = s0 + ((s1 - s0) * k) / n;
      out.push({ t, point: a.evaluateHorizontal(t).point });
    }
  }
  out.push({ t: a.length, point: a.evaluateHorizontal(a.length).point });
  return out;
}

/** Body čiary s dĺžkou od začiatku. */
function polylinePoints(points: readonly { x: number; y: number }[]): ObstaclePoint[] {
  let t = 0;
  return points.map((p, i) => {
    const prev = points[i - 1];
    if (prev) t += Math.hypot(p.x - prev.x, p.y - prev.y);
    return { t, point: vec2(p.x, p.y) };
  });
}

/** Priesečník úsečiek ab a cd: parametre na oboch, alebo undefined (rovnobežné, mimo). */
function segmentHit(a: Vec2, b: Vec2, c: Vec2, d: Vec2): { u: number; v: number } | undefined {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return undefined;
  const qx = c.x - a.x;
  const qy = c.y - a.y;
  const u = (qx * sy - qy * sx) / den;
  const v = (qx * ry - qy * rx) / den;
  const eps = 1e-12;
  return u >= -eps && u <= 1 + eps && v >= -eps && v <= 1 + eps ? { u, v } : undefined;
}

/** Uhol od smeru `from` proti smeru hodín k priamke so smerom `to` [°], 0–180. */
function lineAngle(from: Vec2, to: Vec2): number {
  let a =
    (Math.atan2(from.x * to.y - from.y * to.x, from.x * to.x + from.y * to.y) * 180) / Math.PI;
  if (a < 0) a += 180;
  if (a >= 180) a -= 180;
  return a;
}

/** Rozsah spojitého staničenia osi cesty, v ktorom sa hľadá kríženie s osou mosta: NK na osi ± presah. */
function axisRange(
  ctx: ObstacleContext,
  axis: BridgeAxis,
  road: Alignment,
): [number, number] | undefined {
  const ranges = ctx.superstructures
    .filter((d) => d.bridgeAxis === axis.id)
    .flatMap((d) => {
      const a = road.stationing.fromDisplay(d.from);
      const b = road.stationing.fromDisplay(d.to);
      return a === undefined || b === undefined ? [] : [[Math.min(a, b), Math.max(a, b)]];
    });
  if (ranges.length === 0) return undefined;
  return [
    Math.max(0, Math.min(...ranges.map((r) => r[0] as number)) - AXIS_REACH),
    Math.min(road.length, Math.max(...ranges.map((r) => r[1] as number)) + AXIS_REACH),
  ];
}

/**
 * Prekážka (ADR 0020): os v pôdoryse (os z LandXML, čiara v pôdoryse alebo priamka ručného kríženia), kríženia
 * s osami mostov v okolí NK (km a uhol kríženia), úroveň spodku voľného prierezu a rozmery voľného prierezu.
 */
export function evaluateObstacle(ctx: ObstacleContext, obstacle: Obstacle): ObstacleResult {
  const owner: IssueOwner = { kind: 'obstacle', name: obstacle.name };
  const issues: ModelIssue[] = [];
  let points: ObstaclePoint[] = [];
  let lineAlignment: Alignment | undefined;
  const ref = obstacle.reference;
  let station = 0;
  if (ref.type === 'curve') {
    if (ref.curve.type === 'alignment') {
      lineAlignment = ctx.alignments.get(ref.curve.name);
      if (lineAlignment) points = alignmentPoints(lineAlignment);
      else issues.push({ code: 'ObstacleCurveNotFound', curve: ref.curve.name });
    } else if (ref.curve.type === 'planLine') {
      const id = ref.curve.id;
      const pl = ctx.planLines.find((l) => l.id === id);
      if (pl && pl.points.length >= 2) points = polylinePoints(pl.points);
      else issues.push({ code: 'ObstacleCurveNotFound', curve: pl?.name ?? id });
    }
  } else {
    station = ref.station;
    const road = ctx.alignments.get(ref.alignment);
    const s0 = road?.stationing.fromDisplay(ref.station);
    const angle = evaluateNumber(
      ref.angle,
      globalScope(ctx.parameters, ref.station),
      'crossingAngle',
    );
    if (!road) issues.push({ code: 'UnknownAlignment', name: ref.alignment });
    else if (s0 === undefined) issues.push({ code: 'StationNotOnAlignment', station: ref.station });
    else if (!angle.ok) issues.push(angle.issue);
    else if (!(angle.value > 0 && angle.value < 180))
      issues.push({ code: 'InvalidCrossingAngle', angle: angle.value });
    else {
      const h = road.evaluateHorizontal(s0);
      // otočenie proti smeru hodín o α = smerník − α (ako os uloženia, ADR 0008)
      const d = azimuthToVector(h.azimuth - (angle.value * Math.PI) / 180);
      points = [-MANUAL_REACH, MANUAL_REACH].map((k) => ({
        t: k + MANUAL_REACH,
        point: vec2(h.point.x + k * d.x, h.point.y + k * d.y),
      }));
    }
  }

  // úroveň spodku voľného prierezu
  const z0 = ctx.alignments.values().next().value?.origin.z ?? 0;
  let levelAt: (t: number) => number | undefined = () => undefined;
  const level = obstacle.level;
  if (level.kind === 'grade') {
    const profiled = lineAlignment?.profile ? lineAlignment : undefined;
    if (profiled) levelAt = (t) => profiled.elevation(Math.min(Math.max(t, 0), profiled.length)).z;
    else if (points.length > 0) issues.push({ code: 'ObstacleLevelUnavailable', level: 'grade' });
  } else if (level.kind === 'line') {
    if (points.length > 0) issues.push({ code: 'ObstacleLevelUnavailable', level: 'line' });
  } else {
    const v = evaluateNumber(level.value, globalScope(ctx.parameters, station), 'value');
    if (v.ok) levelAt = () => v.value - z0;
    else issues.push(v.issue);
  }

  // kríženia s osami mostov v okolí NK
  const crossings: ObstacleCrossing[] = [];
  if (points.length >= 2) {
    const minX = Math.min(...points.map((p) => p.point.x));
    const maxX = Math.max(...points.map((p) => p.point.x));
    const minY = Math.min(...points.map((p) => p.point.y));
    const maxY = Math.max(...points.map((p) => p.point.y));
    for (const axis of ctx.bridgeAxes) {
      const road = ctx.alignments.get(axis.alignment);
      const range = road && axisRange(ctx, axis, road);
      if (!road || !range) continue;
      const line = bridgeAxisPlan(axis, road, ctx.parameters, range[0], range[1], 1);
      for (let i = 0; i + 1 < line.length; i++) {
        const a = line[i] as (typeof line)[number];
        const b = line[i + 1] as (typeof line)[number];
        if (
          Math.max(a.point.x, b.point.x) < minX ||
          Math.min(a.point.x, b.point.x) > maxX ||
          Math.max(a.point.y, b.point.y) < minY ||
          Math.min(a.point.y, b.point.y) > maxY
        )
          continue;
        for (let j = 0; j + 1 < points.length; j++) {
          const c = points[j] as ObstaclePoint;
          const d = points[j + 1] as ObstaclePoint;
          const hit = segmentHit(a.point, b.point, c.point, d.point);
          if (!hit) continue;
          const s = a.s + hit.u * (b.s - a.s);
          const t = c.t + hit.v * (d.t - c.t);
          // na styku úsečiek sa priesečník nájde dvakrát
          if (crossings.some((x) => x.bridgeAxis === axis.id && Math.abs(x.s - s) < 1e-6)) continue;
          const z = levelAt(t);
          crossings.push({
            bridgeAxis: axis.id,
            s,
            station: road.stationing.toDisplay(s).station,
            angle: lineAngle(
              vec2(b.point.x - a.point.x, b.point.y - a.point.y),
              vec2(d.point.x - c.point.x, d.point.y - c.point.y),
            ),
            point: vec2(
              a.point.x + hit.u * (b.point.x - a.point.x),
              a.point.y + hit.u * (b.point.y - a.point.y),
            ),
            t,
            ...(z === undefined ? {} : { level: z }),
          });
        }
      }
    }
    if (crossings.length === 0)
      issues.push({ code: 'ObstacleWithoutCrossing', severity: 'warning' });
  }
  crossings.sort((p, q) => p.s - q.s);

  // rozmery voľného prierezu
  const scope = globalScope(ctx.parameters, crossings[0]?.station ?? station);
  const c = obstacle.clearance;
  const values: Partial<ClearanceValues> = {};
  let valid = true;
  for (const key of ['left', 'right', 'height', 'slopeLeft', 'slopeRight', 'chamfer'] as const) {
    const r = evaluateNumber(c[key], scope, 'dimension');
    if (!r.ok) {
      issues.push(r.issue);
      valid = false;
      continue;
    }
    const nonNegative = key !== 'slopeLeft' && key !== 'slopeRight';
    if (nonNegative && (r.value < 0 || (key === 'height' && r.value === 0))) {
      issues.push({ code: 'InvalidDimension', name: `clearance.${key}`, value: r.value });
      valid = false;
    }
    values[key] = r.value;
  }

  return {
    obstacle,
    points,
    crossings,
    clearance: valid ? (values as ClearanceValues) : undefined,
    levelAt,
    issues: issues.map((i) => ({ owner, ...i })),
  };
}
