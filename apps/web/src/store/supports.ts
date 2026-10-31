import type { Alignment } from '@bridge/alignment';
import { defaultAbutmentGeometry, type ParameterSet, type Support } from '@bridge/model';
import {
  evaluateSpans,
  evaluateSupport,
  overallLength,
  type SpanResult,
  type SupportResult,
} from '@bridge/sections';
import { useMemo } from 'react';
import { useProject } from './projectStore.ts';

/** Polia NK, dĺžka NK a celková dĺžka mosta po konce krídel [m] (ADR 0010). */
export type DeckSpans = SpanResult & { deckLength?: number; overallLength?: number };

export interface SupportState {
  supports: SupportResult[];
  /** polia podľa id NK */
  spans: Map<string, DeckSpans>;
}

/** Podpery a polia projektu; prepočítajú sa pri zmene osí, parametrov alebo prvkov mosta. */
export function useSupportState(
  alignments: ReadonlyMap<string, Alignment>,
  parameters: ParameterSet,
): SupportState {
  const project = useProject((s) => s.project);
  const { bridgeAxes, profiles, superstructures, supports } = project;
  return useMemo(() => {
    const ctx = { alignments, parameters, bridgeAxes, profiles, superstructures };
    const results = supports.map((s) => evaluateSupport(ctx, s));
    const spans = new Map<string, DeckSpans>();
    for (const sup of superstructures) {
      const own = results.filter((r) => r.support.superstructure === sup.id);
      if (own.length === 0) continue;
      const minSpan = parameters.evaluateAt(sup.from).values.get('minSpan');
      const typology = profiles.find((p) => p.id === sup.profile)?.typology;
      const result: DeckSpans = evaluateSpans(sup, own, {
        ...(minSpan === undefined ? {} : { minSpan }),
        typology,
      });
      const road = alignments.get(bridgeAxes.find((a) => a.id === sup.bridgeAxis)?.alignment ?? '');
      const sFrom = road?.stationing.fromDisplay(sup.from);
      const sTo = road?.stationing.fromDisplay(sup.to);
      if (sFrom !== undefined && sTo !== undefined) {
        result.deckLength = sTo - sFrom;
        result.overallLength = overallLength(own, { sFrom, sTo });
      }
      spans.set(sup.id, result);
    }
    return { supports: results, spans };
  }, [alignments, parameters, bridgeAxes, profiles, superstructures, supports]);
}

/**
 * Nová podpera s predvolenými rozmermi; základ 8 m (pilier) alebo 5 m (opora) pod spodkom NK, zaokrúhlené na 0,1 m.
 * Opora má dĺžku podľa šírky NK (krídla pod okrajmi NK, ADR 0010).
 */
export function defaultSupport(
  id: string,
  name: string,
  kind: Support['kind'],
  superstructure: string,
  station: number,
  soffitElevation: number,
  deckWidth = 12,
): Support {
  const length = String(Math.round(deckWidth * 10) / 10);
  return {
    id,
    name,
    kind,
    superstructure,
    station,
    crossingAngle: '90',
    offset: '0',
    geometry:
      kind === 'abutment'
        ? defaultAbutmentGeometry(length)
        : { type: 'wall', thickness: '1.2', length: '4' },
    footing:
      kind === 'abutment'
        ? { length, width: '4', thickness: '1.2' }
        : { length: '8', width: '4', thickness: '1.2' },
    connection: 'bearing',
    bearingHeight: '0.35',
    bearings: ['-1.8', '1.8'],
    foundationTop: String(Math.round((soffitElevation - (kind === 'abutment' ? 5 : 8)) * 10) / 10),
  };
}

/** Predvolené rozmery pri zmene typu podpery. */
export function defaultGeometry(type: Support['geometry']['type']): Support['geometry'] {
  switch (type) {
    case 'wall':
      return { type, thickness: '1.2', length: '4' };
    case 'columns':
      return {
        type,
        shape: 'circle',
        diameter: '1.2',
        width: '1.2',
        depth: '1.2',
        count: '2',
        spacing: '4',
      };
    case 'abutment':
      return defaultAbutmentGeometry();
  }
}
