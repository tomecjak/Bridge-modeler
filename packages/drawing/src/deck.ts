import type { Superstructure } from '@bridge/model';
import {
  type AxisLinePoint,
  bridgeAxisPlan,
  type DeckOutline,
  type DeckSamples,
  type DeckSamplingOptions,
  deckOutline,
  type SectionContext,
  type SupportResult,
  sampleSuperstructure,
} from '@bridge/sections';

/** Geometria jednej NK pre pôdorys a pozdĺžny rez (z parametrov, ADR 0002). */
export interface DeckDrawingData {
  id: string;
  name: string;
  /** názov osi cesty, na ktorej NK leží */
  road: string;
  outline: DeckOutline;
  /** os mosta v pôdoryse v rozsahu NK */
  axis: AxisLinePoint[];
  /** vzorky prierezov NK (rezy v pozdĺžnom profile, `profileCuts`) */
  samples: DeckSamples;
  /** vyhodnotené podpery tejto NK */
  own: SupportResult[];
}

/** Vzorky NK, obrys a os mosta v pôdoryse a jej podpery; `undefined`, ak NK nie je vyhodnotiteľná. */
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
  return {
    id: sup.id,
    name: sup.name,
    road: alignment.name,
    outline: deckOutline(samples),
    axis: bridgeAxisPlan(axis, alignment, ctx.parameters, sFrom, sTo),
    samples,
    own,
  };
}
