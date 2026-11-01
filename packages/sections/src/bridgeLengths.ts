import type { Vec2 } from '@bridge/geom';
import { overallExtent, seatFrontLine } from './abutment.ts';
import type { AxisLength } from './axisLength.ts';
import type { AxisLinePoint } from './longitudinal.ts';
import type { SupportResult } from './supports.ts';

/** Úsek po osi mosta: spojité staničenie osi cesty a dĺžka po osi mosta (ADR 0007, doplnok 10b). */
export interface LengthRange {
  sFrom: number;
  sTo: number;
  /** dĺžka po osi mosta od začiatku osi cesty */
  lFrom: number;
  lTo: number;
  length: number;
}

export interface BridgeLengths {
  /** dĺžka NK (od–do v osi mosta) */
  deck: LengthRange;
  /** dĺžka premostenia: predné líca úložných prahov oboch opôr; bez dvoch opôr chýba */
  bridged: LengthRange | undefined;
  /** celková dĺžka po konce krídel (väčšia zo strán), v osi mosta okolo stredu strán */
  overall: LengthRange;
}

/**
 * Dĺžky mosta vodorovne po osi mosta (Fáza 10b): NK, premostenie a celková dĺžka. Premostenie z priesečníkov
 * prednej líce úložného prahu s osou mosta v pôdoryse (`axisLine`); celková dĺžka = dĺžka NK + presahy opôr za
 * koncami NK po dotyčnici osi mosta (ADR 0010).
 */
export function bridgeLengths(input: {
  measure: AxisLength;
  supports: readonly SupportResult[];
  sFrom: number;
  sTo: number;
  axisLine: readonly AxisLinePoint[];
}): BridgeLengths {
  const { measure, supports, sFrom, sTo, axisLine } = input;
  const range = (a: number, b: number, la = measure.lengthAt(a), lb = measure.lengthAt(b)) => ({
    sFrom: a,
    sTo: b,
    lFrom: la,
    lTo: lb,
    length: lb - la,
  });
  const deck = range(sFrom, sTo);

  const fronts = { start: undefined as number | undefined, end: undefined as number | undefined };
  for (const r of supports) {
    const line = r.deckEnd && seatFrontLine(r);
    if (!r.deckEnd || !line) continue;
    const s = crossingStation(axisLine, line.point, line.direction, r.s);
    if (s !== undefined) fronts[r.deckEnd.side] = s;
  }
  const bridged =
    fronts.start !== undefined && fronts.end !== undefined
      ? range(fronts.start, fronts.end)
      : undefined;

  // na každej strane rovnobežne s osou mosta; poloha v osi = priemer strán (šikmé konce), dĺžka = väčšia strana
  const ext = overallExtent(supports, { sFrom, sTo });
  const lFromOf = (side: 'left' | 'right') => deck.lFrom - (sFrom - ext.from[side]);
  const lToOf = (side: 'left' | 'right') => deck.lTo + (ext.to[side] - sTo);
  const length = Math.max(lToOf('left') - lFromOf('left'), lToOf('right') - lFromOf('right'));
  const center = (lFromOf('left') + lFromOf('right') + lToOf('left') + lToOf('right')) / 4;
  const overall = range(
    measure.stationAt(center - length / 2),
    measure.stationAt(center + length / 2),
    center - length / 2,
    center + length / 2,
  );
  return { deck, bridged, overall };
}

/** Staničenie priesečníka priamky (bod, smer) s polyline osi mosta; pri viacerých ten najbližšie k `near`. */
function crossingStation(
  line: readonly AxisLinePoint[],
  point: Vec2,
  direction: Vec2,
  near: number,
): number | undefined {
  let best: number | undefined;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i] as AxisLinePoint;
    const b = line[i + 1] as AxisLinePoint;
    const ex = b.point.x - a.point.x;
    const ey = b.point.y - a.point.y;
    const den = ex * direction.y - ey * direction.x;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((point.x - a.point.x) * direction.y - (point.y - a.point.y) * direction.x) / den;
    if (t < -1e-9 || t > 1 + 1e-9) continue;
    const s = a.s + t * (b.s - a.s);
    if (best === undefined || Math.abs(s - near) < Math.abs(best - near)) best = s;
  }
  return best;
}
