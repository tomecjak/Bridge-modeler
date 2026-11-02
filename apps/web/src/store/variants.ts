import type { Alignment } from '@bridge/alignment';
import { type DeckDrawingData, deckDrawingData } from '@bridge/drawing';
import { effectiveParameters, type ProjectFile } from '@bridge/model';
import {
  type AxisLength,
  type ClearanceCheck,
  checkClearance,
  type DeckIndicators,
  deckIndicators,
  deckSampleStations,
  deckWidthRange,
  evaluateObstacle,
  type ObstacleResult,
  type SectionContext,
  type SupportResult,
  supportVolume,
} from '@bridge/sections';
import { produce } from 'immer';
import { alignmentsOf, measureOf, parametersOf } from './modelCache.ts';
import { normalizeProject } from './projectStore.ts';
import { supportStateOf } from './supports.ts';

/** Tolerancia merania výšky prierezu pre štíhlosť [m] (ako v kontrolách, ADR 0022). */
const DEPTH_EPS = 1e-6;

/** Vyhodnotený variant (ADR 0024): NK s ukazovateľmi, podpery, prekážky a ich kontroly. */
export interface VariantModel {
  /** projekt variantu po zosúladení (konce NK, terén podpier) */
  project: ProjectFile;
  alignments: ReadonlyMap<string, Alignment>;
  axisLengths: ReadonlyMap<string, AxisLength>;
  decks: { drawing: DeckDrawingData; indicators: DeckIndicators }[];
  supports: readonly SupportResult[];
  obstacles: readonly ObstacleResult[];
  clearance: readonly ClearanceCheck[];
}

/**
 * Vyhodnotí projekt s aktívnym variantom (napr. z `variantProject`) tými istými čistými funkciami ako pohľady:
 * normalizátory store, osi, parametre s prepismi variantu, podpery a polia, NK (vzorky ako 3D), prekážky a kontroly
 * voľnej výšky. Bez lokálneho počiatku undefined.
 */
export function evaluateVariant(raw: ProjectFile): VariantModel | undefined {
  const fix = normalizeProject(raw);
  const project = fix ? produce(raw, fix) : raw;
  const origin = project.crs.origin;
  if (!origin) return undefined;
  const alignments = alignmentsOf(project, origin);
  const globals = effectiveParameters(project);
  const parameters = parametersOf(globals);
  const axisLengths = new Map<string, AxisLength>();
  for (const axis of project.bridgeAxes) {
    const road = alignments.get(axis.alignment);
    if (road) axisLengths.set(axis.id, measureOf(axis, road, parameters));
  }
  const state = supportStateOf(project, alignments, parameters, axisLengths);
  const { bridgeAxes, profiles, planLines, surveys, edgeBeams, brief, superstructures } = project;
  const ctx: SectionContext = {
    alignments,
    parameters,
    bridgeAxes,
    profiles,
    planLines,
    surveys,
    edgeBeams,
    brief,
    crossbeams: state.crossbeams,
  };
  const globalLaws = globals.map((p) => ({ law: p.law, unit: p.unit }));
  const decks = superstructures.flatMap((sup) => {
    const drawing = deckDrawingData(ctx, sup, state.supports, { globalLaws }, state.lines);
    const measure = axisLengths.get(sup.bridgeAxis)?.lengthAt;
    if (!drawing || !measure) return [];
    const spans = state.spans.get(sup.id);
    const indicators = deckIndicators({
      ctx,
      sup,
      segments: drawing.samples.segments,
      edgeBeams: drawing.edgeBeams.map((b) => b.segment),
      outline: drawing.outline,
      bridgeOutline: drawing.bridgeOutline,
      measure,
      supports: drawing.own,
      lines: drawing.lines,
      spans: spans ?? { spans: [] },
      widths: deckWidthRange(ctx, sup, deckSampleStations(ctx, sup, spans)),
      eps: DEPTH_EPS,
    });
    return [{ drawing, indicators }];
  });
  const obstacles = project.obstacles.map((o) =>
    evaluateObstacle(
      { alignments, parameters, bridgeAxes, superstructures, planLines, surveys },
      o,
    ),
  );
  const clearance = obstacles.map((r) =>
    checkClearance({ ...ctx, superstructures }, r, state.supports),
  );
  return {
    project,
    alignments,
    axisLengths,
    decks,
    supports: state.supports,
    obstacles,
    clearance,
  };
}

/** Skupiny ukazovateľov v tabuľke porovnania. */
export type IndicatorGroup = 'layout' | 'areas' | 'supports' | 'checks';

/** Jednotka hodnoty na zobrazenie (uhly sú v rad, zobrazujú sa v °). */
export type IndicatorUnit = 'count' | 'm' | 'm2' | 'm3' | 'angle' | 'ratio';

export type IndicatorValue =
  | {
      kind: 'number';
      value: number /** hodnota len z časti (napr. plocha celej NK bez opôr) */;
      partial?: boolean;
    }
  | { kind: 'range'; min: number; max: number }
  /** dĺžky polí po NK */
  | { kind: 'spans'; decks: readonly (readonly number[])[] }
  | { kind: 'ratios'; values: readonly number[] };

export interface IndicatorDef {
  key: string;
  group: IndicatorGroup;
  unit: IndicatorUnit;
  /** lepšia hodnota pri porovnaní (len číselné riadky); bez nej sa nezvýrazňuje */
  better?: 'min' | 'max';
}

/** Ukazovatele v poradí tabuľky (ADR 0024); texty a vysvetlivky sú v `sk.variants.indicators`. */
export const INDICATORS = [
  { key: 'spanCount', group: 'layout', unit: 'count' },
  { key: 'spans', group: 'layout', unit: 'm' },
  { key: 'maxSpan', group: 'layout', unit: 'm' },
  { key: 'economicSpan', group: 'layout', unit: 'm' },
  { key: 'piers', group: 'layout', unit: 'count', better: 'min' },
  { key: 'abutments', group: 'layout', unit: 'count' },
  { key: 'deckLength', group: 'layout', unit: 'm' },
  { key: 'bridgedLength', group: 'layout', unit: 'm' },
  { key: 'overallLength', group: 'layout', unit: 'm' },
  { key: 'deckWidth', group: 'layout', unit: 'm' },
  { key: 'bridgeWidth', group: 'layout', unit: 'm' },
  { key: 'freeWidth', group: 'layout', unit: 'm' },
  { key: 'minCrossingAngle', group: 'layout', unit: 'angle', better: 'max' },
  { key: 'bridgeArea', group: 'areas', unit: 'm2', better: 'min' },
  { key: 'deckPlanArea', group: 'areas', unit: 'm2', better: 'min' },
  { key: 'deckVolume', group: 'areas', unit: 'm3', better: 'min' },
  { key: 'edgeBeamVolume', group: 'areas', unit: 'm3', better: 'min' },
  { key: 'substructureVolume', group: 'areas', unit: 'm3', better: 'min' },
  { key: 'equivalentThickness', group: 'areas', unit: 'm', better: 'min' },
  { key: 'pierHeights', group: 'supports', unit: 'm' },
  { key: 'supportsInObstacle', group: 'supports', unit: 'count', better: 'min' },
  { key: 'bearings', group: 'supports', unit: 'count', better: 'min' },
  { key: 'freeHeight', group: 'checks', unit: 'm', better: 'max' },
  { key: 'freeHeightReserve', group: 'checks', unit: 'm', better: 'max' },
  { key: 'slenderness', group: 'checks', unit: 'ratio' },
  { key: 'slendernessRange', group: 'checks', unit: 'ratio' },
  { key: 'endSpanRatios', group: 'checks', unit: 'ratio' },
] as const satisfies readonly IndicatorDef[];

export type IndicatorKey = (typeof INDICATORS)[number]['key'];
export type Indicators = Partial<Record<IndicatorKey, IndicatorValue | undefined>>;

const num = (value: number | undefined, partial = false): IndicatorValue | undefined =>
  value === undefined || !Number.isFinite(value)
    ? undefined
    : partial
      ? { kind: 'number', value, partial }
      : { kind: 'number', value };

const range = (values: readonly number[]): IndicatorValue | undefined =>
  values.length === 0
    ? undefined
    : { kind: 'range', min: Math.min(...values), max: Math.max(...values) };

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

/**
 * Ukazovatele variantu (ADR 0024) zo všetkých jeho NK: počty, plochy a objemy sa sčítajú, dĺžky a rozpätia berú
 * najväčšiu hodnotu, šírky a výšky rozsah. Štíhlosť a pomer polí sú z NK s najdlhším poľom.
 */
export function variantIndicators(model: VariantModel): Indicators {
  const decks = model.decks.map((d) => d.indicators);
  if (decks.length === 0) return {};
  const values = <T>(pick: (d: DeckIndicators) => T | undefined): T[] =>
    decks.flatMap((d) => {
      const v = pick(d);
      return v === undefined ? [] : [v];
    });
  const max = (list: readonly number[]) => (list.length > 0 ? Math.max(...list) : undefined);
  const longest = decks.reduce<DeckIndicators | undefined>(
    (best, d) =>
      d.maxSpan && (!best?.maxSpan || d.maxSpan.length > best.maxSpan.length) ? d : best,
    undefined,
  );
  const piers = model.supports.filter((r) => r.support.kind === 'pier');
  const reserves = model.clearance.flatMap((c) =>
    c.minimum ? [{ free: c.minimum.free, reserve: c.minimum.free - c.minimum.required }] : [],
  );
  const deckVolume = sum(decks.map((d) => d.deckVolume));
  const deckPlanArea = sum(decks.map((d) => d.deckPlanArea));
  const slenderness = longest?.slenderness;
  const out: Indicators = {
    spanCount: num(max(decks.map((d) => d.spans.length))),
    spans: decks.length > 0 ? { kind: 'spans', decks: decks.map((d) => d.spans) } : undefined,
    maxSpan: num(longest?.maxSpan?.length),
    economicSpan: num(longest?.maxSpan?.economic),
    piers: num(sum(decks.map((d) => d.piers))),
    abutments: num(sum(decks.map((d) => d.abutments))),
    deckLength: num(max(values((d) => d.lengths?.deck.length))),
    bridgedLength: num(max(values((d) => d.lengths?.bridged?.length))),
    overallLength: num(max(values((d) => d.lengths?.overall.length))),
    deckWidth: range(values((d) => d.widths?.deck).flatMap((w) => [w.min, w.max])),
    bridgeWidth: range(values((d) => d.widths?.bridge).flatMap((w) => [w.min, w.max])),
    freeWidth: range(values((d) => d.widths?.free).flatMap((w) => [w.min, w.max])),
    minCrossingAngle: num(
      values((d) => d.minCrossingAngle).reduce<number | undefined>(
        (a, b) => (a === undefined ? b : Math.min(a, b)),
        undefined,
      ),
    ),
    bridgeArea: num(
      sum(decks.map((d) => d.bridgeArea.value)),
      decks.some((d) => d.bridgeArea.source === 'deck'),
    ),
    deckPlanArea: num(deckPlanArea),
    deckVolume: num(deckVolume),
    edgeBeamVolume: num(sum(decks.map((d) => d.edgeBeamVolume))),
    substructureVolume: num(sum(model.supports.map(supportVolume))),
    equivalentThickness: num(deckPlanArea > 0 ? deckVolume / deckPlanArea : undefined),
    pierHeights: range(piers.map((r) => r.height.max).filter(Number.isFinite)),
    supportsInObstacle: num(
      model.clearance.flatMap((c) => c.issues).filter((i) => i.code === 'SupportInClearance')
        .length,
    ),
    bearings: num(
      sum(
        model.supports
          .filter((r) => r.support.connection === 'bearing')
          .map((r) => r.bearings.length),
      ),
    ),
    freeHeight: num(reserves.length > 0 ? Math.min(...reserves.map((r) => r.free)) : undefined),
    freeHeightReserve: num(
      reserves.length > 0 ? Math.min(...reserves.map((r) => r.reserve)) : undefined,
    ),
    slenderness: num(slenderness?.ratio),
    slendernessRange: slenderness?.range && range(slenderness.range),
    endSpanRatios: longest?.endSpanRatios && {
      kind: 'ratios',
      values: longest.endSpanRatios,
    },
  };
  return out;
}

/**
 * Indexy variantov s najlepšou hodnotou riadku (ADR 0024): len číselné hodnoty, aspoň dva varianty s hodnotou a nie
 * všetky rovnaké (relatívna tolerancia 1e-9); pri zhode všetky najlepšie.
 */
export function bestVariants(
  values: readonly (IndicatorValue | undefined)[],
  better: 'min' | 'max' | undefined,
): number[] {
  if (!better) return [];
  const numbers = values.map((v) => (v?.kind === 'number' ? v.value : undefined));
  const defined = numbers.filter((v): v is number => v !== undefined);
  if (defined.length < 2) return [];
  const best = better === 'min' ? Math.min(...defined) : Math.max(...defined);
  const tol = 1e-9 * Math.max(1, Math.abs(best));
  if (defined.every((v) => Math.abs(v - best) <= tol)) return [];
  return numbers.flatMap((v, i) => (v !== undefined && Math.abs(v - best) <= tol ? [i] : []));
}
