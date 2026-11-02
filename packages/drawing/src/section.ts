import { type Polygon2D, type Vec2, vec2 } from '@bridge/geom';
import { type Drawing, drawingBounds, type Entity, polyline, textHeight } from './model.ts';
import { surveyEntities } from './plan.ts';

export interface SectionInput {
  /** obrysy NK (x = odsadenie od osi cesty vpravo [m], y = výška [m n. m.]) */
  decks: readonly {
    id: string;
    loops: readonly { role: 'outer' | 'void'; points: readonly Vec2[] }[];
  }[];
  /** rímsy NK v reze (ADR 0023), rovnaké súradnice ako NK */
  edgeBeams?: readonly {
    id: string;
    loops: readonly { role: 'outer' | 'void'; points: readonly Vec2[] }[];
  }[];
  /** pohľad na podperu na staničení rezu */
  supports: readonly { id: string; body: readonly Polygon2D[]; footing: Polygon2D | undefined }[];
  terrain: readonly (readonly Vec2[])[];
  /** rez voľnými prierezmi prekážok (x, výška v m n. m.; ADR 0020) */
  clearances?: readonly { id: string; polygons: readonly Polygon2D[] }[];
  /** meračka v reze: priesečníky čiar a zamerané body pri rovine rezu (x, výška v m n. m.; ADR 0021) */
  surveys?: readonly { id: string; points: readonly { at: Vec2; label: string | undefined }[] }[];
  scale?: number;
}

/**
 * Priečny rez na staničení (Fáza 6): NK s dutinami a rímsami, pohľad na podperu, terén a zvislá os cesty cez celý
 * obsah (s presahom 1 m). x = odsadenie od osi cesty, y = výška v m n. m. Bez kót.
 */
export function sectionDrawing(input: SectionInput): Drawing {
  const scale = input.scale ?? 100;
  const th = textHeight(scale);
  const entities: Entity[] = [];
  for (const run of input.terrain) if (run.length >= 2) entities.push(polyline('terrain', run));
  for (const c of input.clearances ?? [])
    for (const p of c.polygons) entities.push(polyline('clearance', p, true, c.id));
  for (const s of input.surveys ?? []) entities.push(...surveyEntities(s, scale / 1000, th * 0.6));
  for (const s of input.supports) {
    if (s.footing) entities.push(polyline('footing', s.footing, true, s.id));
    for (const b of s.body) entities.push(polyline('support', b, true, s.id));
  }
  for (const d of input.decks) {
    for (const l of d.loops) {
      entities.push(polyline(l.role === 'outer' ? 'deck' : 'deckVoid', l.points, true, d.id));
    }
  }
  for (const b of input.edgeBeams ?? [])
    for (const l of b.loops) entities.push(polyline('edgeBeam', l.points, true, b.id));
  const b = drawingBounds({ entities, scale });
  if (b) entities.unshift(polyline('roadAxis', [vec2(0, b.minY - 1), vec2(0, b.maxY + 1)]));
  return { entities, scale };
}
