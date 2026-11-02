import { describe, expect, it } from 'vitest';
import { deckChecks, deckSampleStations, edgeBeamChecks } from './deckChecks.ts';
import { evaluateSpans, spanLines } from './spans.ts';
import { edgeBeamTemplate } from './templates/edgeBeam.ts';
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

describe('edge beam checks', () => {
  const { ctx, lines, results, deck } = evaluateReference212();
  const spans = evaluateSpans(deck, spanLines(lines, results));
  const beam = (id: string, profile: string, b: string) => ({
    id,
    name: id,
    superstructure: deck.id,
    side: 'left' as const,
    profile,
    parameterLaws: { b: { kind: 'constant' as const, value: b } },
  });

  it('reports the problems of each edge beam once over the whole deck', () => {
    const withBeams = {
      ...ctx,
      profiles: [...ctx.profiles, edgeBeamTemplate('rimsa')],
      edgeBeams: [
        beam('ok', 'rimsa', '0.9'),
        beam('zly', 'rimsa', '0.9 +'),
        beam('bez', 'nic', '1'),
      ],
    };
    const issues = edgeBeamChecks(withBeams, deck, spans);
    expect(issues.get('ok')).toEqual([]);
    // chyba parametra raz (body, ktoré naň odkazujú, hlási prierez — ako pri NK)
    const bad = issues.get('zly') ?? [];
    expect(bad.filter((i) => i.parameter === 'b')).toEqual([
      expect.objectContaining({
        code: 'ExpressionError',
        owner: { kind: 'edgeBeam', name: 'zly' },
      }),
    ]);
    expect(issues.get('bez')?.map((i) => i.code)).toEqual(['UnknownProfile']);
  });
});
