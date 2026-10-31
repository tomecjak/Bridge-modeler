import { type Alignment, formatStation } from '@bridge/alignment';
import { type Polygon2D, vec2 } from '@bridge/geom';
import type { AxisCut, DeckLongitudinal } from '@bridge/sections';
import { type Drawing, type Entity, polyline, textHeight } from './model.ts';
import { sampleProfile } from './sampling.ts';

export interface ProfileInput {
  alignment: Alignment;
  /** rez NK v osi mosta (x = s, y = lokálne z) */
  decks: readonly { id: string; cut: DeckLongitudinal }[];
  /** rezy podpier v osi mosta (lokálne z) */
  supports: readonly { id: string; name: string; station: number; cut: readonly AxisCut[] }[];
  /** terénne čiary (s, výška v m n. m.) */
  terrain: readonly (readonly { s: number; z: number }[])[];
  scale?: number;
}

/**
 * Rozvinutý pozdĺžny rez v osi mosta (Fáza 6), 1 : 1 bez prevýšenia: x = spojité staničenie osi cesty [m],
 * y = výška [m n. m.]. Niveleta, terén, NK a dutiny, rezy podpier (základ zvlášť) a nad každou podperou zvislý text
 * s názvom a staničením. Bez kót.
 */
export function profileDrawing(input: ProfileInput): Drawing {
  const scale = input.scale ?? 200;
  const th = textHeight(scale);
  const z0 = input.alignment.origin.z;
  const lift = (poly: Polygon2D) => poly.map((p) => vec2(p.x, p.y + z0));
  const entities: Entity[] = [];

  const grade = sampleProfile(input.alignment).map((p) => vec2(p.s, p.z));
  if (grade.length >= 2) entities.push(polyline('grade', grade));
  for (const run of input.terrain) {
    if (run.length >= 2)
      entities.push(
        polyline(
          'terrain',
          run.map((p) => vec2(p.s, p.z)),
        ),
      );
  }
  for (const deck of input.decks) {
    for (const o of deck.cut.outer) entities.push(polyline('deck', lift(o), true, deck.id));
    for (const v of deck.cut.voids) entities.push(polyline('deckVoid', lift(v), true, deck.id));
  }
  for (const s of input.supports) {
    for (const c of s.cut) {
      entities.push(
        polyline(c.part === 'footing' ? 'footing' : 'support', lift(c.outline), true, s.id),
      );
    }
    const pts = s.cut.flatMap((c) => c.outline);
    if (pts.length === 0) continue;
    const top = Math.max(...pts.map((p) => p.y)) + z0;
    const xs = pts.map((p) => p.x);
    const x = (Math.min(...xs) + Math.max(...xs)) / 2;
    entities.push({
      kind: 'text',
      layer: 'label',
      at: vec2(x + th / 2, top + (3 * scale) / 1000),
      text: `${s.name}  ${formatStation(s.station, 3)}`,
      height: th,
      rotation: Math.PI / 2,
      align: 'left',
      owner: s.id,
    });
  }
  return { entities, scale };
}
