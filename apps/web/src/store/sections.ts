import type { Alignment } from '@bridge/alignment';
import { type DrawnSection, projectSection } from '@bridge/drawing';
import type { ModelIssue, ParameterSet, Superstructure } from '@bridge/model';
import {
  type CrossbeamBand,
  evaluateSuperstructure,
  type SectionContext,
  type SuperstructureSection,
} from '@bridge/sections';
import { useMemo } from 'react';
import { useProject } from './projectStore.ts';

export interface SectionResult {
  superstructure: Superstructure;
  section: SuperstructureSection | undefined;
  drawn: DrawnSection | undefined;
  issues: ModelIssue[];
}

/**
 * Prierezy všetkých NK na zobrazovanom staničení (v páse priečnika prierez priečnika, ADR 0018) a čas výpočtu
 * (cieľ < 100 ms, PLAN.md Fáza 3).
 */
export function useSectionResults(
  alignments: ReadonlyMap<string, Alignment>,
  parameters: ParameterSet,
  station: number,
  crossbeams: ReadonlyMap<string, readonly CrossbeamBand[]>,
): { results: SectionResult[]; elapsed: number } {
  const bridgeAxes = useProject((s) => s.project.bridgeAxes);
  const profiles = useProject((s) => s.project.profiles);
  const superstructures = useProject((s) => s.project.superstructures);
  const planLines = useProject((s) => s.project.planLines);
  return useMemo(() => {
    const start = performance.now();
    const ctx: SectionContext = {
      alignments,
      parameters,
      bridgeAxes,
      profiles,
      planLines,
      crossbeams,
    };
    const results = superstructures.map((sup): SectionResult => {
      const axis = bridgeAxes.find((a) => a.id === sup.bridgeAxis);
      const road = axis ? alignments.get(axis.alignment) : undefined;
      const s = road?.stationing.fromDisplay(station);
      if (!road || s === undefined) {
        const section = evaluateSuperstructure(ctx, sup, 0);
        const issues: ModelIssue[] = road
          ? [
              {
                code: 'StationNotOnAlignment',
                station,
                owner: { kind: 'superstructure', name: sup.name },
              },
            ]
          : section.issues;
        return { superstructure: sup, section: undefined, drawn: undefined, issues };
      }
      const section = evaluateSuperstructure(ctx, sup, s);
      return {
        superstructure: sup,
        section,
        drawn: projectSection(section, road, s, sup.id, sup.name),
        issues: section.issues,
      };
    });
    return { results, elapsed: performance.now() - start };
  }, [
    alignments,
    parameters,
    bridgeAxes,
    profiles,
    planLines,
    superstructures,
    station,
    crossbeams,
  ]);
}
