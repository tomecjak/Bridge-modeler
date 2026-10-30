import { singleBeamHaunched } from '@bridge/sections';
import { describe, expect, it } from 'vitest';
import { parsePointList, renameProfileParameter, renameProfilePoint } from './profileEdit.ts';

describe('profile editing helpers', () => {
  const def = singleBeamHaunched('p');

  it('renames a profile parameter in defaults and point expressions', () => {
    const r = renameProfileParameter(def, 'bw', 'bSpodok');
    expect(r.parameters.map((p) => p.name)).toContain('bSpodok');
    expect(r.points.find((p) => p.name === 'BL')?.x).toBe('-bSpodok / 2');
  });

  it('renames a point with its coordinate references, loops and reference point', () => {
    const r = renameProfilePoint(def, 'TL', 'HL');
    expect(r.points.find((p) => p.name === 'EL')).toEqual({
      name: 'EL',
      x: 'HL_x',
      y: 'HL_y - tEnd',
    });
    expect(r.loops[0]?.points[0]).toBe('HL');
    expect(renameProfilePoint(def, 'R', 'Ref').referencePoint).toBe('Ref');
  });

  it('parses point lists', () => {
    expect(parsePointList('A B,C;  D')).toEqual(['A', 'B', 'C', 'D']);
  });
});
