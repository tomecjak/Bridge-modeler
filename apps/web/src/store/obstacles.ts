import type { Alignment } from '@bridge/alignment';
import {
  defaultClearance,
  type Obstacle,
  type ObstacleKind,
  type ParameterSet,
} from '@bridge/model';
import { evaluateObstacle, type ObstacleResult } from '@bridge/sections';
import { useMemo } from 'react';
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
