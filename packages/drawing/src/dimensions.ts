import type { BridgeLengths, Span } from '@bridge/sections';

/** Úsek kóty: spojité staničenie osi cesty začiatku a konca a hodnota po osi mosta [m]. */
export interface DimensionSegment {
  sFrom: number;
  sTo: number;
  value: number;
  /** poradie poľa NK (len úseky rozpätí; dajú sa upraviť zadaním hodnoty, ADR 0017) */
  span?: number;
}

/** Reťazec kót mosta (Fáza 10b): celková dĺžka, dĺžka NK, rozpätia, premostenie. */
export interface DimensionChain {
  kind: 'overall' | 'deck' | 'spans' | 'bridged';
  segments: DimensionSegment[];
}

/**
 * Reťazce kót ako na výkrese 212-00 (len na obrazovke, ADR 0012): celková dĺžka; dĺžka NK s presahmi opôr; rozpätia
 * s presahmi konca NK za osou uloženia; premostenie s predsadením prahov. Hodnoty sú vodorovné dĺžky po osi mosta
 * (`measure` = dĺžka po osi mosta v staničení s).
 */
export function bridgeDimensions(
  spans: readonly Span[],
  lengths: BridgeLengths,
  measure: (s: number) => number,
): DimensionChain[] {
  const { deck, overall, bridged } = lengths;
  const segment = (sFrom: number, sTo: number): DimensionSegment => ({
    sFrom,
    sTo,
    value: measure(sTo) - measure(sFrom),
  });
  const chains: DimensionChain[] = [
    {
      kind: 'overall',
      segments: [{ sFrom: overall.sFrom, sTo: overall.sTo, value: overall.length }],
    },
    {
      kind: 'deck',
      segments: [
        ...(overall.lFrom < deck.lFrom - 1e-6 ? [segment(overall.sFrom, deck.sFrom)] : []),
        { sFrom: deck.sFrom, sTo: deck.sTo, value: deck.length },
        ...(overall.lTo > deck.lTo + 1e-6 ? [segment(deck.sTo, overall.sTo)] : []),
      ],
    },
  ];
  const first = spans[0];
  const last = spans[spans.length - 1];
  if (first && last) {
    chains.push({
      kind: 'spans',
      segments: [
        ...(first.from.s > deck.sFrom + 1e-6 ? [segment(deck.sFrom, first.from.s)] : []),
        ...spans.map((sp) => ({
          sFrom: sp.from.s,
          sTo: sp.to.s,
          value: sp.length,
          span: sp.index,
        })),
        ...(last.to.s < deck.sTo - 1e-6 ? [segment(last.to.s, deck.sTo)] : []),
      ],
    });
    if (bridged) {
      chains.push({
        kind: 'bridged',
        segments: [
          segment(first.from.s, bridged.sFrom),
          { sFrom: bridged.sFrom, sTo: bridged.sTo, value: bridged.length },
          segment(bridged.sTo, last.to.s),
        ],
      });
    }
  }
  return chains;
}
