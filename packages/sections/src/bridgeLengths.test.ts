import { type AlignmentData, createAlignment } from '@bridge/alignment';
import { vec2 } from '@bridge/geom';
import { buildParameterSet, type ProjectFile, type Superstructure } from '@bridge/model';
import { describe, expect, it } from 'vitest';
import { bridgeAxisLength } from './axisLength.ts';
import { bridgeLengths } from './bridgeLengths.ts';
import { bridgeAxisPlan } from './longitudinal.ts';
import { evaluateSpans, spanLines } from './spans.ts';
import { evaluateBearingLine, evaluateSupport, type SupportContext } from './supports.ts';
import { reference212Project } from './testing/index.ts';

/** Dĺžky mosta projektu s jednou NK (ako v `store/supports.ts`). */
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

describe('bridgeLengths', () => {
  it('gives the 212-00 deck, bridged and overall lengths of the drawing', () => {
    const { spans, lengths } = lengthsOf(reference212Project());
    expect(spans.spans.map((s) => s.length)).toEqual([
      expect.closeTo(16, 6),
      expect.closeTo(23, 6),
      expect.closeTo(16, 6),
    ]);
    expect(lengths.deck.length).toBeCloseTo(56, 6);
    expect(lengths.bridged?.length).toBeCloseTo(53.2, 6);
    expect(lengths.overall.length).toBeCloseTo(65.84, 6);
    // presahy: 0,50 koniec NK za osou uloženia, 0,90 predsadenie prahu, 4,00 + 0,84 + 0,08 + 0,50 za koncom NK
    expect(lengths.bridged?.lFrom ?? 0).toBeCloseTo(lengths.deck.lFrom + 0.5 + 0.9, 6);
    expect(lengths.overall.lFrom).toBeCloseTo(lengths.deck.lFrom - 4.92, 6);
  });

  it('measures spans along an axis offset into a curve, not along the road', () => {
    const p = reference212Project();
    const road = p.alignments[0] as AlignmentData;
    const start = road.horizontal[0]?.start ?? vec2(0, 0);
    const R = 300;
    const a = road.length / R;
    p.alignments = [
      {
        ...road,
        horizontal: [
          {
            kind: 'arc',
            length: road.length,
            start,
            end: vec2(start.x + R - R * Math.cos(a), start.y + R * Math.sin(a)),
            center: vec2(start.x + R, start.y),
            radius: R,
            rotation: 'cw',
          },
        ],
      },
    ];
    // os mosta 7 m vpravo = na vnútornej strane oblúka doprava
    p.bridgeAxes = p.bridgeAxes.map((ax) => ({
      ...ax,
      horizontalOffset: { kind: 'constant', value: '7' },
    }));
    const { results, spans, lengths } = lengthsOf(p);
    for (const r of results) expect(r.issues, r.support.name).toEqual([]);
    const k = 1 - 7 / R;
    expect(spans.spans.map((s) => s.length)).toEqual([
      expect.closeTo(16 * k, 6),
      expect.closeTo(23 * k, 6),
      expect.closeTo(16 * k, 6),
    ]);
    expect(lengths.deck.length).toBeCloseTo(56 * k, 6);
    expect(lengths.bridged?.length).toBeGreaterThan(50);
    expect(lengths.bridged?.length).toBeLessThan(lengths.deck.length);
    expect(lengths.overall.length).toBeGreaterThan(lengths.deck.length + 9);
  });
});
