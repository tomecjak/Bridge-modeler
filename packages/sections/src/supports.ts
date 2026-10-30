import { azimuthToVector, type Vec2, vec2 } from '@bridge/geom';
import type { IssueOwner, ModelIssue, Superstructure, Support } from '@bridge/model';
import { lowestCrossing } from './crossing.ts';
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
  for (const [name, value] of Object.entries(footing)) {
    if (value !== undefined && !(value > 0))
      issues.push({ code: 'InvalidDimension', name: `footing.${name}`, value });
  }
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

  if (result.bearings.length > 0) {
    const heights = result.bearings.map((b) => b.height);
    result.height = { min: Math.min(...heights), max: Math.max(...heights) };
    if (result.height.min <= 0)
      issues.push({ code: 'NonPositiveSupportHeight', height: result.height.min });
  }
  return done();
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
        ? { seatLength: g.seatLength, stemThickness: g.stemThickness, length: g.length }
        : g.shape === 'circle'
          ? { diameter: g.diameter, count: g.count, spacing: g.spacing }
          : { width: g.width, depth: g.depth, count: g.count, spacing: g.spacing };
  for (const [name, text] of Object.entries(fields)) {
    const v = num(text, 'dimension');
    if (v === undefined) continue;
    const valid =
      name === 'count' ? Number.isInteger(v) && v >= 1 : name === 'spacing' ? v >= 0 : v > 0;
    if (!valid) issues.push({ code: 'InvalidDimension', name, value: v });
    out[name] = v;
  }
  return out;
}
