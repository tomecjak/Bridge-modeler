import { formatStation } from '@bridge/alignment';
import { type Polygon2D, type Vec2, vec2 } from '@bridge/geom';
import {
  type AxisCut,
  type AxisLength,
  type AxisLinePoint,
  cutAlongAxis,
  type DeckLongitudinal,
  deckCutAlong,
  deckLongitudinal,
  type ProfileLine,
  supportParts,
} from '@bridge/sections';
import type { DeckDrawingData } from './deck.ts';
import { type Drawing, type Entity, polyline, textHeight } from './model.ts';
import { sampleProfile, stationTicks } from './sampling.ts';

/** Rez podperou v pozdĺžnom profile (x = u čiary profilu, y = lokálne z). */
export interface ProfileSupportCut {
  id: string;
  name: string;
  /** staničenie podpery v km osi cesty */
  station: number;
  cut: AxisCut[];
}

export interface ProfileInput {
  /** čiara profilu (os cesty, os mosta, okraj NK, iná os, čiara v pôdoryse) */
  line: ProfileLine;
  /** rez NK v čiare profilu (x = u, y = lokálne z) */
  decks: readonly { id: string; cut: DeckLongitudinal }[];
  /** rezy podperami v čiare profilu (lokálne z) */
  supports: readonly ProfileSupportCut[];
  /** terénne čiary (u, výška v m n. m.) */
  terrain: readonly (readonly { u: number; z: number }[])[];
  scale?: number;
}

/** Presah obdĺžnika okolo pôdorysu podpier pri výbere úsekov čiary [m]. */
const SUPPORT_PAD = 1;

/**
 * Rezy NK a jej podperami v čiare profilu (Fáza 10b): v osi mosta presný rez v osi s x = dĺžka po osi mosta,
 * inak rez zvislou plochou cez čiaru (`deckCutAlong`); podpery cez `cutAlongAxis` s x = u.
 */
export function profileCuts(
  deck: DeckDrawingData,
  line: ProfileLine,
  measure?: AxisLength,
): { deck: DeckLongitudinal; supports: ProfileSupportCut[] } {
  let cut: DeckLongitudinal;
  if (line.kind === 'bridgeAxis' && measure) {
    const exact = deckLongitudinal(deck.samples);
    const map = (poly: Polygon2D) => poly.map((p) => vec2(measure.lengthAt(p.x), p.y));
    cut = { outer: exact.outer.map(map), voids: exact.voids.map(map) };
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
      station: r.station,
      cut: runsNear(path, plan, SUPPORT_PAD).flatMap((run) => cutAlongAxis(parts, run)),
    };
  });
  return { deck: cut, supports };
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
 * Niveleta, terén, NK a dutiny, rezy podpier (základ zvlášť) a nad každou podperou zvislý text s názvom a staničením
 * v km osi cesty. Bez kót (ADR 0012).
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
