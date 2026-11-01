import type { AxisLength, BridgeLengths, Span, SupportResult } from '@bridge/sections';

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

/** Čiastky presahu opory za koncom NK po osi mosta [m]: hranice medzera / múrik / krídlo, od konca NK von. */
export interface AbutmentSplits {
  start: readonly number[];
  end: readonly number[];
}

/**
 * Čiastky presahu krajných opôr s prahom (ADR 0018): medzera g a zadná líca múrika g + t od konca NK; monolitická
 * opora končí NK na zadnej líci steny, presah sú len krídla.
 */
export function abutmentSplits(supports: readonly SupportResult[]): AbutmentSplits {
  const side = (which: 'start' | 'end') => {
    const r = supports.find((x) => x.deckEnd?.side === which);
    const g = r?.support.geometry;
    const gap = r?.dimensions.gap;
    const wall = r?.dimensions.backwallThickness;
    if (g?.type !== 'abutment' || g.construction !== 'bearing') return [];
    if (gap === undefined || wall === undefined || !Number.isFinite(gap + wall)) return [];
    return [gap, gap + wall];
  };
  return { start: side('start'), end: side('end') };
}

/**
 * Reťazce kót ako na výkrese 212-00 (len na obrazovke, ADR 0012): celková dĺžka; dĺžka NK s presahmi opôr (pri opore
 * s prahom krídlo · múrik · medzera, `splits`); rozpätia s presahmi konca NK za osou uloženia; premostenie
 * s predsadením prahov. Hodnoty sú vodorovné dĺžky po osi mosta.
 */
export function bridgeDimensions(
  spans: readonly Span[],
  lengths: BridgeLengths,
  measure: Pick<AxisLength, 'lengthAt' | 'stationAt'>,
  splits: AbutmentSplits = { start: [], end: [] },
): DimensionChain[] {
  const { deck, overall, bridged } = lengths;
  const segment = (sFrom: number, sTo: number): DimensionSegment => ({
    sFrom,
    sTo,
    value: measure.lengthAt(sTo) - measure.lengthAt(sFrom),
  });
  /** úseky medzi dĺžkami po osi mosta `ls` (vzostupne) */
  const chain = (ls: readonly number[], sFirst: number, sLast: number): DimensionSegment[] => {
    const ss = ls.map((l, i) =>
      i === 0 ? sFirst : i === ls.length - 1 ? sLast : measure.stationAt(l),
    );
    return ss.slice(1).map((s, i) => segment(ss[i] as number, s));
  };
  const inside = (l: number, a: number, b: number) => l > a + 1e-6 && l < b - 1e-6;
  const startLs = [
    overall.lFrom,
    ...splits.start
      .map((d) => deck.lFrom - d)
      .filter((l) => inside(l, overall.lFrom, deck.lFrom))
      .sort((a, b) => a - b),
    deck.lFrom,
  ];
  const endLs = [
    deck.lTo,
    ...splits.end
      .map((d) => deck.lTo + d)
      .filter((l) => inside(l, deck.lTo, overall.lTo))
      .sort((a, b) => a - b),
    overall.lTo,
  ];
  const chains: DimensionChain[] = [
    {
      kind: 'overall',
      segments: [{ sFrom: overall.sFrom, sTo: overall.sTo, value: overall.length }],
    },
    {
      kind: 'deck',
      segments: [
        ...(overall.lFrom < deck.lFrom - 1e-6 ? chain(startLs, overall.sFrom, deck.sFrom) : []),
        { sFrom: deck.sFrom, sTo: deck.sTo, value: deck.length },
        ...(overall.lTo > deck.lTo + 1e-6 ? chain(endLs, deck.sTo, overall.sTo) : []),
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
