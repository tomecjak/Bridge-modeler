import { CROSSBEAM_TYPOLOGY, EDGE_BEAM_TYPOLOGY } from '@bridge/sections';
import { describe, expect, it } from 'vitest';
import { freeSides, isDeckProfile, isEdgeBeamProfile, newEdgeBeams } from './edgeBeams.ts';

describe('edge beams in the app', () => {
  it('tells deck profiles from crossbeams and edge beams', () => {
    expect(isDeckProfile({ typology: 'slab' })).toBe(true);
    expect(isDeckProfile({ typology: undefined })).toBe(true);
    expect(isDeckProfile({ typology: CROSSBEAM_TYPOLOGY })).toBe(false);
    expect(isDeckProfile({ typology: EDGE_BEAM_TYPOLOGY })).toBe(false);
    expect(isEdgeBeamProfile({ typology: EDGE_BEAM_TYPOLOGY })).toBe(true);
  });

  it('offers only the deck sides without an edge beam', () => {
    const beams = [
      { superstructure: 'nk', side: 'left' as const },
      { superstructure: 'nk2', side: 'right' as const },
    ];
    expect(freeSides(beams, 'nk')).toEqual(['right']);
    expect(freeSides(beams, 'nk3')).toEqual(['left', 'right']);
  });

  it('creates named edge beams with the default profile parameters', () => {
    let n = 0;
    const beams = newEdgeBeams('nk', ['left', 'right'], 'rimsa', (p) => `${p}-${++n}`);
    expect(beams).toEqual([
      {
        id: 'rim-1',
        name: 'Rímsa vľavo',
        superstructure: 'nk',
        side: 'left',
        profile: 'rimsa',
        parameterLaws: {},
      },
      {
        id: 'rim-2',
        name: 'Rímsa vpravo',
        superstructure: 'nk',
        side: 'right',
        profile: 'rimsa',
        parameterLaws: {},
      },
    ]);
  });
});
