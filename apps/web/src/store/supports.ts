import type { Alignment } from '@bridge/alignment';
import {
  defaultAbutmentGeometry,
  defaultFoundation,
  type ParameterSet,
  type Support,
} from '@bridge/model';
import {
  type AxisLength,
  type BearingLineResult,
  type BridgeLengths,
  bridgeAxisLength,
  bridgeAxisPlan,
  bridgeLengths,
  type CrossbeamBand,
  crossbeamBands,
  deckCrossbeams,
  evaluateBearingLine,
  evaluateSpans,
  evaluateSupport,
  type SpanResult,
  type SupportResult,
  spanLines,
} from '@bridge/sections';
import { useMemo } from 'react';
import { useProject } from './projectStore.ts';

/**
 * Polia NK, dĺžky mosta (NK, premostenie, celková) vodorovne po osi mosta [m] a pásy priečnikov (ADR 0007, 0017,
 * 0018); problémy priečnikov sú v `issues`.
 */
export type DeckSpans = SpanResult & { lengths?: BridgeLengths; crossbeams?: CrossbeamBand[] };

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
  /** osi uloženia (ADR 0017) */
  lines: BearingLineResult[];
  /** pásy priečnikov podľa id NK (ADR 0018) */
  crossbeams: ReadonlyMap<string, readonly CrossbeamBand[]>;
  supports: SupportResult[];
  /** polia podľa id NK */
  spans: Map<string, DeckSpans>;
}

/** Osi uloženia, podpery a polia projektu; prepočítajú sa pri zmene osí, parametrov alebo prvkov mosta. */
export function useSupportState(
  alignments: ReadonlyMap<string, Alignment>,
  parameters: ParameterSet,
  axisLengths: ReadonlyMap<string, AxisLength>,
): SupportState {
  const project = useProject((s) => s.project);
  const { bridgeAxes, profiles, superstructures, bearingLines, supports, planLines } = project;
  return useMemo(() => {
    const base = {
      alignments,
      parameters,
      bridgeAxes,
      profiles,
      superstructures,
      bearingLines,
      planLines,
    };
    const lines = bearingLines.map((l) => evaluateBearingLine(base, l));
    // pásy priečnikov (ADR 0018) menia prierez NK, a tým aj spodok NK nad ložiskami
    const crossbeams = deckCrossbeams(
      base,
      lines,
      (axis, road) => axisLengths.get(axis.id) ?? bridgeAxisLength(axis, road, parameters),
    );
    const ctx = { ...base, crossbeams };
    const byId = new Map(lines.map((l) => [l.line.id, l]));
    const results = supports.map((s) => evaluateSupport(ctx, s, byId.get(s.bearingLine)));
    const spans = new Map<string, DeckSpans>();
    for (const sup of superstructures) {
      const ownLines = lines.filter((l) => l.line.superstructure === sup.id);
      if (ownLines.length === 0) continue;
      const own = results.filter((r) => r.superstructure === sup.id);
      const minSpan = parameters.evaluateAt(sup.from).values.get('minSpan');
      const typology = profiles.find((p) => p.id === sup.profile)?.typology;
      const axis = bridgeAxes.find((a) => a.id === sup.bridgeAxis);
      const measure = axisLengths.get(sup.bridgeAxis);
      const result: DeckSpans = evaluateSpans(sup, spanLines(ownLines, own), {
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
      if (road && measure) {
        const cb = crossbeamBands({
          deck: sup,
          lines,
          profiles,
          parameters,
          alignment: road,
          measure,
        });
        result.crossbeams = cb.bands;
        result.issues.push(...cb.issues);
      }
      spans.set(sup.id, result);
    }
    return { lines, supports: results, spans, crossbeams };
  }, [
    alignments,
    parameters,
    axisLengths,
    bridgeAxes,
    profiles,
    superstructures,
    bearingLines,
    supports,
    planLines,
  ]);
}

/**
 * Nová podpera na osi uloženia s predvolenými rozmermi (ADR 0019): pilier založený podľa terénu (krytie 0,5 m), opora
 * výškou podpery 4 m; kóta základovej škáry pre prepnutie režimu je odhad 8 m (pilier) alebo 5 m (opora) pod spodkom
 * NK mínus hrúbka základu, na 0,1 m. Opora má dĺžku podľa šírky NK (krídla pod okrajmi NK, ADR 0010), ložiská sú
 * z prierezu NK.
 */
export function defaultSupport(
  id: string,
  name: string,
  kind: Support['kind'],
  bearingLine: string,
  soffitElevation: number,
  deckWidth = 12,
  /** ložiská z prierezu NK (ADR 0019); prázdne = ±1,8 m */
  bearings: readonly number[] = [],
): Support {
  const length = String(Math.round(deckWidth * 10) / 10);
  return {
    id,
    name,
    kind,
    bearingLine,
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
    bearings: bearings.length > 0 ? bearings.map(String) : ['-1.8', '1.8'],
    foundation: defaultFoundation(
      kind,
      String(Math.round((soffitElevation - (kind === 'abutment' ? 5 : 8) - 1.2) * 10) / 10),
    ),
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
