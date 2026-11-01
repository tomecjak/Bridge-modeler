import type { Alignment } from '@bridge/alignment';
import { formatStation } from '@bridge/alignment';
import { type Vec2, vec2 } from '@bridge/geom';
import {
  defaultClearance,
  type Obstacle,
  type ObstacleKind,
  type ParameterSet,
} from '@bridge/model';
import {
  clearanceAlong,
  clearanceFootprint,
  clearanceRegions,
  evaluateObstacle,
  type ObstacleResult,
} from '@bridge/sections';
import { useMemo } from 'react';
import { formatNumber } from '../format/number.ts';
import { sk } from '../i18n/sk.ts';
import { useProject } from './projectStore.ts';

/** Prekážky projektu s krížením a voľným prierezom (ADR 0020); prepočítajú sa pri zmene podkladov a mostov. */
export function useObstacleState(
  alignments: ReadonlyMap<string, Alignment>,
  parameters: ParameterSet,
): ObstacleResult[] {
  const obstacles = useProject((s) => s.project.obstacles);
  const bridgeAxes = useProject((s) => s.project.bridgeAxes);
  const superstructures = useProject((s) => s.project.superstructures);
  const planLines = useProject((s) => s.project.planLines);
  return useMemo(
    () =>
      obstacles.map((o) =>
        evaluateObstacle({ alignments, parameters, bridgeAxes, superstructures, planLines }, o),
      ),
    [obstacles, alignments, parameters, bridgeAxes, superstructures, planLines],
  );
}

/** Meno novej prekážky podľa druhu s ďalším voľným číslom („Cesta 2“). */
export function obstacleName(base: string, existing: readonly string[]): string {
  const names = new Set(existing);
  let n = 1;
  while (names.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

/**
 * Nová prekážka (ADR 0020) s predvoľbou voľného prierezu druhu: os z LandXML má úroveň podľa nivelety, ostatné
 * kótu `level` [m n. m.] (odhad, projektant ju prepíše).
 */
export function newObstacle(input: {
  id: string;
  name: string;
  kind: ObstacleKind;
  reference: Obstacle['reference'];
  /** os z LandXML má niveletu */
  graded: boolean;
  level: number;
}): Obstacle {
  return {
    id: input.id,
    name: input.name,
    kind: input.kind,
    reference: input.reference,
    level: input.graded
      ? { kind: 'grade' }
      : { kind: 'constant', value: String(Math.round(input.level * 100) / 100) },
    clearance: defaultClearance(input.kind),
  };
}

/** Popis prekážky v profile: km kríženia, názov, druh, pri vodnom toku hladina Q100 [m n. m.]. */
export function obstacleLabel(r: ObstacleResult, z0: number): string {
  const c = r.crossings[0];
  const parts = [
    ...(c ? [formatStation(c.station, 3)] : []),
    `${r.obstacle.name} (${sk.obstacles.kinds[r.obstacle.kind]})`,
  ];
  if (r.obstacle.kind === 'water' && c?.level !== undefined)
    parts.push(`Q100 ${formatNumber(c.level + z0, 2)}`);
  return parts.join(' · ');
}

/** Rezy voľnými prierezmi čiarou profilu (u, lokálne z) s popisom; prekážky bez rezu chýbajú. */
export function profileObstacles(
  results: readonly ObstacleResult[],
  line: readonly { u: number; point: Vec2 }[],
  z0: number,
) {
  return results.flatMap((r) => {
    const cut = clearanceAlong(r, line);
    return cut.polygons.length > 0 || cut.axis.length > 0
      ? [{ id: r.obstacle.id, label: obstacleLabel(r, z0), ...cut }]
      : [];
  });
}

/** Prekážky v pôdoryse: os a pás voľného prierezu v okolí krížení, popis pri prvom krížení. */
export function planObstacles(results: readonly ObstacleResult[]) {
  return results.map((r) => ({
    id: r.obstacle.id,
    label: `${r.obstacle.name} (${sk.obstacles.kinds[r.obstacle.kind]})`,
    axis: clearanceRegions(r).map((region) => region.map((p) => p.point)),
    footprint: clearanceFootprint(r),
    at: r.crossings[0]?.point,
  }));
}

/**
 * Rezy voľnými prierezmi v priečnom reze na staničení (x = odsadenie od osi cesty vpravo, y = výška v m n. m.):
 * čiara rezu kolmo na os cesty v dosahu `halfWidth`.
 */
export function sectionClearances(
  results: readonly ObstacleResult[],
  road: Alignment,
  s: number,
  halfWidth = 60,
) {
  const h = road.evaluateHorizontal(s);
  const n = vec2(Math.cos(h.azimuth), -Math.sin(h.azimuth)); // vpravo od osi
  const line = [-halfWidth, 0, halfWidth].map((x) => ({
    u: x,
    point: vec2(h.point.x + x * n.x, h.point.y + x * n.y),
  }));
  return results.flatMap((r) => {
    const polygons = clearanceAlong(r, line).polygons.map((p) =>
      p.map((q) => vec2(q.x, q.y + road.origin.z)),
    );
    return polygons.length > 0 ? [{ id: r.obstacle.id, polygons }] : [];
  });
}
