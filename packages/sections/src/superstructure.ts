import { type Alignment, MissingProfileError, StationOutOfRangeError } from '@bridge/alignment';
import type { Scope } from '@bridge/expr';
import { type Frame, frameFromAzimuthGrade, type Vec2, type Vec3, vec2 } from '@bridge/geom';
import {
  type BridgeAxis,
  evaluateLaw,
  type IssueOwner,
  type ModelIssue,
  type ParameterSet,
  type PlanLine,
  type ProfileDefinition,
  type Superstructure,
} from '@bridge/model';
import { edgeDistance } from './edge.ts';
import {
  type EdgeResolver,
  type EvaluatedLoop,
  evaluateProfileDefinition,
  profileParameterValues,
} from './profile.ts';

/** Vstupy výpočtu prierezov: vyhodnotené osi cesty, parametre a časti projektu. */
export interface SectionContext {
  alignments: ReadonlyMap<string, Alignment>;
  parameters: ParameterSet;
  bridgeAxes: readonly BridgeAxis[];
  profiles: readonly ProfileDefinition[];
  /** čiary v pôdoryse (okraje NK podľa krivky) */
  planLines: readonly PlanLine[];
}

export interface BridgeAxisPoint {
  /** bod osi mosta v lokálnych súradniciach projektu */
  point: Vec3;
  /** rámec: tangenta v smere staničenia so sklonom nivelety, normála vodorovne vpravo, binormála ≈ nahor */
  frame: Frame;
  /** vodorovný a zvislý posun od osi cesty [m] */
  horizontalOffset: number;
  verticalOffset: number;
}

export interface SuperstructureSection {
  s: number;
  /** zobrazované staničenie */
  station: number;
  loops: EvaluatedLoop[];
  points: Map<string, Vec2>;
  area: number;
  centroid: Vec2;
  axis: BridgeAxisPoint | undefined;
  /** bod prierezu (x vpravo, y nahor; referenčný bod = 0,0) → lokálne súradnice projektu */
  toWorld: (p: Vec2) => Vec3;
  issues: ModelIssue[];
}

/** Hodnoty globálnych parametrov na zobrazovanom staničení ako rozsah mien pre výrazy. */
export function globalScope(parameters: ParameterSet, station: number): Scope {
  const values = parameters.evaluateAt(station).values;
  return (n) => values.get(n);
}

/**
 * Bod osi mosta na staničení `s` osi cesty (ADR 0007): bod osi cesty + h · vodorovná normála vpravo,
 * výška = niveleta + v. Pri premennom h sa smer osi mosta berie z osi cesty (zanedbateľná odchýlka).
 */
export function evaluateBridgeAxis(
  axis: BridgeAxis,
  alignment: Alignment,
  scope: Scope,
  s: number,
): { ok: true; value: BridgeAxisPoint } | { ok: false; issue: ModelIssue } {
  const owner: IssueOwner = { kind: 'bridgeAxis', name: axis.name };
  const station = alignment.stationing.toDisplay(s).station;
  const h = evaluateLaw(axis.horizontalOffset, 'length', scope, station);
  if (!h.ok) return { ok: false, issue: { ...h.issue, owner } };
  const v = evaluateLaw(axis.verticalOffset, 'length', scope, station);
  if (!v.ok) return { ok: false, issue: { ...v.issue, owner } };
  let road: ReturnType<Alignment['evaluate']>;
  try {
    road = alignment.evaluate(s);
  } catch (e) {
    if (e instanceof StationOutOfRangeError || e instanceof MissingProfileError) {
      return {
        ok: false,
        issue: {
          code: 'StationOutsideFunction',
          sta: station,
          from: Number.NaN,
          to: Number.NaN,
          owner,
        },
      };
    }
    throw e;
  }
  const n = road.frame.normal;
  const point = {
    x: road.point.x + h.value * n.x,
    y: road.point.y + h.value * n.y,
    z: road.point.z + v.value,
  };
  return {
    ok: true,
    value: {
      point,
      frame: frameFromAzimuthGrade(point, road.azimuth, road.grade),
      horizontalOffset: h.value,
      verticalOffset: v.value,
    },
  };
}

/**
 * Prierez NK na staničení `s` osi cesty: parametre profilu z priebehov NK, body a obrysy v rámci prierezu
 * (referenčný bod v 0,0) a transformácia do lokálnych súradníc podľa osi mosta a orientácie.
 */
export function evaluateSuperstructure(
  ctx: SectionContext,
  sup: Superstructure,
  s: number,
): SuperstructureSection {
  const owner: IssueOwner = { kind: 'superstructure', name: sup.name };
  const empty = (station: number, issues: ModelIssue[]): SuperstructureSection => ({
    s,
    station,
    loops: [],
    points: new Map(),
    area: 0,
    centroid: vec2(0, 0),
    axis: undefined,
    toWorld: (p) => ({ x: p.x, y: 0, z: p.y }),
    issues: issues.map((i) => ({ owner, ...i })),
  });

  const axis = ctx.bridgeAxes.find((a) => a.id === sup.bridgeAxis);
  if (!axis) return empty(Number.NaN, [{ code: 'UnknownBridgeAxis', id: sup.bridgeAxis }]);
  const alignment = ctx.alignments.get(axis.alignment);
  if (!alignment) {
    return empty(Number.NaN, [
      {
        code: 'UnknownAlignment',
        name: axis.alignment,
        owner: { kind: 'bridgeAxis', name: axis.name },
      },
    ]);
  }
  const profile = ctx.profiles.find((p) => p.id === sup.profile);
  if (!profile) return empty(Number.NaN, [{ code: 'UnknownProfile', id: sup.profile }]);

  const station = alignment.stationing.toDisplay(s).station;
  if (station < sup.from - 1e-9 || station > sup.to + 1e-9) {
    return empty(station, [
      { code: 'StationOutsideSuperstructure', station, from: sup.from, to: sup.to },
    ]);
  }

  const scope = globalScope(ctx.parameters, station);
  const axisPoint = evaluateBridgeAxis(axis, alignment, scope, s);
  // okraj podľa krivky sa meria od osi mosta po jej vodorovnej normále (rovina prierezu)
  const edge: EdgeResolver | undefined = axisPoint.ok
    ? (law) => {
        const { point, frame } = axisPoint.value;
        return edgeDistance(
          ctx,
          law.curve,
          vec2(point.x, point.y),
          vec2(frame.normal.x, frame.normal.y),
          law.side,
          station,
        );
      }
    : undefined;
  const params = profileParameterValues(profile, sup.parameterLaws, scope, station, edge);
  const evaluated = evaluateProfileDefinition(profile, params.values, scope, station);
  const issues: ModelIssue[] = [
    ...params.issues
      // bez osi mosta sa okraj nedá zmerať; chybu osi hlási os sama
      .filter((i) => axisPoint.ok || i.code !== 'EdgeCurveNotFound')
      .map((i) => ({ owner, ...i })),
    ...evaluated.issues.map((i) => ({
      owner: { kind: 'profile' as const, name: profile.name },
      ...i,
    })),
  ];
  if (!axisPoint.ok) issues.push(axisPoint.issue);
  const axisValue = axisPoint.ok ? axisPoint.value : undefined;

  return {
    s,
    station,
    loops: evaluated.loops,
    points: evaluated.points,
    area: evaluated.area,
    centroid: evaluated.centroid,
    axis: axisValue,
    toWorld: axisValue
      ? sectionToWorld(axisValue, sup.orientation)
      : (p) => ({ x: p.x, y: 0, z: p.y }),
    issues,
  };
}

/**
 * Transformácia z roviny prierezu do lokálnych súradníc: x pozdĺž vodorovnej normály vpravo,
 * y zvislo (`vertical`) alebo pozdĺž binormály kolmo na niveletu (`normalToGrade`).
 */
export function sectionToWorld(
  axis: BridgeAxisPoint,
  orientation: Superstructure['orientation'],
): (p: Vec2) => Vec3 {
  const o = axis.point;
  const n = axis.frame.normal;
  const up = orientation === 'vertical' ? { x: 0, y: 0, z: 1 } : axis.frame.binormal;
  return (p) => ({
    x: o.x + p.x * n.x + p.y * up.x,
    y: o.y + p.x * n.y + p.y * up.y,
    z: o.z + p.x * n.z + p.y * up.z,
  });
}
