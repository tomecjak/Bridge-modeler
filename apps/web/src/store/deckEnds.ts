import { effectiveParameters, type ProjectFile } from '@bridge/model';
import { resolveDeckEnds } from '@bridge/sections';
import type { Draft } from 'immer';
import { alignmentsOf, measureOf, parametersOf } from './modelCache.ts';

/**
 * Zosúladenie koncov NK s oporami po príkaze (ADR 0018): úprava draftu, ktorá zapíše odvodené od / do; undefined, ak
 * je projekt v súlade.
 */
export function syncDeckEnds(
  project: ProjectFile,
): ((draft: Draft<ProjectFile>) => void) | undefined {
  const origin = project.crs.origin;
  if (!origin || project.superstructures.length === 0 || project.bearingLines.length === 0)
    return undefined;
  const parameters = parametersOf(effectiveParameters(project));
  const changes = resolveDeckEnds({
    superstructures: project.superstructures,
    bearingLines: project.bearingLines,
    supports: project.supports,
    bridgeAxes: project.bridgeAxes,
    alignments: alignmentsOf(project, origin),
    parameters,
    measure: (axis, alignment) => measureOf(axis, alignment, parameters),
  });
  if (changes.length === 0) return undefined;
  return (draft) => {
    for (const c of changes) {
      const deck = draft.superstructures.find((d) => d.id === c.id);
      if (!deck) continue;
      deck.from = c.from;
      deck.to = c.to;
    }
  };
}
