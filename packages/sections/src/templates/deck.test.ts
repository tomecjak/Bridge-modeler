import { createAlignment, suggestOrigin } from '@bridge/alignment';
import { syntheticAlignmentData } from '@bridge/alignment/testing';
import { buildParameterSet } from '@bridge/model';
import { describe, expect, it } from 'vitest';
import { evaluateSuperstructure } from '../superstructure.ts';
import { PROFILE_TEMPLATES } from './catalog.ts';
import { deckFromProfile } from './deck.ts';

const data = syntheticAlignmentData(undefined, 1000);
const { alignment } = createAlignment(data, suggestOrigin(data));

describe('deckFromProfile', () => {
  it('places a deck with any template on its own bridge axis without issues', () => {
    for (const t of PROFILE_TEMPLATES) {
      const profile = t.create('pr');
      const { bridgeAxis, superstructure } = deckFromProfile(data.name, 1150, 1050, 'pr', {
        deck: 'nk',
        axis: 'ax',
      });
      expect(superstructure).toMatchObject({
        from: 1050,
        to: 1150,
        profile: 'pr',
        bridgeAxis: 'ax',
      });
      const ctx = {
        alignments: new Map([[data.name, alignment]]),
        parameters: buildParameterSet([]),
        bridgeAxes: [bridgeAxis],
        profiles: [profile],
        planLines: [],
      };
      const section = evaluateSuperstructure(ctx, superstructure, 100);
      expect(section.issues, t.name).toEqual([]);
      expect(section.loops.length, t.name).toBeGreaterThan(0);
      // horný povrch v osi mosta leží hrúbku vozovky pod niveletou
      expect(section.axis?.point.z, t.name).toBeCloseTo(alignment.elevation(100).z - 0.09, 9);
    }
  });

  it('shifts the bridge axis sideways and keeps the given names', () => {
    const { bridgeAxis, superstructure } = deckFromProfile(
      data.name,
      1000,
      1100,
      'pr',
      { deck: 'nk2', axis: 'ax2' },
      { deck: 'Pravá NK', axis: 'Os pravej NK' },
      7,
    );
    expect(bridgeAxis.horizontalOffset).toEqual({ kind: 'constant', value: '7' });
    expect(bridgeAxis.name).toBe('Os pravej NK');
    expect(superstructure.name).toBe('Pravá NK');
  });
});
