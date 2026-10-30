import { createAlignment, suggestOrigin } from '@bridge/alignment';
import { syntheticAlignmentData } from '@bridge/alignment/testing';
import { buildParameterSet, type ProfileDefinition, type Superstructure } from '@bridge/model';
import { describe, expect, it } from 'vitest';
import { evaluateSuperstructure, type SectionContext } from './superstructure.ts';

const data = syntheticAlignmentData(undefined, 1000);
const { alignment } = createAlignment(data, suggestOrigin(data));

const profile: ProfileDefinition = {
  id: 'p',
  name: 'Doska',
  parameters: [
    { name: 'b', unit: 'length', default: '10' },
    { name: 'h', unit: 'length', default: 'hNK' },
  ],
  points: [
    { name: 'R', x: '0', y: '0' },
    { name: 'A', x: '-b / 2', y: '0' },
    { name: 'B', x: '-b / 2', y: '-h' },
    { name: 'C', x: 'b / 2', y: '-h' },
    { name: 'D', x: 'b / 2', y: '0' },
  ],
  loops: [{ name: 'obrys', role: 'outer', points: ['A', 'B', 'C', 'D'] }],
  referencePoint: 'R',
};

const ctx: SectionContext = {
  alignments: new Map([[data.name, alignment]]),
  parameters: buildParameterSet([
    { id: 'g', name: 'hNK', unit: 'length', law: { kind: 'constant', value: '1.2' } },
  ]),
  bridgeAxes: [
    {
      id: 'ax',
      name: 'Os ľavej NK',
      alignment: data.name,
      horizontalOffset: { kind: 'constant', value: '-7.75' },
      verticalOffset: { kind: 'constant', value: '-0.09' },
    },
  ],
  profiles: [profile],
};

const sup = (orientation: Superstructure['orientation']): Superstructure => ({
  id: 'nk',
  name: 'Ľavá NK',
  bridgeAxis: 'ax',
  from: 1050,
  to: 1300,
  profile: 'p',
  parameterLaws: { b: { kind: 'expression', expr: '10 + (sta - 1100) / 100' } },
  orientation,
});

describe('evaluateSuperstructure', () => {
  it('places the reference point on the bridge axis (offset from the road axis)', () => {
    const s = 100;
    const r = evaluateSuperstructure(ctx, sup('vertical'), s);
    expect(r.issues).toEqual([]);
    const road = alignment.evaluate(s);
    const ref = r.toWorld({ x: 0, y: 0 });
    expect(ref.x).toBeCloseTo(road.point.x - 7.75 * road.frame.normal.x, 9);
    expect(ref.y).toBeCloseTo(road.point.y - 7.75 * road.frame.normal.y, 9);
    expect(ref.z).toBeCloseTo(road.point.z - 0.09, 12);
  });

  it('evaluates profile parameters from laws and globals at the display station', () => {
    const r = evaluateSuperstructure(ctx, sup('vertical'), 150); // sta = 1150 → b = 10,5
    expect(r.station).toBe(1150);
    expect(r.area).toBeCloseTo(10.5 * 1.2, 12);
  });

  it('keeps section heights vertical for the vertical orientation', () => {
    const r = evaluateSuperstructure(ctx, sup('vertical'), 100);
    const top = r.toWorld({ x: 0, y: 0 });
    const bottom = r.toWorld({ x: 0, y: -1.2 });
    expect(top.x - bottom.x).toBeCloseTo(0, 12);
    expect(top.z - bottom.z).toBeCloseTo(1.2, 12);
  });

  it('tilts the section perpendicular to the grade for normalToGrade', () => {
    const s = 60; // sta 1060: v rozsahu NK, na prvej tangente nivelety (sklon 2 %)
    const r = evaluateSuperstructure(ctx, sup('normalToGrade'), s);
    expect(r.issues).toEqual([]);
    const top = r.toWorld({ x: 0, y: 0 });
    const bottom = r.toWorld({ x: 0, y: -1 });
    const d = { x: top.x - bottom.x, y: top.y - bottom.y, z: top.z - bottom.z };
    const t = alignment.evaluate(s).frame.tangent;
    expect(d.x * t.x + d.y * t.y + d.z * t.z).toBeCloseTo(0, 12);
    expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 12);
  });

  it('reports stations outside the superstructure and broken references', () => {
    expect(evaluateSuperstructure(ctx, sup('vertical'), 10).issues).toMatchObject([
      {
        code: 'StationOutsideSuperstructure',
        from: 1050,
        to: 1300,
        owner: { kind: 'superstructure' },
      },
    ]);
    expect(
      evaluateSuperstructure(ctx, { ...sup('vertical'), profile: 'x' }, 100).issues,
    ).toMatchObject([{ code: 'UnknownProfile', id: 'x' }]);
    expect(
      evaluateSuperstructure(ctx, { ...sup('vertical'), bridgeAxis: 'x' }, 100).issues,
    ).toMatchObject([{ code: 'UnknownBridgeAxis', id: 'x' }]);
  });
});
