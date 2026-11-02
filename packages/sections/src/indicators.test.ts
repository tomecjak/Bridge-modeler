import { pointInPolygon, vec2 } from '@bridge/geom';
import { describe, expect, it } from 'vitest';
import { bridgeAxisLength } from './axisLength.ts';
import { deckOutline } from './deckOutline.ts';
import { sampleSuperstructure } from './deckSampling.ts';
import { deckIndicators, segmentVolume, supportVolume, UNIT_PRICES } from './indicators.ts';
import { evaluateSpans, spanLines } from './spans.ts';
import { evaluateSuperstructure } from './superstructure.ts';
import { supportParts } from './supportGeometry.ts';
import { ANGLE, evaluateReference212 } from './testing/reference212.ts';

const ref = evaluateReference212();
const { ctx, deck, results, lines, alignment } = ref;
const axis = ctx.bridgeAxes[0] as (typeof ctx.bridgeAxes)[number];
const measure = bridgeAxisLength(axis, alignment, ctx.parameters).lengthAt;
const samples = sampleSuperstructure(ctx, deck, results);
if (!('sections' in samples)) throw new Error('212-00 sa nevzorkovala');

/** Objem zvislých hranolov podpery numericky na mriežke (nezávislá kontrola). */
function gridVolume(r: (typeof results)[number], step: number): number {
  let sum = 0;
  for (const part of supportParts(r)) {
    const xs = part.plan.map((p) => p.x);
    const ys = part.plan.map((p) => p.y);
    for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step)
      for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) {
        const p = vec2(x, y);
        if (pointInPolygon(p, part.plan)) sum += Math.max(0, part.top(p) - part.bottom(p));
      }
  }
  return sum * step * step;
}

describe('indicators (ADR 0024)', () => {
  it('integrates a constant deck section to A·L (212-00: 56 m, skew ends)', () => {
    const area = evaluateSuperstructure(ctx, deck, (ref.sFrom + ref.sTo) / 2).area;
    expect(area).toBeGreaterThan(0);
    const [segment] = samples.segments;
    if (!segment) throw new Error('bez úseku');
    expect(segmentVolume(segment, measure, 'vertical')).toBeCloseTo(area * 56, 6);
  });

  it('adds the first moment at a skew start and removes it at a skew end', () => {
    const [segment] = samples.segments;
    if (!segment) throw new Error('bez úseku');
    // posunutý prierez: x̄ = 2 m, šikmý len začiatok
    const shifted = {
      ...segment,
      sections: segment.sections.map((s) => ({ ...s, centroid: vec2(2, 0) })),
      endAngle: Math.PI / 2,
    };
    const area = segment.sections[0]?.area ?? 0;
    const alpha = (ANGLE * Math.PI) / 180;
    expect(segmentVolume(shifted, measure, 'vertical')).toBeCloseTo(
      area * 56 + (Math.cos(alpha) / Math.sin(alpha)) * area * 2,
      6,
    );
  });

  it('computes the concrete volume of the supports like a numeric integration (± 0.5 %)', () => {
    for (const r of results) {
      const v = supportVolume(r);
      expect(v, r.support.name).toBeGreaterThan(0);
      expect(Math.abs(v / gridVolume(r, 0.02) - 1), r.support.name).toBeLessThan(0.005);
    }
    // pilier: základ 9 × 6,5 × 1,5 m je celý v objeme
    expect(supportVolume(results[1] as (typeof results)[number])).toBeGreaterThan(9 * 6.5 * 1.5);
  });

  it('summarises the deck of 212-00: spans, areas, volume, thickness and slenderness', () => {
    const spans = evaluateSpans(deck, spanLines(lines, results), { measure });
    const outline = deckOutline(samples);
    const d = deckIndicators({
      ctx,
      sup: deck,
      segments: samples.segments,
      edgeBeams: [],
      outline,
      bridgeOutline: outline,
      measure,
      supports: results,
      lines,
      spans,
      widths: undefined,
      eps: 1e-4,
    });
    expect(d.spans).toEqual([expect.closeTo(16, 9), expect.closeTo(23, 9), expect.closeTo(16, 9)]);
    expect(d.maxSpan?.length).toBeCloseTo(23, 9);
    expect([d.piers, d.abutments]).toEqual([2, 2]);
    expect(d.minCrossingAngle).toBeCloseTo((ANGLE * Math.PI) / 180, 12);
    expect(d.bridgeArea.value).toBeCloseTo(53.2 * 16.5, 6);
    expect(d.deckPlanArea).toBeCloseTo(56 * 16.5, 6);
    expect(d.equivalentThickness).toBeCloseTo(d.deckVolume / d.deckPlanArea, 12);
    expect(d.edgeBeamVolume).toBe(0);
    expect(d.slenderness?.depth).toBeCloseTo(1.2, 6);
    expect(d.slenderness?.ratio).toBeCloseTo(23 / 1.2, 6);
    expect(d.endSpanRatios?.map((r) => r.toFixed(4))).toEqual(['0.6957', '0.6957']);
    // zástupná cena jednotrámu s nábehmi × plocha mosta
    expect(d.typology).toBe('singleBeamHaunched');
    expect(d.cost).toBeCloseTo(53.2 * 16.5 * (UNIT_PRICES.singleBeamHaunched ?? 0), 3);
  });
});
