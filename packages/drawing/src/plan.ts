import { type Alignment, formatStation } from '@bridge/alignment';
import { type Polygon2D, type Vec2, vec2 } from '@bridge/geom';
import {
  type AxisLinePoint,
  BEARING_PLAN_SIZE,
  type DeckOutline,
  type SupportResult,
  supportPlan,
} from '@bridge/sections';
import { type Drawing, type Entity, polyline, textHeight } from './model.ts';
import { sampleHorizontal, stationTicks } from './sampling.ts';
import { readableText } from './text.ts';

export interface PlanInput {
  alignment: Alignment;
  decks: readonly { id: string; outline: DeckOutline; axis: readonly AxisLinePoint[] }[];
  supports: readonly SupportResult[];
  /** značky staničenia osi cesty [m]; bez nich sa staničenie nekreslí (pohľad má vlastné podľa priblíženia) */
  stationing?: { step: number; labelStep: number };
  scale?: number;
}

/**
 * Pôdorys (Fáza 6) v lokálnych súradniciach: os cesty so staničením, os mosta, obrys NK, podpery (driek / časti
 * opory, základ, ložiská) a os podpery s názvom. Bez kót.
 */
export function planDrawing(input: PlanInput): Drawing {
  const scale = input.scale ?? 200;
  const th = textHeight(scale);
  const mm = (v: number) => (v * scale) / 1000;
  const entities: Entity[] = [];
  const { alignment } = input;

  entities.push(
    polyline(
      'roadAxis',
      sampleHorizontal(alignment).map((p) => vec2(p.x, p.y)),
    ),
  );
  if (input.stationing) {
    const { step, labelStep } = input.stationing;
    for (const t of stationTicks(alignment.stationing, step)) {
      const h = alignment.evaluateHorizontal(t.s);
      const n = vec2(Math.cos(h.azimuth), -Math.sin(h.azimuth)); // vpravo od osi
      const major = Math.abs(t.station / labelStep - Math.round(t.station / labelStep)) < 1e-6;
      const len = mm(major ? 3 : 1.5);
      const p = h.point;
      entities.push(
        polyline('stationing', [
          vec2(p.x - len * n.x, p.y - len * n.y),
          vec2(p.x + len * n.x, p.y + len * n.y),
        ]),
      );
      if (major) {
        const at = vec2(p.x - mm(5) * n.x, p.y - mm(5) * n.y);
        // text vľavo od osi, kolmo na ňu, smerom od osi
        const rotation = Math.atan2(-n.y, -n.x);
        entities.push(
          readableText('stationing', at, formatStation(t.station, 0), th, rotation, 'left'),
        );
      }
    }
  }

  for (const deck of input.decks) {
    if (deck.axis.length >= 2) {
      entities.push(
        polyline(
          'bridgeAxis',
          deck.axis.map((p) => p.point),
          false,
          deck.id,
        ),
      );
    }
    if (deck.outline.polygon.length >= 3) {
      entities.push(polyline('deck', deck.outline.polygon, true, deck.id));
    }
  }

  for (const r of input.supports) {
    const plan = supportPlan(r);
    if (!plan || r.bearings.length === 0) continue;
    const id = r.support.id;
    if (plan.footing) entities.push(polyline('footing', plan.footing, true, id));
    for (const b of plan.body) entities.push(polyline('support', b, true, id));
    const d = r.direction;
    const across = vec2(d.y, -d.x);
    const h = BEARING_PLAN_SIZE / 2;
    for (const b of r.bearings) {
      const c = b.plan;
      const corner = (su: number, sv: number) =>
        vec2(c.x + su * h * d.x + sv * h * across.x, c.y + su * h * d.y + sv * h * across.y);
      entities.push(
        polyline('bearing', [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)], true, id),
      );
    }
    entities.push(
      ...supportAxis(r, [...plan.body, ...(plan.footing ? [plan.footing] : [])], mm, th),
    );
  }
  return { entities, scale };
}

/** Os podpery cez pôdorys podpery s presahom 5 mm na papieri a názov podpery za jej koncom. */
function supportAxis(
  r: SupportResult,
  polygons: readonly Polygon2D[],
  mm: (v: number) => number,
  th: number,
): Entity[] {
  const d = r.direction;
  const c = r.center;
  const along = polygons.flat().map((p: Vec2) => (p.x - c.x) * d.x + (p.y - c.y) * d.y);
  if (along.length === 0) return [];
  const lo = Math.min(...along) - mm(5);
  const hi = Math.max(...along) + mm(5);
  const at = (u: number) => vec2(c.x + u * d.x, c.y + u * d.y);
  const id = r.support.id;
  return [
    polyline('supportAxis', [at(lo), at(hi)], false, id),
    readableText('label', at(hi + mm(2)), r.support.name, th, Math.atan2(d.y, d.x), 'left', id),
  ];
}
