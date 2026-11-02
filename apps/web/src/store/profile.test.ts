import { type DeckDrawingData, deckDrawingData } from '@bridge/drawing';
import { bridgeAxisLength, edgeBeamTemplate } from '@bridge/sections';
import { evaluateReference212 } from '@bridge/sections/testing';
import { describe, expect, it } from 'vitest';
import { buildProfileLine, profileAxisOptions } from './profile.ts';

const ref = evaluateReference212();
const axis = ref.p.bridgeAxes[0];
if (!axis) throw new Error('chýba os mosta');
const measure = bridgeAxisLength(axis, ref.alignment, ref.ctx.parameters);
const ctx = {
  ...ref.ctx,
  profiles: [...ref.ctx.profiles, edgeBeamTemplate('rimsa')],
  edgeBeams: [
    {
      id: 'rl',
      name: 'Rímsa vľavo',
      superstructure: ref.deck.id,
      side: 'left' as const,
      profile: 'rimsa',
      parameterLaws: {},
    },
  ],
};
const deck = deckDrawingData(ctx, ref.deck, ref.results, {}, ref.lines) as DeckDrawingData;
const src = { road: ref.alignment, deck, measure, others: [], planLines: [] };

describe('profile axes', () => {
  it('offers the bridge edge on the sides with an edge beam (ADR 0023)', () => {
    expect(profileAxisOptions(src).map((o) => o.value)).toEqual([
      'road',
      'bridgeAxis',
      'edge:left',
      'edge:right',
      'bridgeEdge:left',
    ]);
    expect(profileAxisOptions(src).at(-1)?.label).toBe(`Ľavý okraj mosta – ${deck.name}`);
  });

  it('runs the bridge edge line along the outer edge of the edge beam', () => {
    const line = buildProfileLine('bridgeEdge:left', src);
    expect(line.kind).toBe('bridgeEdge');
    expect(line.points[0]?.point).toEqual(deck.edgeBeams[0]?.outline.left[0]);
    // bez rímsy na pravej strane sa ponúkne predvolená os
    expect(buildProfileLine('bridgeEdge:right', src).kind).toBe('bridgeAxis');
  });
});
