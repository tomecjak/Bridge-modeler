import { slab } from '@bridge/sections';
import { describe, expect, it } from 'vitest';
import {
  addLoop,
  addPoint,
  nextPointName,
  removePoint,
  SNAP_GRID,
  setPointExpressions,
  snapPoint,
} from './profileSketch.ts';

describe('snapPoint', () => {
  it('aligns with a nearby point within 6 px, otherwise rounds to the 10 mm grid', () => {
    // mierka 100 px/m → 6 px = 0,06 m
    const others = [
      { x: 1, y: -0.5 },
      { x: 3, y: 2 },
    ];
    expect(snapPoint({ x: 1.04, y: 0.123 }, others, 100)).toEqual({
      point: { x: 1, y: 0.12 },
      guides: { x: 1 },
    });
    const free = snapPoint({ x: 2.2345, y: 1.0049 }, others, 100);
    expect(free.guides).toEqual({});
    expect(free.point.x / SNAP_GRID).toBeCloseTo(223, 9);
    expect(free.point.y).toBeCloseTo(1, 9);
    expect(snapPoint({ x: 2.97, y: -0.47 }, others, 100).guides).toEqual({ x: 3, y: -0.5 });
  });
});

describe('profile sketch edits', () => {
  const def = slab('p');

  it('adds a point with a free name and changes its expressions', () => {
    const name = nextPointName(def);
    expect(name).toBe('P1');
    const added = addPoint(def, name, { x: '1', y: '-0.5' });
    expect(added.points.at(-1)).toEqual({ name: 'P1', x: '1', y: '-0.5' });
    expect(nextPointName(added)).toBe('P2');
    expect(setPointExpressions(added, 'P1', { x: 'BL_x', y: '-0.5' }).points.at(-1)?.x).toBe(
      'BL_x',
    );
  });

  it('removes a point from loops, drops loops left with fewer than 3 points and keeps the reference point', () => {
    const withVoid = addLoop(def, ['TL', 'EL', 'BL'], 'void');
    const removed = removePoint(withVoid, 'EL');
    expect(removed.points.some((p) => p.name === 'EL')).toBe(false);
    expect(removed.loops.map((l) => [l.name, l.points])).toEqual([
      ['obrys', ['TL', 'BL', 'BR', 'ER', 'TR']],
    ]);
    expect(removePoint(def, 'R')).toBe(def);
  });

  it('names new loops uniquely by role', () => {
    const a = addLoop(def, ['TL', 'EL', 'BL'], 'void');
    const b = addLoop(a, ['TR', 'ER', 'BR'], 'void');
    expect(b.loops.map((l) => l.name)).toEqual(['obrys', 'dutina', 'dutina 2']);
    expect(addLoop(def, ['TL', 'EL', 'BL'], 'outer').loops.at(-1)?.name).toBe('obrys 2');
  });
});
