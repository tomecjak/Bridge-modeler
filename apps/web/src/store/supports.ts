import type { Alignment } from '@bridge/alignment';
import { defaultAbutmentGeometry, type ParameterSet, type Support } from '@bridge/model';
import {
  type AxisLength,
  type BridgeLengths,
  bridgeAxisLength,
  bridgeAxisPlan,
  bridgeLengths,
  evaluateSpans,
  evaluateSupport,
  type SpanResult,
  type SupportResult,
} from '@bridge/sections';
import { useMemo } from 'react';
import { useProject } from './projectStore.ts';

/** Polia NK a dĺžky mosta (NK, premostenie, celková) vodorovne po osi mosta [m] (ADR 0007, 0010). */
export type DeckSpans = SpanResult & { lengths?: BridgeLengths };

/** Presah osi mosta za konce NK pri hľadaní líc prahov [m]. */
const AXIS_REACH = 30;

/** Prevod staničenie ↔ dĺžka po osi mosta pre každú os mosta (podľa id); prepočíta sa pri zmene osí a parametrov. */
export function useAxisLengths(
  alignments: ReadonlyMap<string, Alignment>,
  parameters: ParameterSet,
): ReadonlyMap<string, AxisLength> {
  const bridgeAxes = useProject((s) => s.project.bridgeAxes);
  return useMemo(() => {
    const map = new Map<string, AxisLength>();
    for (const axis of bridgeAxes) {
      const road = alignments.get(axis.alignment);
      if (road) map.set(axis.id, bridgeAxisLength(axis, road, parameters));
    }
    return map;
  }, [alignments, parameters, bridgeAxes]);
}

export interface SupportState {
  supports: SupportResult[];
  /** polia podľa id NK */
  spans: Map<string, DeckSpans>;
}

/** Podpery a polia projektu; prepočítajú sa pri zmene osí, parametrov alebo prvkov mosta. */
export function useSupportState(
  alignments: ReadonlyMap<string, Alignment>,
  parameters: ParameterSet,
  axisLengths: ReadonlyMap<string, AxisLength>,
): SupportState {
  const project = useProject((s) => s.project);
  const { bridgeAxes, profiles, superstructures, supports, planLines } = project;
  return useMemo(() => {
    const ctx = { alignments, parameters, bridgeAxes, profiles, superstructures, planLines };
    const results = supports.map((s) => evaluateSupport(ctx, s));
    const spans = new Map<string, DeckSpans>();
    for (const sup of superstructures) {
      const own = results.filter((r) => r.support.superstructure === sup.id);
      if (own.length === 0) continue;
      const minSpan = parameters.evaluateAt(sup.from).values.get('minSpan');
      const typology = profiles.find((p) => p.id === sup.profile)?.typology;
      const axis = bridgeAxes.find((a) => a.id === sup.bridgeAxis);
      const measure = axisLengths.get(sup.bridgeAxis);
      const result: DeckSpans = evaluateSpans(sup, own, {
        ...(minSpan === undefined ? {} : { minSpan }),
        typology,
        measure: measure?.lengthAt,
      });
      const road = alignments.get(axis?.alignment ?? '');
      const sFrom = road?.stationing.fromDisplay(sup.from);
      const sTo = road?.stationing.fromDisplay(sup.to);
      if (axis && road && measure && sFrom !== undefined && sTo !== undefined) {
        result.lengths = bridgeLengths({
          measure,
          supports: own,
          sFrom,
          sTo,
          axisLine: bridgeAxisPlan(axis, road, parameters, sFrom - AXIS_REACH, sTo + AXIS_REACH),
        });
      }
      spans.set(sup.id, result);
    }
    return { supports: results, spans };
  }, [
    alignments,
    parameters,
    axisLengths,
    bridgeAxes,
    profiles,
    superstructures,
    supports,
    planLines,
  ]);
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
