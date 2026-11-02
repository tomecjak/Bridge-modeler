import type { Scope } from '@bridge/expr';
import { type Vec2, vec2 } from '@bridge/geom';
import {
  type EdgeBeam,
  type IssueOwner,
  type ModelIssue,
  requiredFreeWidth,
  type Superstructure,
} from '@bridge/model';
import { extremePoint } from './deckOutline.ts';
import type { DeckSamples, DeckSegment } from './deckSampling.ts';
import {
  type EvaluatedLoop,
  evaluateProfileDefinition,
  profileParameterValues,
} from './profile.ts';
import type { LawRef } from './sampling.ts';
import {
  evaluateSuperstructure,
  globalScope,
  type SectionContext,
  type SuperstructureSection,
} from './superstructure.ts';
import { DECK_SLOPE_VARIABLE } from './templates/edgeBeam.ts';

/** Najkratší vodorovný priemet hornej hrany NK, z ktorej sa ešte meria sklon pri okraji [m]. */
const MIN_EDGE_RUN = 1e-9;

/** Smer von od NK v osi x prierezu. */
const outward = (side: EdgeBeam['side']): -1 | 1 => (side === 'left' ? -1 : 1);

/**
 * Okraj NK (ADR 0023): krajný bod vonkajších obrysov na strane `side` (pri zhode x vyšší) a sklon hornej hrany
 * obrysu pri ňom, kladný = klesá von od NK. Horná hrana CCW obrysu ide v −x: na ľavom okraji do bodu, na pravom
 * z bodu. Bez hornej hrany je sklon 0; bez obrysov undefined.
 */
export function deckEdge(
  loops: readonly EvaluatedLoop[],
  side: EdgeBeam['side'],
): { point: Vec2; slope: number } | undefined {
  const dir = outward(side);
  const point = extremePoint(loops, dir);
  if (!point) return undefined;
  for (const l of loops) {
    const i = l.role === 'outer' ? l.polygon.indexOf(point) : -1;
    if (i < 0) continue;
    const n = l.polygon.length;
    const [a, b] =
      dir < 0
        ? [l.polygon[(i + n - 1) % n] as Vec2, point]
        : [point, l.polygon[(i + 1) % n] as Vec2];
    const run = b.x - a.x;
    if (run < -MIN_EDGE_RUN) return { point, slope: (-dir * (b.y - a.y)) / run };
    break;
  }
  return { point, slope: 0 };
}

/**
 * Prierez rímsy na staničení prierezu NK `deck` (ADR 0023): parametre z priebehov rímsy, `qNK` z okraja NK, body
 * a obrysy v rámci prierezu NK (ľavá rímsa zrkadlená, obrysy ostávajú CCW / CW). Staničenie, os a `toWorld`
 * preberá z NK. Problémy prierezu NK hlási NK, nie rímsa.
 */
export function evaluateEdgeBeam(
  ctx: SectionContext,
  beam: EdgeBeam,
  deck: SuperstructureSection,
): SuperstructureSection {
  const owner: IssueOwner = { kind: 'edgeBeam', name: beam.name };
  const empty = (issues: ModelIssue[]): SuperstructureSection => ({
    ...deck,
    loops: [],
    points: new Map(),
    parameters: new Map(),
    area: 0,
    centroid: vec2(0, 0),
    issues,
  });
  const profile = ctx.profiles.find((p) => p.id === beam.profile);
  if (!profile) return empty([{ code: 'UnknownProfile', id: beam.profile, owner }]);
  const edge = deckEdge(deck.loops, beam.side);
  if (!edge) return empty([]);

  const globals = globalScope(ctx.parameters, deck.station);
  const scope: Scope = (n) => (n === DECK_SLOPE_VARIABLE ? edge.slope : globals(n));
  const params = profileParameterValues(profile, beam.parameterLaws, scope, deck.station);
  const evaluated = evaluateProfileDefinition(profile, params.values, scope, deck.station);
  const dir = outward(beam.side);
  const place = (p: Vec2) => vec2(edge.point.x + dir * p.x, edge.point.y + p.y);
  // zrkadlenie obráti orientáciu obrysu → poradie bodov sa obráti
  const loops = evaluated.loops.map((l): EvaluatedLoop => {
    const polygon = l.polygon.map(place);
    return dir > 0
      ? { ...l, polygon }
      : { ...l, polygon: polygon.reverse(), pointNames: [...l.pointNames].reverse() };
  });
  return {
    ...deck,
    loops,
    points: new Map([...evaluated.points].map(([k, v]) => [k, place(v)])),
    parameters: params.values,
    area: evaluated.area,
    centroid: place(evaluated.centroid),
    issues: [
      ...params.issues.map((i) => ({ owner, ...i })),
      ...evaluated.issues.map((i) => ({
        owner: { kind: 'profile' as const, name: profile.name },
        ...i,
      })),
    ],
  };
}

/**
 * Vnútorná (k NK) a vonkajšia hrana prierezu rímsy v rámci prierezu NK: krajné body jej obrysov, pri zhode x vyšší
 * (vnútorná horná hrana pri zvislej vnútornej líci).
 */
export function edgeBeamEdges(
  section: Pick<SuperstructureSection, 'loops'>,
  side: EdgeBeam['side'],
): { inner: Vec2 | undefined; outer: Vec2 | undefined } {
  const dir = outward(side);
  return {
    inner: extremePoint(section.loops, dir > 0 ? -1 : 1),
    outer: extremePoint(section.loops, dir),
  };
}

/** Rímsy NK v poradí modelu. */
export const deckEdgeBeams = (ctx: Pick<SectionContext, 'edgeBeams'>, sup: Superstructure) =>
  (ctx.edgeBeams ?? []).filter((b) => b.superstructure === sup.id);

/** Priebehy parametrov ríms NK s jednotkami ich prierezov (zlomy vo vzorkovaní NK). */
export function edgeBeamLaws(ctx: SectionContext, sup: Superstructure): LawRef[] {
  return deckEdgeBeams(ctx, sup).flatMap((b) => {
    const units = new Map(
      ctx.profiles.find((p) => p.id === b.profile)?.parameters.map((p) => [p.name, p.unit]),
    );
    return Object.entries(b.parameterLaws).map(([name, law]) => ({
      law,
      unit: units.get(name) ?? 'none',
    }));
  });
}

/**
 * Rímsa vo vzorkách NK (ADR 0023): jeden úsek na staničeniach hlavných vzoriek NK (vždy hlavný prierez NK, aj v páse
 * priečnika) s uhlami koncov NK; rímsa končí v rovine konca NK.
 */
export function sampleEdgeBeam(
  ctx: SectionContext,
  beam: EdgeBeam,
  samples: Pick<DeckSamples, 'stations' | 'sections' | 'sFrom' | 'sTo' | 'endAngles'>,
): DeckSegment {
  return {
    sFrom: samples.sFrom,
    sTo: samples.sTo,
    startAngle: samples.endAngles.start,
    endAngle: samples.endAngles.end,
    stations: [...samples.stations],
    sections: samples.sections.map((sec) => evaluateEdgeBeam(ctx, beam, sec)),
  };
}

/** Šírky NK na staničení [m], vodorovne v rovine prierezu. */
export interface DeckWidths {
  /** šírka NK po okraje prierezu NK */
  deck: number;
  /** šírka mosta po vonkajšie hrany ríms (bez rímsy po okraj NK) */
  bridge: number;
  /** voľná šírka medzi vnútornými hranami ríms; len ak má NK rímsu na oboch stranách */
  free?: number;
}

/**
 * Šírky NK na spojitom staničení `s` (ADR 0023) z hlavného prierezu NK a jej ríms; pri viacerých rímsach na jednej
 * strane rozhoduje najvnútornejšia (voľná šírka) a najvonkajšia (šírka mosta). NK bez obrysu → undefined.
 */
export function deckWidths(
  ctx: SectionContext,
  sup: Superstructure,
  s: number,
): DeckWidths | undefined {
  const profile = ctx.profiles.find((p) => p.id === sup.profile);
  const section = evaluateSuperstructure(ctx, sup, s, profile);
  const left = extremePoint(section.loops, -1);
  const right = extremePoint(section.loops, 1);
  if (!left || !right) return undefined;
  const beams = deckEdgeBeams(ctx, sup);
  const edges = (side: EdgeBeam['side']) =>
    beams
      .filter((b) => b.side === side)
      .map((b) => edgeBeamEdges(evaluateEdgeBeam(ctx, b, section), side))
      .flatMap((e) => (e.inner && e.outer ? [{ inner: e.inner.x, outer: e.outer.x }] : []));
  const l = edges('left');
  const r = edges('right');
  const bridge =
    Math.max(right.x, ...r.map((e) => e.outer)) - Math.min(left.x, ...l.map((e) => e.outer));
  const widths: DeckWidths = { deck: right.x - left.x, bridge };
  if (l.length > 0 && r.length > 0)
    widths.free = Math.min(...r.map((e) => e.inner)) - Math.max(...l.map((e) => e.inner));
  return widths;
}

/** Tolerancia kontroly voľnej šírky [m] (ADR 0023): upozorní sa, ak je menšia o viac ako 1 mm. */
export const FREE_WIDTH_TOLERANCE = 0.001;

/** Rozsah šírky po dĺžke NK [m]; `at` = spojité staničenie prvej najmenšej hodnoty. */
export interface WidthRange {
  min: number;
  max: number;
  at: number;
}

export interface DeckWidthRange {
  deck: WidthRange;
  bridge: WidthRange;
  /** voľná šírka; len ak má NK rímsy na oboch stranách */
  free?: WidthRange;
}

/** Šírky NK (`deckWidths`) na spojitých staničeniach `stations` ako rozsahy; bez vyhodnotiteľného prierezu undefined. */
export function deckWidthRange(
  ctx: SectionContext,
  sup: Superstructure,
  stations: readonly number[],
): DeckWidthRange | undefined {
  const all = stations.flatMap((s) => {
    const w = deckWidths(ctx, sup, s);
    return w ? [{ s, w }] : [];
  });
  const range = (pick: (w: DeckWidths) => number | undefined): WidthRange | undefined => {
    let r: WidthRange | undefined;
    for (const { s, w } of all) {
      const v = pick(w);
      if (v === undefined) continue;
      if (!r) r = { min: v, max: v, at: s };
      else {
        // pri zhode (zaokrúhlenie) ostane prvé staničenie
        if (v < r.min - 1e-9) r = { ...r, min: v, at: s };
        r.max = Math.max(r.max, v);
      }
    }
    return r;
  };
  const deck = range((w) => w.deck);
  const bridge = range((w) => w.bridge);
  if (!deck || !bridge) return undefined;
  const free = range((w) => w.free);
  return free ? { deck, bridge, free } : { deck, bridge };
}

/**
 * Voľná šírka voči požadovanej (ADR 0023): požadovaná = hodnota pri NK, inak zo zadania. Ak je najmenšia voľná šírka
 * na staničeniach `stations` menšia o viac ako `tolerance`, vráti jedno upozornenie `FreeWidthBelowRequired`
 * (zobrazované staničenie najmenšej hodnoty). Bez požadovanej hodnoty alebo bez oboch ríms sa nekontroluje.
 */
export function freeWidthIssues(
  ctx: SectionContext,
  sup: Superstructure,
  stations: readonly number[],
  tolerance: number,
): ModelIssue[] {
  const required = requiredFreeWidth(sup, ctx.brief);
  if (!required) return [];
  const free = deckWidthRange(ctx, sup, stations)?.free;
  if (!free || free.min >= required.value - tolerance) return [];
  const axis = ctx.bridgeAxes.find((a) => a.id === sup.bridgeAxis);
  const road = axis && ctx.alignments.get(axis.alignment);
  return [
    {
      code: 'FreeWidthBelowRequired',
      station: road ? road.stationing.toDisplay(free.at).station : Number.NaN,
      width: free.min,
      required: required.value,
      source: required.source,
      severity: 'warning',
    },
  ];
}
