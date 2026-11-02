import { describe, expect, it } from 'vitest';
import { bridgeArea } from './bridgeArea.ts';
import { deckOutline, outlineArea } from './deckOutline.ts';
import { sampleSuperstructure } from './deckSampling.ts';
import { evaluateReference212 } from './testing/reference212.ts';

describe('bridgeArea (ADR 0024)', () => {
  const { ctx, deck, results } = evaluateReference212();
  const samples = sampleSuperstructure(ctx, deck, results);
  if (!('sections' in samples)) throw new Error('212-00 sa nevzorkovala');
  const outline = deckOutline(samples);

  it('takes the plan area between the seat fronts of both abutments (212-00: 53.20 × 16.50 m)', () => {
    const area = bridgeArea(outline, results);
    expect(area.source).toBe('bridged');
    // šikmé líce: rovnobežník medzi lícami = dĺžka premostenia v osi × šírka kolmo na os
    expect(area.value).toBeCloseTo(53.2 * 16.5, 6);
  });

  it('falls back to the whole deck without two abutments', () => {
    const area = bridgeArea(outline, results.slice(1));
    expect(area).toEqual({ value: outlineArea(outline), source: 'deck' });
    expect(area.value).toBeCloseTo(56 * 16.5, 6);
  });
});
