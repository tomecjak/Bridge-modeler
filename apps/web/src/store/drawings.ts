import type { Alignment } from '@bridge/alignment';
import { type DeckDrawingData, deckDrawingData } from '@bridge/drawing';
import type { ParameterSet } from '@bridge/model';
import type { SupportResult } from '@bridge/sections';
import { useMemo } from 'react';
import { useProject } from './projectStore.ts';

/**
 * Geometria NK pre pôdorys a pozdĺžny rez (obrys, os mosta, rez v osi, rezy podperami); prepočíta sa pri zmene osí,
 * parametrov, prvkov mosta alebo podpier. Vzorky sú rovnaké ako v 3D (ADR 0012).
 */
export function useDeckDrawings(
  alignments: ReadonlyMap<string, Alignment>,
  parameters: ParameterSet,
  supports: readonly SupportResult[],
): DeckDrawingData[] {
  const project = useProject((s) => s.project);
  const { bridgeAxes, profiles, superstructures } = project;
  const globals = project.parameters;
  return useMemo(() => {
    const ctx = { alignments, parameters, bridgeAxes, profiles };
    const globalLaws = globals.map((p) => ({ law: p.law, unit: p.unit }));
    return superstructures.flatMap(
      (sup) => deckDrawingData(ctx, sup, supports, { globalLaws }) ?? [],
    );
  }, [alignments, parameters, bridgeAxes, profiles, superstructures, supports, globals]);
}
