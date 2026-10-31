import { azimuthToVector, type Vec2, vec2 } from '@bridge/geom';
import type { IssueOwner, ModelIssue, Superstructure, Support } from '@bridge/model';
import { highestCrossing, lowestCrossing } from './crossing.ts';
import { evaluateNumber } from './expressions.ts';
import {
  type BridgeAxisPoint,
  evaluateBridgeAxis,
  evaluateSuperstructure,
  globalScope,
  type SectionContext,
} from './superstructure.ts';

export interface SupportContext extends SectionContext {
  superstructures: readonly Superstructure[];
}

export interface BearingResult {
  index: number;
  /** priečna vzdialenosť od osi NK [m], + vpravo */
  x: number;
  /** spojité a zobrazované staničenie ložiska (na osi podpery) */
  s: number;
  station: number;
  /** poloha v pôdoryse (lokálne súradnice) */
  plan: Vec2;
  /** výška spodku NK nad ložiskom, horná hrana podpery a výška podpery (lokálne z, resp. m) */
  soffit: number;
  seat: number;
  height: number;
}

/** Koniec NK pri opore (ADR 0010): horný povrch pre záverný múrik a krídla. */
export interface DeckEnd {
  side: 'start' | 'end';
  /** spojité staničenie konca NK */
  s: number;
  /** bod osi mosta na konci (pôdorys), vodorovný jednotkový smer staničenia a sklon nivelety */
  point: Vec2;
  tangent: Vec2;
  grade: number;
  /** horný povrch NK na konci: priečna poloha x [m] → lokálne z, zoradené podľa x */
  top: { x: number; z: number }[];
}

export interface SupportResult {
  support: Support;
  s: number;
  station: number;
  axis: BridgeAxisPoint | undefined;
  /** jednotkový smer osi podpery v pôdoryse */
  direction: Vec2;
  /** stred podpery v pôdoryse (na osi podpery, posunutý o `offset`) */
  center: Vec2;
  /** uhol kríženia [rad] */
  crossingAngle: number;
  bearings: BearingResult[];
  /** horná hrana základu (lokálne z) */
  foundationTop: number;
  height: { min: number; max: number };
  /** vyhodnotené rozmery geometrie a základu [m] (počet stĺpov ako číslo) */
  dimensions: Record<string, number>;
  footing: { length: number; width: number; thickness: number };
  /** len opora s geometriou `abutment` */
  deckEnd?: DeckEnd;
  issues: ModelIssue[];
}

/**
 * Vyhodnotí podperu (ADR 0008): os podpery otočená o uhol kríženia proti smeru hodín od osi mosta, ložiská na nej,
 * spodok NK nad každým ložiskom z rezu prierezu, horná hrana = spodok − výška uloženia, výška = horná hrana − základ.
 */
export function evaluateSupport(ctx: SupportContext, support: Support): SupportResult {
  const owner: IssueOwner = { kind: 'support', name: support.name };
  const issues: ModelIssue[] = [];
  const result: SupportResult = {
    support,
    s: Number.NaN,
    station: support.station,
    axis: undefined,
    direction: vec2(1, 0),
    center: vec2(0, 0),
    crossingAngle: Math.PI / 2,
    bearings: [],
    foundationTop: Number.NaN,
    height: { min: Number.NaN, max: Number.NaN },
    dimensions: {},
    footing: { length: Number.NaN, width: Number.NaN, thickness: Number.NaN },
    issues,
  };
  const done = () => {
    result.issues = issues.map((i) => ({ owner, ...i }));
    return result;
  };

  const sup = ctx.superstructures.find((x) => x.id === support.superstructure);
  if (!sup) {
    issues.push({ code: 'UnknownSuperstructure', id: support.superstructure });
    return done();
  }
  const axisDef = ctx.bridgeAxes.find((a) => a.id === sup.bridgeAxis);
  const alignment = axisDef ? ctx.alignments.get(axisDef.alignment) : undefined;
  if (!axisDef || !alignment) {
    issues.push(
      axisDef
        ? { code: 'UnknownAlignment', name: axisDef.alignment }
        : { code: 'UnknownBridgeAxis', id: sup.bridgeAxis },
    );
    return done();
  }
  if (support.station < sup.from - 1e-9 || support.station > sup.to + 1e-9) {
    issues.push({
      code: 'StationOutsideSuperstructure',
      station: support.station,
      from: sup.from,
      to: sup.to,
    });
    return done();
  }
  const s0 = alignment.stationing.fromDisplay(support.station);
  if (s0 === undefined) {
    issues.push({ code: 'StationNotOnAlignment', station: support.station });
    return done();
  }
  result.s = s0;

  const scope = globalScope(ctx.parameters, support.station);
  const num = (text: string, field: Parameters<typeof evaluateNumber>[2]) => {
    const r = evaluateNumber(text, scope, field);
    if (!r.ok) issues.push(r.issue);
    return r.ok ? r.value : undefined;
  };
  const angleDeg = num(support.crossingAngle, 'crossingAngle');
  const offset = num(support.offset, 'offset');
  const bearingHeight = num(support.bearingHeight, 'bearingHeight');
  const foundationTop = num(support.foundationTop, 'foundationTop');
  const xs = support.bearings.map((b) => num(b, 'bearing'));
  result.dimensions = evaluateDimensions(support, num, issues);
  const footing = {
    length: num(support.footing.length, 'dimension'),
    width: num(support.footing.width, 'dimension'),
    thickness: num(support.footing.thickness, 'dimension'),
  };
  // hrúbka 0 = bez základu; dĺžka a šírka sa potom nekontrolujú
  const noFooting = footing.thickness === 0;
  for (const [name, value] of Object.entries(footing)) {
    if (value === undefined || noFooting) continue;
    if (!(value > 0)) issues.push({ code: 'InvalidDimension', name: `footing.${name}`, value });
  }
  if (footing.thickness !== undefined && footing.thickness < 0)
    issues.push({ code: 'InvalidDimension', name: 'footing.thickness', value: footing.thickness });
  if (
    angleDeg === undefined ||
    offset === undefined ||
    bearingHeight === undefined ||
    foundationTop === undefined ||
    xs.some((x) => x === undefined)
  ) {
    return done();
  }
  result.footing = footing as SupportResult['footing'];
  if (!(angleDeg > 0 && angleDeg < 180)) {
    issues.push({ code: 'InvalidCrossingAngle', angle: angleDeg });
    return done();
  }
  const alpha = (angleDeg * Math.PI) / 180;
  result.crossingAngle = alpha;
  result.foundationTop = foundationTop - alignment.origin.z;

  const axisPoint = evaluateBridgeAxis(axisDef, alignment, scope, s0);
  if (!axisPoint.ok) {
    issues.push(axisPoint.issue);
    return done();
  }
  const axis = axisPoint.value;
  result.axis = axis;
  const azimuth = Math.atan2(axis.frame.tangent.x, axis.frame.tangent.y);
  // smerník rastie v smere hodín → otočenie proti smeru hodín o α znamená azimut − α
  const d = azimuthToVector(azimuth - alpha);
  result.direction = d;
  const sin = Math.sin(alpha);
  const cot = Math.cos(alpha) / sin;
  const along = (perpendicular: number) =>
    vec2(axis.point.x - (perpendicular / sin) * d.x, axis.point.y - (perpendicular / sin) * d.y);
  result.center = along(offset);

  // koniec NK je rovnobežný s krajnou oporou (ADR 0009) → ložisko opory môže ležať za staničením „od/do“
  // v osi NK; prierez sa vtedy vezme na konci NK a posunie pozdĺž dotyčnice (ako sieť NK)
  const sFrom = alignment.stationing.fromDisplay(sup.from);
  const sTo = alignment.stationing.fromDisplay(sup.to);
  const deckStation = (s: number, x: number): number => {
    if (support.kind !== 'abutment' || sFrom === undefined || sTo === undefined) return s;
    if (s < sFrom && s >= sFrom - x * cot - 1e-9) return sFrom;
    if (s > sTo && s <= sTo - x * cot + 1e-9) return sTo;
    return s;
  };

  (xs as number[]).forEach((x, index) => {
    const s = s0 - x * cot;
    const sDeck = deckStation(s, x);
    const section = evaluateSuperstructure(ctx, sup, sDeck);
    const blocking = section.issues.filter((i) => i.severity !== 'warning');
    if (blocking.length > 0) {
      issues.push(...blocking);
      return;
    }
    const outer = section.loops.filter((l) => l.role === 'outer').map((l) => l.polygon);
    const bottom = lowestCrossing(outer, x);
    if (bottom === undefined) {
      issues.push({ code: 'BearingOutsideDeck', index, x });
      return;
    }
    const t = section.axis?.frame.tangent;
    const rise = t ? ((s - sDeck) * t.z) / Math.hypot(t.x, t.y) : 0;
    const soffit = section.toWorld({ x, y: bottom }).z + rise;
    const seat = soffit - bearingHeight;
    result.bearings.push({
      index,
      x,
      s,
      station: alignment.stationing.toDisplay(s).station,
      plan: along(x),
      soffit,
      seat,
      height: seat - result.foundationTop,
    });
  });

  if (support.geometry.type === 'abutment' && sFrom !== undefined && sTo !== undefined) {
    const deckEnd = evaluateDeckEnd(ctx, sup, s0 - sFrom < sTo - s0 ? 'start' : 'end', sFrom, sTo);
    if (deckEnd) result.deckEnd = deckEnd;
  }

  if (result.bearings.length > 0) {
    const heights = result.bearings.map((b) => b.height);
    result.height = { min: Math.min(...heights), max: Math.max(...heights) };
    if (result.height.min <= 0)
      issues.push({ code: 'NonPositiveSupportHeight', height: result.height.min });
  }
  return done();
}

/** Horný povrch NK na konci v priečnej polohe x (lineárne medzi bodmi, mimo šírky NK výška okraja). */
export function deckTopAt(end: DeckEnd, x: number): number {
  const top = end.top;
  const first = top[0] as DeckEnd['top'][number];
  const last = top[top.length - 1] as DeckEnd['top'][number];
  if (x <= first.x) return first.z;
  if (x >= last.x) return last.z;
  for (let i = 1; i < top.length; i++) {
    const a = top[i - 1] as DeckEnd['top'][number];
    const b = top[i] as DeckEnd['top'][number];
    if (x <= b.x) return a.z + ((b.z - a.z) * (x - a.x)) / (b.x - a.x);
  }
  return last.z;
}

/** Horný povrch NK na bližšom konci k opore (z prierezu na staničení konca). */
function evaluateDeckEnd(
  ctx: SupportContext,
  sup: Superstructure,
  side: DeckEnd['side'],
  sFrom: number,
  sTo: number,
): DeckEnd | undefined {
  const s = side === 'start' ? sFrom : sTo;
  const section = evaluateSuperstructure(ctx, sup, s);
  const axis = section.axis;
  if (!axis) return undefined;
  const outer = section.loops.filter((l) => l.role === 'outer').map((l) => l.polygon);
  const xs = [...new Set(outer.flat().map((p) => p.x))].sort((a, b) => a - b);
  const top = xs.flatMap((x) => {
    const y = highestCrossing(outer, x);
    return y === undefined ? [] : [{ x, z: section.toWorld({ x, y }).z }];
  });
  if (top.length === 0) return undefined;
  const t = axis.frame.tangent;
  const th = Math.hypot(t.x, t.y);
  return {
    side,
    s,
    point: vec2(axis.point.x, axis.point.y),
    tangent: vec2(t.x / th, t.y / th),
    grade: t.z / th,
    top,
  };
}

function evaluateDimensions(
  support: Support,
  num: (text: string, field: 'dimension') => number | undefined,
  issues: ModelIssue[],
): Record<string, number> {
  const out: Record<string, number> = {};
  const g = support.geometry;
  const fields: Record<string, string> =
    g.type === 'wall'
      ? { thickness: g.thickness, length: g.length }
      : g.type === 'abutment'
        ? {
            length: g.length,
            seatLength: g.seatLength,
            seatHeight: g.seatHeight,
            frontOffset: g.frontOffset,
            stemThickness: g.stemThickness,
            backwallThickness: g.backwallThickness,
            gap: g.gap,
            wingAngle: g.wings.angle,
            wingLength: g.wings.length,
            wingThickness: g.wings.thickness,
            wingEndHeight: g.wings.endHeight,
          }
        : g.shape === 'circle'
          ? { diameter: g.diameter, count: g.count, spacing: g.spacing }
          : { width: g.width, depth: g.depth, count: g.count, spacing: g.spacing };
  for (const [name, text] of Object.entries(fields)) {
    const v = num(text, 'dimension');
    if (v === undefined) continue;
    const valid = DIMENSION_RULES[name]?.(v) ?? v > 0;
    if (!valid) issues.push({ code: 'InvalidDimension', name, value: v });
    out[name] = v;
  }
  return out;
}

/** Platné hodnoty rozmerov, ktoré nemusia byť kladné (ostatné > 0). */
const DIMENSION_RULES: Record<string, (v: number) => boolean> = {
  count: (v) => Number.isInteger(v) && v >= 1,
  spacing: (v) => v >= 0,
  frontOffset: () => true,
  gap: (v) => v >= 0,
  wingLength: (v) => v >= 0,
  wingAngle: (v) => Math.abs(v) < 85,
};
