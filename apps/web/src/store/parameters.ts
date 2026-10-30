import type { Stationing } from '@bridge/alignment';
import {
  buildParameterSet,
  type ModelIssue,
  type Parameter,
  type ParameterSet,
  validateStations,
} from '@bridge/model';
import { useMemo } from 'react';
import { useProject } from './projectStore.ts';

export interface ParameterState {
  set: ParameterSet;
  /** statické problémy vrátane kontroly hraníc úsekov na osi */
  issues: readonly ModelIssue[];
}

/** Množina parametrov projektu; prepočíta sa len pri zmene parametrov alebo osi. */
export function useParameterState(stationing: Stationing | undefined): ParameterState {
  const parameters = useProject((s) => s.project.parameters);
  return useMemo(() => {
    const set = buildParameterSet(parameters);
    const stationIssues = stationing ? validateStations(parameters, stationing) : [];
    return { set, issues: [...set.issues, ...stationIssues] };
  }, [parameters, stationing]);
}

/** Problémy, ktoré sa týkajú daného parametra (vrátane cyklu, v ktorom je). */
export function issuesOf(issues: readonly ModelIssue[], name: string): ModelIssue[] {
  return issues.filter(
    (i) => i.parameter === name || (i.code === 'Cycle' && i.path.includes(name)),
  );
}

/** Prvý voľný názov p1, p2, … */
export function nextParameterName(parameters: readonly Parameter[]): string {
  const names = new Set(parameters.map((p) => p.name));
  let i = 1;
  while (names.has(`p${i}`)) i++;
  return `p${i}`;
}

let counter = 0;
/** Stabilné ID nového parametra (uloží sa do projektu; ADR 0002 — ID sa už nemení). */
export function newParameterId(): string {
  counter++;
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${counter}`;
  return `par-${random}`;
}
