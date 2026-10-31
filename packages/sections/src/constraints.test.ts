import { vec2 } from '@bridge/geom';
import type { ProfileDefinition, ProfilePoint } from '@bridge/model';
import { describe, expect, it } from 'vitest';
import {
  constrainPoint,
  constraintExpressions,
  dragPoint,
  drivingIdentifiers,
  type PointConstraint,
  recognizeConstraint,
} from './constraints.ts';
import { evaluateProfileDefinition } from './profile.ts';

/** Prierez s referenčným bodom R mimo počiatku (literály sú v pôvodných súradniciach, nie posunutých). */
const base: ProfilePoint[] = [
  { name: 'R', x: '1', y: '2' },
  { name: 'A', x: '3', y: '2' },
  { name: 'B', x: '5', y: '1' },
  { name: 'C', x: '3', y: '0' },
  { name: 'D', x: '6', y: '3' },
];
const evaluatePoints = (extra: ProfilePoint[]) => {
  const def: ProfileDefinition = {
    id: 'p',
    name: 'p',
    parameters: [{ name: 'bw', unit: 'length', default: '4' }],
    points: [...base, ...extra],
    loops: [],
    referencePoint: 'R',
  };
  return evaluateProfileDefinition(def, new Map([['bw', 4]]), () => undefined, 0);
};
const positionOf = (p: ProfilePoint) => {
  const r = evaluatePoints([p]);
  expect(r.issues.filter((i) => i.code !== 'MissingOuterLoop')).toEqual([]);
  return r.points.get(p.name);
};

describe('constraintExpressions / recognizeConstraint', () => {
  const cases: [PointConstraint, string, string][] = [
    [{ kind: 'fixed', x: 1.25, y: -0.5 }, '1.25', '-0.5'],
    [{ kind: 'offset', ref: 'A', dx: -0.5, dy: 0.25 }, 'A_x - 0.5', 'A_y + 0.25'],
    [{ kind: 'offset', ref: 'A', dx: 0, dy: 0 }, 'A_x', 'A_y'],
    [{ kind: 'below', ref: 'A', y: -1.2 }, 'A_x', '-1.2'],
    [{ kind: 'level', ref: 'A', x: 4 }, '4', 'A_y'],
    [{ kind: 'slope', ref: 'A', slope: -0.2, x: 4.5 }, '4.5', 'A_y - 0.2 * (4.5 - A_x)'],
    [{ kind: 'onLine', a: 'A', b: 'B', x: 4 }, '4', 'A_y + (B_y - A_y) * (4 - A_x) / (B_x - A_x)'],
    [{ kind: 'mirror', ref: 'B' }, '-B_x', 'B_y'],
  ];

  it.each(cases)('writes %j canonically and recognizes it back', (c, x, y) => {
    expect(constraintExpressions(c)).toEqual({ x, y });
    expect(recognizeConstraint({ x, y })).toEqual(c);
    // medzery a ich absencia nevadia
    expect(recognizeConstraint({ x: x.replace(/ /g, ''), y: `  ${y}` })).toEqual(c);
  });

  it('recognizes the intersection of two lines', () => {
    const c: PointConstraint = { kind: 'intersection', a: 'A', b: 'B', c: 'C', d: 'D' };
    expect(recognizeConstraint(constraintExpressions(c))).toEqual(c);
  });

  it('leaves parametric and mixed expressions unrecognized', () => {
    expect(recognizeConstraint({ x: '-bw / 2', y: '-h' })).toBeUndefined();
    expect(recognizeConstraint({ x: 'A_x + 1', y: 'B_y' })).toBeUndefined();
    expect(recognizeConstraint({ x: '4', y: 'A_y - 0.2 * (4.5 - A_x)' })).toBeUndefined();
  });
});

describe('drivingIdentifiers', () => {
  it('lists parameters and point coordinates an expression depends on, without functions', () => {
    expect(drivingIdentifiers('-bw / 2 + TL_x * cos(q)')).toEqual(['bw', 'TL_x', 'q']);
    expect(drivingIdentifiers('1 +')).toEqual([]);
  });
});

describe('constrainPoint', () => {
  it('keeps the current position where the constraint allows it', () => {
    const r = evaluatePoints([{ name: 'P', x: '4', y: '1.5' }]);
    const origin = r.origin;
    const at = r.points.get('P') ?? vec2(0, 0);
    for (const c of [
      { kind: 'fixed' } as const,
      { kind: 'offset', ref: 'A' } as const,
      { kind: 'slope', ref: 'A' } as const,
    ]) {
      const p = { name: 'P', ...constrainPoint(c, at, r.points, origin) };
      const q = positionOf(p);
      expect(q?.x).toBeCloseTo(at.x, 9);
      expect(q?.y).toBeCloseTo(at.y, 9);
    }
    // zvislo pod A: x = A_x, výška ostane
    const below = positionOf({
      name: 'P',
      ...constrainPoint({ kind: 'below', ref: 'A' }, at, r.points, origin),
    });
    expect(below?.x).toBeCloseTo(r.points.get('A')?.x ?? 0, 9);
    expect(below?.y).toBeCloseTo(at.y, 9);
    // na priamke AB pri rovnakom x
    const on = positionOf({
      name: 'P',
      ...constrainPoint({ kind: 'onLine', a: 'A', b: 'B' }, at, r.points, origin),
    });
    expect(on?.x).toBeCloseTo(at.x, 9);
    expect(on?.y).toBeCloseTo(-0.5, 9); // A (2, 0), B (4, −1) v posunutých súradniciach
  });
});

describe('dragPoint', () => {
  const move = (p: ProfilePoint, dx: number, dy: number) => {
    const from = positionOf(p) ?? vec2(0, 0);
    const next = dragPoint(p, vec2(from.x + dx, from.y + dy), from);
    return { next, from, to: next && positionOf({ name: p.name, ...next }) };
  };

  it('moves a fixed point by the drag, rounded to millimetres', () => {
    const { next, to, from } = move({ name: 'P', x: '4', y: '1.5' }, 0.12345, -0.3);
    expect(next).toEqual({ x: '4.123', y: '1.2' });
    expect(to?.x).toBeCloseTo(from.x + 0.123, 9);
  });

  it('changes only the free values of constrained points', () => {
    expect(move({ name: 'P', x: 'A_x - 0.5', y: 'A_y + 0.25' }, 0.2, 0.1).next).toEqual({
      x: 'A_x - 0.3',
      y: 'A_y + 0.35',
    });
    expect(move({ name: 'P', x: 'A_x', y: '-1.2' }, 0.7, 0.2).next).toEqual({
      x: 'A_x',
      y: '-1',
    });
    expect(move({ name: 'P', x: '4', y: 'A_y' }, 0.5, 3).next).toEqual({ x: '4.5', y: 'A_y' });
    const slope = move({ name: 'P', x: '4.5', y: 'A_y - 0.2 * (4.5 - A_x)' }, 1, 5);
    expect(slope.next).toEqual({ x: '5.5', y: 'A_y - 0.2 * (5.5 - A_x)' });
    expect((slope.to?.y ?? 0) - slope.from.y).toBeCloseTo(-0.2, 9);
  });

  it('locks parametric, mirrored and intersection points', () => {
    const from = vec2(0, 0);
    expect(dragPoint({ x: '-bw / 2', y: '0' }, vec2(1, 1), from)).toBeUndefined();
    expect(dragPoint({ x: '-B_x', y: 'B_y' }, vec2(1, 1), from)).toBeUndefined();
    const cross = constraintExpressions({ kind: 'intersection', a: 'A', b: 'B', c: 'C', d: 'D' });
    expect(dragPoint(cross, vec2(1, 1), from)).toBeUndefined();
  });
});
