import type { Alignment } from '@bridge/alignment';
import { type DrawnSection, projectSection } from '@bridge/drawing';
import type { EdgeBeam, ModelIssue, ParameterSet, Superstructure } from '@bridge/model';
import {
  type CrossbeamBand,
  evaluateEdgeBeam,
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
  /** rímsy NK na staničení rezu (ADR 0023), kotvené na hlavný prierez NK */
  edgeBeams: { beam: EdgeBeam; section: SuperstructureSection; drawn: DrawnSection | undefined }[];
}

/**
 * Prierezy všetkých NK a ich ríms na zobrazovanom staničení (v páse priečnika prierez priečnika, ADR 0018) a čas
 * výpočtu (cieľ < 100 ms, PLAN.md Fáza 3).
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
  const edgeBeams = useProject((s) => s.project.edgeBeams);
  return useMemo(() => {
    const start = performance.now();
    const ctx: SectionContext = {
      alignments,
      parameters,
      bridgeAxes,
      profiles,
      planLines,
      crossbeams,
      edgeBeams,
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
        return { superstructure: sup, section: undefined, drawn: undefined, issues, edgeBeams: [] };
      }
      const section = evaluateSuperstructure(ctx, sup, s);
      const beams = edgeBeams.filter((b) => b.superstructure === sup.id);
      // v páse priečnika sa rímsa drží hlavného prierezu NK
      const main =
        beams.length > 0 && crossbeams.get(sup.id)?.length
          ? evaluateSuperstructure(
              ctx,
              sup,
              s,
              profiles.find((p) => p.id === sup.profile),
            )
          : section;
      return {
        superstructure: sup,
        section,
        drawn: projectSection(section, road, s, sup.id, sup.name),
        issues: section.issues,
        edgeBeams: beams.map((beam) => {
          const own = evaluateEdgeBeam(ctx, beam, main);
          return { beam, section: own, drawn: projectSection(own, road, s, beam.id, beam.name) };
        }),
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
    edgeBeams,
  ]);
}
