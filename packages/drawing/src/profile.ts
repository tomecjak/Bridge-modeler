import { formatStation } from '@bridge/alignment';
import { cross2, type Polygon2D, sub2, type Vec2, vec2 } from '@bridge/geom';
import {
  type AxisCut,
  type AxisLength,
  type AxisLinePoint,
  type BearingLineResult,
  cutAlongAxis,
  type DeckLongitudinal,
  deckCutAlong,
  deckLongitudinal,
  highestCrossing,
  lowestCrossing,
  type ProfileLine,
  supportParts,
} from '@bridge/sections';
import type { DeckDrawingData } from './deck.ts';
import { type Drawing, type Entity, type PolylineEntity, polyline, textHeight } from './model.ts';
import { sampleProfile, stationTicks } from './sampling.ts';

/** Rez podperou v pozdĺžnom profile (x = u čiary profilu, y = lokálne z). */
export interface ProfileSupportCut {
  id: string;
  name: string;
  /** id osi uloženia, na ktorej podpera stojí */
  line: string;
  /** staničenie podpery v km osi cesty */
  station: number;
  cut: AxisCut[];
}

/** Os uloženia v pozdĺžnom profile (ADR 0017): priesečník s čiarou profilu. */
export interface ProfileBearingLine {
  id: string;
  name: string;
  /** staničenie osi uloženia v km osi cesty */
  station: number;
  /** x v profile = u čiary profilu */
  u: number;
}

export interface ProfileInput {
  /** čiara profilu (os cesty, os mosta, okraj NK, iná os, čiara v pôdoryse) */
  line: ProfileLine;
  /** rez NK v čiare profilu (x = u, y = lokálne z) */
  decks: readonly { id: string; cut: DeckLongitudinal }[];
  /** rezy podperami v čiare profilu (lokálne z) */
  supports: readonly ProfileSupportCut[];
  /** osi uloženia (zvislica s číslom a staničením) */
  lines?: readonly ProfileBearingLine[];
  /** terénne čiary (u, výška v m n. m.) */
  terrain: readonly (readonly { u: number; z: number }[])[];
  scale?: number;
}

/** Presah obdĺžnika okolo pôdorysu podpier pri výbere úsekov čiary [m]. */
const SUPPORT_PAD = 1;
/** Najväčšia vzdialenosť priesečníka čiary profilu od osi mosta po osi uloženia [m]. */
const LINE_REACH = 100;

/**
 * u priesečníka osi uloženia (priamka cez bod osi mosta) s čiarou profilu, najbližšieho k osi mosta; bez priesečníka
 * do `LINE_REACH` undefined.
 */
function lineCrossing(l: BearingLineResult, line: ProfileLine): number | undefined {
  if (!l.axis) return undefined;
  const c = vec2(l.axis.point.x, l.axis.point.y);
  const d = l.direction;
  let best: { u: number; along: number } | undefined;
  for (let i = 0; i + 1 < line.points.length; i++) {
    const a = line.points[i] as ProfileLine['points'][number];
    const b = line.points[i + 1] as ProfileLine['points'][number];
    const e = sub2(b.point, a.point);
    const denom = cross2(d, e);
    if (Math.abs(denom) < 1e-12) continue;
    const w = sub2(a.point, c);
    const t = cross2(w, d) / denom;
    if (t < -1e-9 || t > 1 + 1e-9) continue;
    const along = cross2(w, e) / denom;
    if (Math.abs(along) > LINE_REACH || (best && Math.abs(along) >= Math.abs(best.along))) continue;
    best = { u: a.u + t * (b.u - a.u), along };
  }
  return best?.u;
}

/**
 * Rezy NK a jej podperami v čiare profilu (Fáza 10b): v osi mosta presný rez v osi s x = dĺžka po osi mosta,
 * inak rez zvislou plochou cez čiaru (`deckCutAlong`); podpery cez `cutAlongAxis` s x = u. Osi uloženia v priesečníku
 * s čiarou profilu (v osi mosta dĺžka po osi mosta v ich staničení).
 */
export function profileCuts(
  deck: DeckDrawingData,
  line: ProfileLine,
  measure?: AxisLength,
): { deck: DeckLongitudinal; supports: ProfileSupportCut[]; lines: ProfileBearingLine[] } {
  let cut: DeckLongitudinal;
  if (line.kind === 'bridgeAxis' && measure) {
    // úseky NK a priečnikov vedľa seba (ADR 0018)
    const parts = deck.samples.segments.map((g) => deckLongitudinal(g));
    const map = (poly: Polygon2D) => poly.map((p) => vec2(measure.lengthAt(p.x), p.y));
    cut = {
      outer: parts.flatMap((part) => part.outer.map(map)),
      voids: parts.flatMap((part) => part.voids.map(map)),
    };
  } else {
    cut = deckCutAlong(deck.samples, line.points);
  }
  const path = line.points.map((p) => ({ s: p.u, point: p.point }));
  const supports = deck.own.map((r) => {
    const parts = supportParts(r);
    const plan = parts.flatMap((part) => part.plan);
    return {
      id: r.support.id,
      name: r.support.name,
      line: r.support.bearingLine,
      station: r.station,
      cut: runsNear(path, plan, SUPPORT_PAD).flatMap((run) => cutAlongAxis(parts, run)),
    };
  });
  const lines = deck.lines.flatMap((l) => {
    const u = line.kind === 'bridgeAxis' && measure ? measure.lengthAt(l.s) : lineCrossing(l, line);
    return u === undefined ? [] : [{ id: l.line.id, name: l.line.name, station: l.station, u }];
  });
  return { deck: cut, supports, lines };
}

/** Súvislé úseky polyline, ktoré zasahujú do obdĺžnika okolo bodov `around` (zrýchlenie rezov dlhou čiarou). */
function runsNear(
  path: readonly AxisLinePoint[],
  around: readonly Vec2[],
  pad: number,
): AxisLinePoint[][] {
  if (around.length === 0) return [];
  const minX = Math.min(...around.map((p) => p.x)) - pad;
  const maxX = Math.max(...around.map((p) => p.x)) + pad;
  const minY = Math.min(...around.map((p) => p.y)) - pad;
  const maxY = Math.max(...around.map((p) => p.y)) + pad;
  const runs: AxisLinePoint[][] = [];
  let run: AxisLinePoint[] | undefined;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i] as AxisLinePoint;
    const b = path[i + 1] as AxisLinePoint;
    const hit =
      Math.max(a.point.x, b.point.x) >= minX &&
      Math.min(a.point.x, b.point.x) <= maxX &&
      Math.max(a.point.y, b.point.y) >= minY &&
      Math.min(a.point.y, b.point.y) <= maxY;
    if (hit) {
      if (!run) {
        run = [a];
        runs.push(run);
      }
      run.push(b);
    } else {
      run = undefined;
    }
  }
  return runs;
}

/** Predĺženie okrajov NK za jej konce pri teréne na okrajoch [m]. */
export const EDGE_TERRAIN_REACH = 30;

/**
 * Ľavý a pravý okraj NK v pôdoryse na premietnutie terénu do profilu v osi mosta (Fáza 10b): body okraja z obrysu NK
 * (vrátane šikmých koncov), za koncami predĺžené o `reach` rovnobežne s osou mosta v krajnom odsadení. Hodnota `s`
 * bodu je dĺžka po osi mosta v päte kolmice (bod okraja leží v priečnej rovine prierezu), teda x profilu.
 */
export function profileEdgeLines(
  deck: DeckDrawingData,
  measure: AxisLength,
  reach = EDGE_TERRAIN_REACH,
): { left: AxisLinePoint[]; right: AxisLinePoint[] } {
  const road = deck.samples.alignment;
  const at = (s: number, x: number): Vec2 => {
    const r = road.evaluateHorizontal(Math.min(road.length, Math.max(0, s)));
    const h = measure.offsetAt(s) + x;
    return vec2(r.point.x + h * Math.cos(r.azimuth), r.point.y - h * Math.sin(r.azimuth));
  };
  const edge = (points: readonly Vec2[]): AxisLinePoint[] => {
    const feet = points.flatMap((point) => {
      const f = road.project(point);
      return f ? [{ s: f.s, x: f.offset - measure.offsetAt(f.s), point }] : [];
    });
    const first = feet[0];
    const last = feet[feet.length - 1];
    if (!first || !last) return [];
    const extend = (from: number, to: number, x: number) => {
      const n = Math.max(1, Math.ceil(Math.abs(to - from)));
      return Array.from({ length: n }, (_, k) => from + ((to - from) * k) / n)
        .filter((s) => s >= 0 && s <= road.length)
        .map((s) => ({ s, x, point: at(s, x) }));
    };
    const all = [
      ...extend(first.s - reach, first.s, first.x),
      ...feet,
      ...extend(last.s + reach, last.s, last.x).reverse(),
    ];
    return all.map((p) => ({ s: measure.lengthAt(p.s), point: p.point }));
  };
  return { left: edge(deck.outline.left), right: edge(deck.outline.right) };
}

/**
 * Niveleta v čiare profilu (u, výška v m n. m.): pri inej osi z LandXML jej vlastná niveleta, inak niveleta osi cesty
 * v päte kolmice (v osi cesty a osi mosta vrátane PVC/PVT). Prázdne bez nivelety.
 */
export function profileGrade(line: ProfileLine): Vec2[] {
  const own = line.labelAlignment;
  if (line.kind === 'alignment' && own.profile) {
    return sampleProfile(own).map((p) => vec2(p.s, p.z));
  }
  const road = line.road;
  const profile = road.profile;
  if (!profile) return [];
  if (line.kind === 'road' || line.kind === 'bridgeAxis') {
    return sampleProfile(road).flatMap((p) => {
      const u = line.lengthAt(p.s);
      return u === undefined ? [] : [vec2(u, p.z)];
    });
  }
  return line.points.flatMap((p) =>
    p.s !== undefined && p.s >= profile.startS && p.s <= profile.endS
      ? [vec2(p.u, road.elevation(p.s).z + road.origin.z)]
      : [],
  );
}

/** Vrcholy polygónu nivelety (začiatok, PVI, koniec) v osi cesty a osi mosta; inde prázdne. */
export function profilePvis(line: ProfileLine): Vec2[] {
  const profile = line.road.profile;
  if (!profile || (line.kind !== 'road' && line.kind !== 'bridgeAxis')) return [];
  return profile.keyPoints
    .filter((k) => k.kind === 'start' || k.kind === 'pvi' || k.kind === 'end')
    .flatMap((k) => {
      const u = line.lengthAt(k.s);
      return u === undefined ? [] : [vec2(u, k.z + line.road.origin.z)];
    });
}

/** Popis staničenia na osi x profilu: poloha u a zobrazované staničenie. */
export interface ProfileTick {
  u: number;
  station: number;
}

/**
 * Popisy staničenia v čiare profilu so zobrazovaným staničením deliteľným `step`: v osi cesty a osi mosta km osi
 * cesty, pri inej osi jej km, pri okraji NK a čiare km osi cesty v päte kolmice (priesečníky s násobkami kroku).
 */
export function profileTicks(
  line: ProfileLine,
  step: number,
  uMin: number,
  uMax: number,
): ProfileTick[] {
  if (!(step > 0) || !(uMax > uMin)) return [];
  if (line.kind === 'road' || line.kind === 'alignment') {
    return stationTicks(line.labelAlignment.stationing, step, uMin, uMax).map((t) => ({
      u: t.s,
      station: t.station,
    }));
  }
  const stationing = line.road.stationing;
  if (line.kind === 'bridgeAxis') {
    const sMin = line.stationAt(uMin);
    const sMax = line.stationAt(uMax);
    if (sMin === undefined || sMax === undefined) return [];
    return stationTicks(stationing, step, sMin, sMax).flatMap((t) => {
      const u = line.lengthAt(t.s);
      return u === undefined ? [] : [{ u, station: t.station }];
    });
  }
  const ticks: ProfileTick[] = [];
  const pts = line.points;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i] as (typeof pts)[number];
    const b = pts[i + 1] as (typeof pts)[number];
    if (a.s === undefined || b.s === undefined || b.u < uMin || a.u > uMax) continue;
    const da = stationing.toDisplay(a.s);
    const db = stationing.toDisplay(b.s);
    // úsek cez skok v staničení sa nepopisuje
    if (da.region !== db.region || da.station === db.station) continue;
    const lo = Math.min(da.station, db.station);
    const hi = Math.max(da.station, db.station);
    for (let k = Math.ceil(lo / step - 1e-9); k * step <= hi + 1e-9; k++) {
      const station = k * step + 0;
      const u = a.u + ((station - da.station) / (db.station - da.station)) * (b.u - a.u);
      if (u < uMin || u > uMax) continue;
      if (ticks.some((t) => Math.abs(t.u - u) < 1e-9)) continue;
      ticks.push({ u, station });
    }
  }
  return ticks.sort((p, q) => p.u - q.u);
}

/**
 * Rozvinutý pozdĺžny rez v čiare profilu (Fáza 6, 10b), 1 : 1 bez prevýšenia: x = u čiary [m], y = výška [m n. m.].
 * Niveleta, terén, NK a dutiny, rezy podpier (základ zvlášť) a osi uloženia (zvislica cez NK a podperu, nad ňou zvislý
 * text s číslom osi a staničením v km osi cesty; ADR 0017). Bez kót (ADR 0012).
 */
export function profileDrawing(input: ProfileInput): Drawing {
  const scale = input.scale ?? 200;
  const th = textHeight(scale);
  const z0 = input.line.road.origin.z;
  const lift = (poly: Polygon2D) => poly.map((p) => vec2(p.x, p.y + z0));
  const entities: Entity[] = [];

  const grade = profileGrade(input.line);
  if (grade.length >= 2) entities.push(polyline('grade', grade));
  for (const run of input.terrain) {
    if (run.length >= 2)
      entities.push(
        polyline(
          'terrain',
          run.map((p) => vec2(p.u, p.z)),
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
  }
  const mm = (v: number) => (v * scale) / 1000;
  const deckOuter = input.decks.flatMap((d) => d.cut.outer);
  for (const l of input.lines ?? []) {
    const x = l.u;
    // výšky v m n. m.: NK a podpery na osi, bez nich niveleta
    const local = [
      highestCrossing(deckOuter, x),
      lowestCrossing(deckOuter, x),
      ...input.supports
        .filter((s) => s.line === l.id)
        .flatMap((s) => s.cut.flatMap((c) => c.outline.map((p) => p.y))),
    ].filter((y): y is number => y !== undefined);
    const ys = local.length > 0 ? local.map((y) => y + z0) : [yOn(grade, x)];
    const valid = ys.filter((y): y is number => y !== undefined);
    if (valid.length === 0) continue;
    const yTop = Math.max(...valid) + mm(3);
    const yBottom = Math.min(...valid) - mm(3);
    entities.push(polyline('supportAxis', [vec2(x, yBottom), vec2(x, yTop)], false, l.id));
    entities.push({
      kind: 'text',
      layer: 'label',
      at: vec2(x + th / 2, yTop + mm(1)),
      text: `${l.name}  ${formatStation(l.station, 3)}`,
      height: th,
      rotation: Math.PI / 2,
      align: 'left',
      owner: l.id,
    });
  }
  return { entities, scale };
}

/** Hodnoty pozdĺžneho profilu pod kurzorom (výšky v m n. m.; Fáza 10b). */
export interface ProfileReadout {
  u: number;
  /** niveleta */
  grade: number | undefined;
  /** horný povrch a spodok NK (zvislica cez obrysy rezu NK) */
  deckTop: number | undefined;
  deckBottom: number | undefined;
  /** terén v čiare profilu a na okrajoch NK (pri viacerých povrchoch najvyšší) */
  terrain: number | undefined;
  terrainLeft: number | undefined;
  terrainRight: number | undefined;
  /** výška spodku NK nad terénom v čiare profilu */
  clearance: number | undefined;
}

/** y lomenej čiary v bode x (body vzostupne podľa x); mimo rozsahu undefined. */
function yOn(points: readonly Vec2[], x: number): number | undefined {
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i] as Vec2;
    const b = points[i + 1] as Vec2;
    if ((a.x - x) * (b.x - x) > 0) continue;
    return b.x !== a.x ? a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x) : Math.max(a.y, b.y);
  }
  return undefined;
}

const highest = (values: readonly (number | undefined)[]) => {
  const defined = values.filter((v): v is number => v !== undefined);
  return defined.length > 0 ? Math.max(...defined) : undefined;
};

/**
 * Odčítanie pod kurzorom v pozdĺžnom profile (Fáza 10b): niveleta, horný povrch a spodok NK, terén v čiare
 * a na okrajoch NK a výška spodku NK nad terénom v x = `u`.
 */
export function profileReadout(
  drawing: Drawing | undefined,
  grade: readonly Vec2[],
  edges: { left: readonly (readonly Vec2[])[]; right: readonly (readonly Vec2[])[] } | undefined,
  u: number,
): ProfileReadout {
  const lines = (layer: PolylineEntity['layer']) =>
    (drawing?.entities ?? []).filter(
      (e): e is PolylineEntity => e.kind === 'polyline' && e.layer === layer,
    );
  const deck = lines('deck').map((e) => e.points);
  const deckTop = highestCrossing(deck, u);
  const deckBottom = lowestCrossing(deck, u);
  const terrain = highest(lines('terrain').map((e) => yOn(e.points, u)));
  return {
    u,
    grade: yOn(grade, u),
    deckTop,
    deckBottom,
    terrain,
    terrainLeft: highest((edges?.left ?? []).map((r) => yOn(r, u))),
    terrainRight: highest((edges?.right ?? []).map((r) => yOn(r, u))),
    clearance: deckBottom !== undefined && terrain !== undefined ? deckBottom - terrain : undefined,
  };
}
