import { describe, expect, it } from 'vitest';
import { deckChecks, deckSampleStations } from './deckChecks.ts';
import { evaluateSpans, spanLines } from './spans.ts';
import { evaluateReference212 } from './testing/reference212.ts';

describe('deck checks over the whole deck', () => {
  const { ctx, lines, results, deck, sFrom, sTo } = evaluateReference212();
  const spans = evaluateSpans(deck, spanLines(lines, results));

  it('samples the deck ends, bearing lines and span midpoints', () => {
    const stations = deckSampleStations(ctx, deck, spans);
    expect(stations).toHaveLength(2 + 4 + 3);
    expect(stations[0]).toBeCloseTo(sFrom, 9);
    expect(stations.at(-1)).toBeCloseTo(sTo, 9);
    const l = lines.map((x) => x.s);
    expect(stations).toContainEqual(((l[0] as number) + (l[1] as number)) / 2);
  });

  it('finds no section problems on the reference bridge 212-00, only its slenderness', () => {
    const issues = deckChecks(ctx, deck, spans);
    expect(issues.filter((i) => i.code !== 'Slenderness')).toEqual([]);
    expect(issues.filter((i) => i.code === 'Slenderness')).toHaveLength(3);
  });

  it('reports a problem found at several stations once', () => {
    const broken = {
      ...deck,
      parameterLaws: {
        ...deck.parameterLaws,
        bL: {
          kind: 'edge' as const,
          curve: { type: 'planLine' as const, id: 'x' },
          side: 'left' as const,
          add: '0',
        },
      },
    };
    const issues = deckChecks(ctx, broken, spans);
    expect(issues.filter((i) => i.code === 'EdgeCurveNotFound')).toHaveLength(1);
  });

  it('reports a missing bridge axis without stations', () => {
    expect(deckChecks(ctx, { ...deck, bridgeAxis: 'nic' }, spans)).toEqual([
      expect.objectContaining({ code: 'UnknownBridgeAxis', id: 'nic' }),
    ]);
  });
});
