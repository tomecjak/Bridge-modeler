import { clipPolygonHalfPlane, signedArea, type Vec2, vec2 } from '@bridge/geom';
import { seatFrontLine } from './abutment.ts';
import { type DeckOutline, outlineArea } from './deckOutline.ts';
import type { SupportResult } from './supports.ts';

/** Plocha mosta [m²] a rozsah, z ktorého je: medzi lícami úložných prahov, alebo celá NK (bez dvoch opôr). */
export interface BridgeArea {
  value: number;
  source: 'bridged' | 'deck';
}

/**
 * Plocha mosta (ADR 0024, odpoveď 3): pôdorysná plocha obrysu mosta vrátane ríms (`bridgeOutline`) medzi prednými
 * lícami úložných prahov opôr na koncoch NK; pri konštantnej šírke = dĺžka premostenia v osi × šírka mosta. Bez
 * dvoch opôr plocha celej NK (`source: 'deck'`).
 */
export function bridgeArea(
  outline: Pick<DeckOutline, 'polygon'>,
  supports: readonly SupportResult[],
): BridgeArea {
  const fronts: Partial<Record<'start' | 'end', { point: Vec2; direction: Vec2 }>> = {};
  for (const r of supports) {
    const line = r.deckEnd && seatFrontLine(r);
    if (r.deckEnd && line) fronts[r.deckEnd.side] = line;
  }
  const { start, end } = fronts;
  if (!start || !end) return { value: outlineArea(outline), source: 'deck' };
  // normála líce smeruje k druhej opore (do premostenia)
  const inward = (line: { point: Vec2; direction: Vec2 }, other: Vec2) => {
    const n = vec2(-line.direction.y, line.direction.x);
    const side = (other.x - line.point.x) * n.x + (other.y - line.point.y) * n.y;
    return side >= 0 ? n : vec2(-n.x, -n.y);
  };
  const between = clipPolygonHalfPlane(
    clipPolygonHalfPlane(outline.polygon, start.point, inward(start, end.point)),
    end.point,
    inward(end, start.point),
  );
  return { value: Math.abs(signedArea(between)), source: 'bridged' };
}
