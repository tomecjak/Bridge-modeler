import type { EdgeBeam, Superstructure } from '@bridge/model';
import {
  type AxisLinePoint,
  type BearingLineResult,
  bridgeAxisPlan,
  bridgeOutline,
  type DeckOutline,
  type DeckSamples,
  type DeckSamplingOptions,
  type DeckSegment,
  deckEdgeBeams,
  deckOutline,
  type SectionContext,
  type SupportResult,
  sampleEdgeBeam,
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
  /** vyhodnotené osi uloženia tejto NK (ADR 0017) */
  lines: BearingLineResult[];
  /** rímsy NK (ADR 0023): vzorky ako NK a obrys v pôdoryse (vľavo / vpravo = krajné hrany rímsy) */
  edgeBeams: EdgeBeamDrawingData[];
  /** obrys mosta po vonkajšie hrany ríms (bez ríms = obrys NK) */
  bridgeOutline: DeckOutline;
}

/** Rímsa NK pre výkresy (ADR 0023). */
export interface EdgeBeamDrawingData {
  id: string;
  name: string;
  side: EdgeBeam['side'];
  segment: DeckSegment;
  outline: DeckOutline;
}

/**
 * Vzorky NK, obrys a os mosta v pôdoryse, jej podpery, osi uloženia a rímsy; `undefined`, ak NK nie je
 * vyhodnotiteľná.
 */
export function deckDrawingData(
  ctx: SectionContext,
  sup: Superstructure,
  supports: readonly SupportResult[],
  options: DeckSamplingOptions = {},
  lines: readonly BearingLineResult[] = [],
): DeckDrawingData | undefined {
  const own = supports.filter((r) => r.superstructure === sup.id);
  const samples = sampleSuperstructure(ctx, sup, own, options);
  if (!('sections' in samples)) return undefined;
  const { alignment, axis, sFrom, sTo } = samples;
  const outline = deckOutline(samples);
  const edgeBeams = deckEdgeBeams(ctx, sup).map((b): EdgeBeamDrawingData => {
    const segment = sampleEdgeBeam(ctx, b, samples);
    return {
      id: b.id,
      name: b.name,
      side: b.side,
      segment,
      outline: deckOutline({ ...segment, endAngles: samples.endAngles }),
    };
  });
  return {
    id: sup.id,
    name: sup.name,
    road: alignment.name,
    outline,
    axis: bridgeAxisPlan(axis, alignment, ctx.parameters, sFrom, sTo),
    samples,
    own,
    lines: lines.filter((l) => l.line.superstructure === sup.id && l.axis),
    edgeBeams,
    bridgeOutline: bridgeOutline(outline, edgeBeams),
  };
}
