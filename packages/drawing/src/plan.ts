import { type Alignment, formatStation } from '@bridge/alignment';
import { cross2, type Polygon2D, sub2, type Vec2, vec2 } from '@bridge/geom';
import type { PlanLine } from '@bridge/model';
import {
  type AxisLinePoint,
  BEARING_PLAN_SIZE,
  type BearingLineResult,
  type DeckOutline,
  type SupportResult,
  supportPlan,
} from '@bridge/sections';
import { type Drawing, type Entity, polyline, textHeight } from './model.ts';
import { sampleHorizontal, stationTicks } from './sampling.ts';
import { readableText } from './text.ts';

export interface PlanInput {
  alignment: Alignment;
  decks: readonly {
    id: string;
    outline: DeckOutline;
    axis: readonly AxisLinePoint[];
    /** osi uloženia NK (ADR 0017) */
    lines?: readonly BearingLineResult[];
  }[];
  supports: readonly SupportResult[];
  /** ďalšie osi z LandXML (napr. okraje vozovky) */
  otherAlignments?: readonly Alignment[];
  /** čiary v pôdoryse (okraje NK podľa krivky) */
  planLines?: readonly PlanLine[];
  /** značky staničenia osi cesty [m]; bez nich sa staničenie nekreslí (pohľad má vlastné podľa priblíženia) */
  stationing?: { step: number; labelStep: number };
  scale?: number;
}

/**
 * Pôdorys (Fáza 6) v lokálnych súradniciach: os cesty so staničením, ďalšie osi a čiary v pôdoryse, os mosta, obrys NK,
 * podpery (driek / časti opory, základ, ložiská) a osi uloženia s číslom (aj bez podpery, ADR 0017). Bez kót.
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
  for (const other of input.otherAlignments ?? []) {
    entities.push(
      polyline(
        'roadAxis',
        sampleHorizontal(other).map((p) => vec2(p.x, p.y)),
      ),
    );
  }
  for (const line of input.planLines ?? []) {
    if (line.points.length >= 2) entities.push(polyline('planLine', line.points, false, line.id));
  }
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
      // votknutie (monolitická opora) nemá ložiská, body uloženia slúžia len na výšku spodku NK
      if (!(b.soffit - b.seat > 0)) continue;
      const c = b.plan;
      const corner = (su: number, sv: number) =>
        vec2(c.x + su * h * d.x + sv * h * across.x, c.y + su * h * d.y + sv * h * across.y);
      entities.push(
        polyline('bearing', [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)], true, id),
      );
    }
  }

  for (const deck of input.decks) {
    for (const l of deck.lines ?? []) {
      const parts = input.supports
        .filter((r) => r.support.bearingLine === l.line.id)
        .flatMap((r) => {
          const plan = supportPlan(r);
          return plan ? [...plan.body, ...(plan.footing ? [plan.footing] : [])] : [];
        });
      entities.push(...bearingLineAxis(l, deck.outline.polygon, parts, mm, th));
    }
  }
  return { entities, scale };
}

/** Parametre u priesečníkov priamky c + u·d s hranami polygónu. */
function lineHits(c: Vec2, d: Vec2, polygon: Polygon2D): number[] {
  const hits: number[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i] as Vec2;
    const e = sub2(polygon[(i + 1) % polygon.length] as Vec2, p);
    const denom = cross2(d, e);
    if (Math.abs(denom) < 1e-12) continue;
    const w = sub2(p, c);
    const t = cross2(w, d) / denom;
    if (t >= -1e-9 && t <= 1 + 1e-9) hits.push(cross2(w, e) / denom);
  }
  return hits;
}

/**
 * Os uloženia cez obrys NK (priesečníky priamky s obrysom) a pôdorys podpier na nej, s presahom 5 mm na papieri,
 * a číslo osi za jej koncom (ADR 0017).
 */
function bearingLineAxis(
  l: BearingLineResult,
  outline: Polygon2D,
  parts: readonly Polygon2D[],
  mm: (v: number) => number,
  th: number,
): Entity[] {
  if (!l.axis) return [];
  const d = l.direction;
  const c = vec2(l.axis.point.x, l.axis.point.y);
  const along = [
    ...lineHits(c, d, outline),
    ...parts.flat().map((p: Vec2) => (p.x - c.x) * d.x + (p.y - c.y) * d.y),
  ];
  if (along.length === 0) along.push(-mm(5), mm(5));
  const lo = Math.min(...along) - mm(5);
  const hi = Math.max(...along) + mm(5);
  const at = (u: number) => vec2(c.x + u * d.x, c.y + u * d.y);
  const id = l.line.id;
  return [
    polyline('supportAxis', [at(lo), at(hi)], false, id),
    readableText('label', at(hi + mm(2)), l.line.name, th, Math.atan2(d.y, d.x), 'left', id),
  ];
}
