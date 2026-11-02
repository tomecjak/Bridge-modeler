import { centroid, clipPolygonHalfPlane, type Polygon2D, signedArea, vec2 } from '@bridge/geom';
import type { Superstructure } from '@bridge/model';
import type { SolidPart } from './abutment.ts';
import { type BridgeArea, bridgeArea } from './bridgeArea.ts';
import type { BridgeLengths } from './bridgeLengths.ts';
import { type DeckOutline, outlineArea } from './deckOutline.ts';
import type { DeckSegment } from './deckSampling.ts';
import type { DeckWidthRange } from './edgeBeam.ts';
import { SLENDERNESS, sectionDepth } from './slenderness.ts';
import { ECONOMIC_SPANS, type SpanResult } from './spans.ts';
import { evaluateSuperstructure, type SectionContext } from './superstructure.ts';
import { supportParts } from './supportGeometry.ts';
import type { BearingLineResult, SupportResult } from './supports.ts';

const cot = (a: number) => Math.cos(a) / Math.sin(a);

/**
 * Objem úseku NK alebo rímsy ∫A·dL [m³] (ADR 0024): lichobežníky plôch prierezov vo vzorkách po dĺžke osi mosta
 * (`measure`: spojité staničenie → dĺžka po osi mosta); pri priereze kolmom na niveletu dL · √(1 + g²). Šikmé hranice
 * ako v sieti: bod v priečnej polohe x končí o x·cot α skôr, čo pridá cot α₀·A₀·x̄₀ na začiatku a uberie cot α₁·A₁·x̄₁
 * na konci. Bez opravy na excentricitu ťažiska v oblúku.
 */
export function segmentVolume(
  segment: Pick<DeckSegment, 'sections' | 'startAngle' | 'endAngle'>,
  measure: (s: number) => number,
  orientation: Superstructure['orientation'],
): number {
  const sections = segment.sections.filter((s) => s.axis && s.loops.length > 0);
  const first = sections[0];
  const last = sections.at(-1);
  if (!first || !last || first === last) return 0;
  /** dĺžka po osi mosta → dĺžka kolmo na rovinu prierezu */
  const along = (sec: (typeof sections)[number]) => {
    if (orientation !== 'normalToGrade' || !sec.axis) return 1;
    const t = sec.axis.frame.tangent;
    return 1 / Math.hypot(t.x, t.y);
  };
  let volume = 0;
  for (let i = 0; i + 1 < sections.length; i++) {
    const a = sections[i] as (typeof sections)[number];
    const b = sections[i + 1] as (typeof sections)[number];
    volume += ((a.area * along(a) + b.area * along(b)) / 2) * (measure(b.s) - measure(a.s));
  }
  const moment = (sec: (typeof sections)[number]) => sec.area * sec.centroid.x * along(sec);
  return volume + cot(segment.startAngle) * moment(first) - cot(segment.endAngle) * moment(last);
}

/** Objem časti podpery: pôdorys (prípadne rozdelený pri ložiskách) × rozdiel lineárnych plôch v ťažisku. */
function partVolume(r: SupportResult, part: SolidPart): number {
  let pieces: Polygon2D[] = [part.plan];
  const axis = r.axis;
  if (part.foldsAtBearings && axis) {
    // priečna poloha x(p) = (p − bod osi)·normála; pásy medzi ložiskami
    const n = axis.frame.normal;
    const at = (x: number) => vec2(axis.point.x + x * n.x, axis.point.y + x * n.y);
    for (const x of [...new Set(r.bearings.map((b) => b.x))]) {
      pieces = pieces.flatMap((p) => [
        clipPolygonHalfPlane(p, at(x), vec2(-n.x, -n.y)),
        clipPolygonHalfPlane(p, at(x), vec2(n.x, n.y)),
      ]);
    }
  }
  let volume = 0;
  for (const p of pieces) {
    if (p.length < 3) continue;
    const area = Math.abs(signedArea(p));
    if (area <= 0) continue;
    const c = centroid(p);
    volume += area * Math.max(0, part.top(c) - part.bottom(c));
  }
  return volume;
}

/**
 * Objem betónu podpery [m³] (ADR 0024): časti zo `supportParts` (základ, driek / stĺpy, časti opory) ako zvislé
 * hranoly s plochami lineárnymi medzi ložiskami; bez ložísk a pilót.
 */
export function supportVolume(r: SupportResult): number {
  return supportParts(r).reduce((sum, part) => sum + partVolume(r, part), 0);
}

/** Ukazovatele jednej NK (ADR 0024); dĺžky v m, plochy v m², objemy v m³, uhly v rad. */
export interface DeckIndicators {
  typology: string | undefined;
  /** dĺžky polí v osi mosta */
  spans: number[];
  /** najdlhšie pole a ekonomické rozpätie typológie (informatívne) */
  maxSpan: { length: number; economic: number | undefined } | undefined;
  piers: number;
  abutments: number;
  lengths: BridgeLengths | undefined;
  widths: DeckWidthRange | undefined;
  /** najmenší ostrý uhol kríženia osí uloženia */
  minCrossingAngle: number | undefined;
  bridgeArea: BridgeArea;
  deckPlanArea: number;
  deckVolume: number;
  edgeBeamVolume: number;
  /** objem NK / pôdorysná plocha NK */
  equivalentThickness: number | undefined;
  /** štíhlosť najdlhšieho poľa L/h (h v strede poľa) a orientačný rozsah typológie */
  slenderness:
    | { ratio: number; length: number; depth: number; range: readonly [number, number] | undefined }
    | undefined;
  /** pomer krajného a susedného vnútorného poľa na začiatku a na konci (pri ≥ 3 poliach) */
  endSpanRatios: readonly [number, number] | undefined;
}

export interface DeckIndicatorInput {
  ctx: SectionContext;
  sup: Superstructure;
  /** úseky NK zo vzorkovania (ako 3D) a úseky jej ríms */
  segments: readonly DeckSegment[];
  edgeBeams: readonly Pick<DeckSegment, 'sections' | 'startAngle' | 'endAngle'>[];
  outline: Pick<DeckOutline, 'polygon'>;
  bridgeOutline: Pick<DeckOutline, 'polygon'>;
  /** spojité staničenie → dĺžka po osi mosta */
  measure: (s: number) => number;
  /** podpery a osi uloženia tejto NK */
  supports: readonly SupportResult[];
  lines: readonly BearingLineResult[];
  spans: Pick<SpanResult, 'spans'> & { lengths?: BridgeLengths | undefined };
  widths: DeckWidthRange | undefined;
  /** tolerancia merania výšky prierezu [m] */
  eps: number;
}

/**
 * Ukazovatele NK pre porovnanie variantov (ADR 0024): dispozícia, plocha mosta (`bridgeArea`), pôdorysná plocha
 * a objem NK (bez ríms; rímsy zvlášť), ekvivalentná hrúbka, štíhlosť najdlhšieho poľa a pomer krajných polí.
 */
export function deckIndicators(input: DeckIndicatorInput): DeckIndicators {
  const { ctx, sup, measure } = input;
  const profile = ctx.profiles.find((p) => p.id === sup.profile);
  const typology = profile?.typology;
  const spans = input.spans.spans;
  const lengths = spans.map((s) => s.length);
  const longest = spans.reduce<(typeof spans)[number] | undefined>(
    (best, s) => (!best || s.length > best.length ? s : best),
    undefined,
  );
  const deckVolume = input.segments.reduce(
    (sum, seg) => sum + segmentVolume(seg, measure, sup.orientation),
    0,
  );
  const edgeBeamVolume = input.edgeBeams.reduce(
    (sum, seg) => sum + segmentVolume(seg, measure, sup.orientation),
    0,
  );
  const deckPlanArea = outlineArea(input.outline);
  const angles = input.lines
    .map((l) => l.crossingAngle)
    .filter((a) => Number.isFinite(a))
    .map((a) => Math.min(a, Math.PI - a));

  let slenderness: DeckIndicators['slenderness'];
  if (longest && profile) {
    const mid = (longest.from.s + longest.to.s) / 2;
    const depth = sectionDepth(evaluateSuperstructure(ctx, sup, mid, profile).loops, input.eps);
    if (depth > 0)
      slenderness = {
        ratio: longest.length / depth,
        length: longest.length,
        depth,
        range: typology ? SLENDERNESS[typology]?.field : undefined,
      };
  }
  const n = lengths.length;
  const ratio = (a: number | undefined, b: number | undefined) =>
    a !== undefined && b !== undefined && b > 0 ? a / b : Number.NaN;

  return {
    typology,
    spans: lengths,
    maxSpan: longest && {
      length: longest.length,
      economic: typology ? ECONOMIC_SPANS[typology] : undefined,
    },
    piers: input.supports.filter((r) => r.support.kind === 'pier').length,
    abutments: input.supports.filter((r) => r.support.kind === 'abutment').length,
    lengths: input.spans.lengths,
    widths: input.widths,
    minCrossingAngle: angles.length > 0 ? Math.min(...angles) : undefined,
    bridgeArea: bridgeArea(input.bridgeOutline, input.supports),
    deckPlanArea,
    deckVolume,
    edgeBeamVolume,
    equivalentThickness: deckPlanArea > 0 ? deckVolume / deckPlanArea : undefined,
    slenderness,
    endSpanRatios:
      n >= 3 ? [ratio(lengths[0], lengths[1]), ratio(lengths[n - 1], lengths[n - 2])] : undefined,
  };
}
