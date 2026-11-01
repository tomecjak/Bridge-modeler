import type { Alignment } from '@bridge/alignment';
import { type DeckDrawingData, deckDrawingData } from '@bridge/drawing';
import type { ParameterSet } from '@bridge/model';
import type { BearingLineResult, SupportResult } from '@bridge/sections';
import { useMemo } from 'react';
import { useProject } from './projectStore.ts';

/**
 * Geometria NK pre pôdorys a pozdĺžny rez (obrys, os mosta, rez v osi, rezy podperami, osi uloženia); prepočíta sa pri
 * zmene osí, parametrov, prvkov mosta, osí uloženia alebo podpier. Vzorky sú rovnaké ako v 3D (ADR 0012).
 */
export function useDeckDrawings(
  alignments: ReadonlyMap<string, Alignment>,
  parameters: ParameterSet,
  supports: readonly SupportResult[],
  lines: readonly BearingLineResult[],
): DeckDrawingData[] {
  const project = useProject((s) => s.project);
  const { bridgeAxes, profiles, superstructures, planLines } = project;
  const globals = project.parameters;
  return useMemo(() => {
    const ctx = { alignments, parameters, bridgeAxes, profiles, planLines };
    const globalLaws = globals.map((p) => ({ law: p.law, unit: p.unit }));
    return superstructures.flatMap(
      (sup) => deckDrawingData(ctx, sup, supports, { globalLaws }, lines) ?? [],
    );
  }, [
    alignments,
    parameters,
    bridgeAxes,
    profiles,
    planLines,
    superstructures,
    supports,
    lines,
    globals,
  ]);
}
