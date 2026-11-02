import { type AlignmentData, createAlignment, type SuperelevationData } from '@bridge/alignment';
import { describe, expect, it } from 'vitest';
import { deckChecks } from './deckChecks.ts';
import { CROSS_SLOPE_TOLERANCE, crossSlopeIssues } from './superelevation.ts';
import { evaluateReference212 } from './testing/reference212.ts';

// 212-00: NK km 9,307 31 – 9,363 31, staStart osi 9 250 (bez skokov), q prierezu predvolene 0,045
const { p, ctx, deck } = evaluateReference212();

function withSuperelevation(superelevation: SuperelevationData[]) {
  const origin = p.crs.origin as NonNullable<typeof p.crs.origin>;
  const data = { ...(p.alignments[0] as AlignmentData), superelevation };
  const { alignment } = createAlignment(data, origin);
  return { ...ctx, alignments: new Map([[alignment.name, alignment]]) };
}

describe('cross slope against superelevation from LandXML (ADR 0022)', () => {
  it('accepts a deck in full superelevation equal to q (positive = falls to the right)', () => {
    const c = withSuperelevation([{ staStart: 9280, staEnd: 9400, fullSuperelev: 4.5 }]);
    expect(crossSlopeIssues(c, deck, CROSS_SLOPE_TOLERANCE)).toEqual([]);
    // 4,58 % je ešte v tolerancii 0,1 %
    const near = withSuperelevation([{ staStart: 9280, staEnd: 9400, fullSuperelev: 4.58 }]);
    expect(crossSlopeIssues(near, deck, CROSS_SLOPE_TOLERANCE)).toEqual([]);
  });

  it('warns when q differs from the full superelevation', () => {
    const c = withSuperelevation([{ staStart: 9280, staEnd: 9400, fullSuperelev: -4 }]);
    const issues = crossSlopeIssues(c, deck, CROSS_SLOPE_TOLERANCE);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: 'CrossSlopeMismatch',
      severity: 'warning',
      superelevation: -0.04,
    });
    expect(issues[0]).toMatchObject({
      q: expect.closeTo(0.045, 9),
      station: expect.closeTo(deck.from, 6),
    });
  });

  it('warns when the deck reaches into a superelevation transition', () => {
    const c = withSuperelevation([
      {
        staStart: 9340,
        staEnd: 9400,
        beginRunoff: 9330,
        fullSuper: 9340,
        fullSuperelev: 4.5,
        runoff: 9400,
      },
    ]);
    const issues = crossSlopeIssues(c, deck, CROSS_SLOPE_TOLERANCE);
    expect(issues).toEqual([
      { code: 'DeckInSuperelevationTransition', from: 9330, to: 9340, severity: 'warning' },
    ]);
  });

  it('checks nothing without superelevation or when it is inconsistent', () => {
    expect(crossSlopeIssues(ctx, deck, CROSS_SLOPE_TOLERANCE)).toEqual([]);
    const shifted = withSuperelevation([
      { staStart: 9250, staEnd: 9260, fullSuper: 9320, runoff: 9350, fullSuperelev: -4 },
    ]);
    expect(crossSlopeIssues(shifted, deck, CROSS_SLOPE_TOLERANCE)).toEqual([]);
  });

  it('is part of the deck checks', () => {
    const c = withSuperelevation([{ staStart: 9280, staEnd: 9400, fullSuperelev: -4 }]);
    expect(deckChecks(c, deck, undefined).map((i) => i.code)).toContain('CrossSlopeMismatch');
  });
});
