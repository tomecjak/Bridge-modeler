import { type AlignmentData, createAlignment } from '@bridge/alignment';
import {
  type BearingLine,
  buildParameterSet,
  type ProjectFile,
  type Superstructure,
  type Support,
} from '@bridge/model';
import {
  bridgeAxisLength,
  bridgeAxisPlan,
  bridgeLengths,
  evaluateBearingLine,
  evaluateSpans,
  evaluateSupport,
  layoutStations,
  type SupportContext,
  spanLines,
} from '@bridge/sections';
import { ANGLE, reference212Project, STA1 } from '@bridge/sections/testing';
import { describe, expect, it } from 'vitest';
import { createProjectStore } from './projectStore.ts';
import { planSpanLayout, type SupportFactory } from './spanLayout.ts';

let counter = 0;
const newId = (prefix: string) => `${prefix}-${++counter}`;

/** Rozloženie polí na projekt 212-00 (os je priamka, spojité staničenie = km − 9 250) a výsledný projekt. */
function apply(p: ProjectFile, spans: number[], newSupport: SupportFactory, angle = '90') {
  const origin = p.crs.origin as NonNullable<ProjectFile['crs']['origin']>;
  const { alignment } = createAlignment(p.alignments[0] as AlignmentData, origin);
  const axis = p.bridgeAxes[0];
  if (!axis) throw new Error('chýba os mosta');
  const measure = bridgeAxisLength(axis, alignment, buildParameterSet([]));
  const s0 = alignment.stationing.fromDisplay(STA1) as number;
  const layout = layoutStations({
    spans,
    anchor: { kind: 'start', s: s0 },
    measure,
    overhang: { start: 0.5, end: 0.5 },
  });
  const store = createProjectStore(p);
  store.getState().dispatch(
    planSpanLayout({
      deck: p.superstructures[0] as Superstructure,
      lines: p.bearingLines,
      supports: p.supports,
      stations: layout.stations,
      range: layout.deck,
      toDisplay: (s) => alignment.stationing.toDisplay(s).station,
      angle,
      newSupport,
      newId,
    }),
  );
  return { project: store.getState().project, store, alignment, measure };
}

/** Polia a dĺžky mosta projektu s jednou NK (ako v `store/supports.ts`). */
function lengthsOf(p: ProjectFile) {
  const origin = p.crs.origin as NonNullable<ProjectFile['crs']['origin']>;
  const { alignment } = createAlignment(p.alignments[0] as AlignmentData, origin);
  const parameters = buildParameterSet([]);
  const ctx: SupportContext = {
    alignments: new Map([[alignment.name, alignment]]),
    parameters,
    bridgeAxes: p.bridgeAxes,
    profiles: p.profiles,
    planLines: p.planLines,
    superstructures: p.superstructures,
    bearingLines: p.bearingLines,
  };
  const lines = p.bearingLines.map((l) => evaluateBearingLine(ctx, l));
  const results = p.supports.map((s) => evaluateSupport(ctx, s));
  const deck = p.superstructures[0] as Superstructure;
  const axis = p.bridgeAxes[0];
  if (!axis) throw new Error('chýba os mosta');
  const sFrom = alignment.stationing.fromDisplay(deck.from) as number;
  const sTo = alignment.stationing.fromDisplay(deck.to) as number;
  const measure = bridgeAxisLength(axis, alignment, parameters);
  const spans = evaluateSpans(deck, spanLines(lines, results), { measure: measure.lengthAt });
  const lengths = bridgeLengths({
    measure,
    supports: results,
    sFrom,
    sTo,
    axisLine: bridgeAxisPlan(axis, alignment, parameters, sFrom - 30, sTo + 30),
  });
  return { results, spans, lengths };
}

/** Podpery zo vzoru 212-00 ako typ z dialógu (opora 1, pilier 2). */
function fromTemplates(p: ProjectFile): SupportFactory {
  const [abutment, pier] = p.supports as [Support, Support];
  return (kind, lineId, name) => ({
    ...structuredClone(kind === 'abutment' ? abutment : pier),
    id: newId('sup'),
    name,
    bearingLine: lineId,
  });
}

const names = (p: ProjectFile) =>
  [...p.bearingLines]
    .sort((a, b) => a.station - b.station)
    .map((l: BearingLine) => [
      l.name,
      p.supports.filter((s) => s.bearingLine === l.id).map((s) => s.name),
    ]);

describe('planSpanLayout', () => {
  it('builds the 212-00 bridge from “16 + 23 + 16” and its skew on a deck without bearing lines', () => {
    const ref = reference212Project();
    const empty: ProjectFile = {
      ...ref,
      bearingLines: [],
      supports: [],
      superstructures: ref.superstructures.map((d) => ({ ...d, from: 9300, to: 9330 })),
    };
    const { project } = apply(empty, [16, 23, 16], fromTemplates(ref), String(ANGLE));
    expect(names(project)).toEqual([
      ['1', ['1']],
      ['2', ['2']],
      ['3', ['3']],
      ['4', ['4']],
    ]);
    expect(project.superstructures[0]).toMatchObject({ from: 9307.31, to: 9363.31 });
    const { results, spans, lengths } = lengthsOf(project);
    for (const r of results) expect(r.issues, r.support.name).toEqual([]);
    expect(spans.spans.map((s) => s.length)).toEqual([
      expect.closeTo(16, 6),
      expect.closeTo(23, 6),
      expect.closeTo(16, 6),
    ]);
    expect(lengths.deck.length).toBeCloseTo(56, 6);
    expect(lengths.bridged?.length).toBeCloseTo(53.2, 6);
    expect(lengths.overall.length).toBeCloseTo(65.84, 6);
  });

  it('keeps and moves existing supports, fills missing piers and renumbers the lines', () => {
    const ref = reference212Project();
    const { project } = apply(ref, [12, 14, 14, 15], fromTemplates(ref), String(ANGLE));
    // opory 1 a 4 na krajných osiach, piliere 2 a 3 podľa poradia, nový pilier na osi 4
    expect(names(project)).toEqual([
      ['1', ['1']],
      ['2', ['2']],
      ['3', ['3']],
      ['4', ['P1']],
      ['5', ['4']],
    ]);
    expect(project.supports.find((s) => s.id === 'p4')?.bearingLine).toBe('l4');
    const { spans } = lengthsOf(project);
    expect(spans.issues.filter((i) => i.severity !== 'warning')).toEqual([]);
    expect(spans.spans.map((s) => Math.round(s.length * 1000) / 1000)).toEqual([12, 14, 14, 15]);
  });

  it('removes surplus piers and their bearing lines in one undoable step', () => {
    const ref = reference212Project();
    const { project, store } = apply(ref, [27.5, 27.5], fromTemplates(ref));
    expect(names(project)).toEqual([
      ['1', ['1']],
      ['2', ['2']],
      ['3', ['4']],
    ]);
    expect(project.bearingLines.every((l) => l.crossingAngle === '90')).toBe(true);
    store.getState().undo();
    expect(store.getState().project).toEqual(ref);
  });
});
