import type { Superstructure } from '@bridge/model';
import {
  type AxisCut,
  type AxisLinePoint,
  bridgeAxisPlan,
  cutAlongAxis,
  type DeckLongitudinal,
  type DeckOutline,
  type DeckSamplingOptions,
  deckLongitudinal,
  deckOutline,
  type SectionContext,
  type SupportResult,
  sampleSuperstructure,
  supportParts,
} from '@bridge/sections';

/** Presah osi mosta za konce NK pre rez podperami (opory s krídlami) [m]. */
const CUT_REACH = 30;

/** Geometria jednej NK pre pôdorys a pozdĺžny rez (z parametrov, ADR 0002). */
export interface DeckDrawingData {
  id: string;
  name: string;
  /** názov osi cesty, na ktorej NK leží */
  road: string;
  outline: DeckOutline;
  /** os mosta v pôdoryse v rozsahu NK */
  axis: AxisLinePoint[];
  longitudinal: DeckLongitudinal;
  /** rezy podperami tejto NK v jej osi mosta */
  supports: { id: string; name: string; station: number; cut: AxisCut[] }[];
}

/** Vzorky NK, obrys v pôdoryse, rez v osi mosta a rezy jej podperami; `undefined`, ak NK nie je vyhodnotiteľná. */
export function deckDrawingData(
  ctx: SectionContext,
  sup: Superstructure,
  supports: readonly SupportResult[],
  options: DeckSamplingOptions = {},
): DeckDrawingData | undefined {
  const own = supports.filter((r) => r.support.superstructure === sup.id);
  const samples = sampleSuperstructure(ctx, sup, own, options);
  if (!('sections' in samples)) return undefined;
  const { alignment, axis, sFrom, sTo } = samples;
  const line = bridgeAxisPlan(axis, alignment, ctx.parameters, sFrom - CUT_REACH, sTo + CUT_REACH);
  return {
    id: sup.id,
    name: sup.name,
    road: alignment.name,
    outline: deckOutline(samples),
    axis: line.filter((p) => p.s >= sFrom - 1e-9 && p.s <= sTo + 1e-9),
    longitudinal: deckLongitudinal(samples),
    supports: own.map((r) => ({
      id: r.support.id,
      name: r.support.name,
      station: r.station,
      cut: cutAlongAxis(supportParts(r), line),
    })),
  };
}
