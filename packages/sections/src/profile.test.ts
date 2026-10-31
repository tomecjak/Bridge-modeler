import type { ProfileDefinition } from '@bridge/model';
import { describe, expect, it } from 'vitest';
import { evaluateProfileDefinition, profileParameterValues } from './profile.ts';

const globals = (name: string) => ({ hv: 0.09 })[name];

/** Obdĺžnik s dutinou; referenčný bod v strede hornej hrany. */
const box: ProfileDefinition = {
  id: 'box',
  name: 'Box',
  parameters: [
    { name: 'b', unit: 'length', default: '4' },
    { name: 'h', unit: 'length', default: 'b / 2' },
    { name: 't', unit: 'length', default: '0.5' },
  ],
  points: [
    { name: 'T', x: '0', y: '0' },
    { name: 'TL', x: '-b / 2', y: '0' },
    { name: 'BL', x: 'TL_x', y: '-h' },
    { name: 'BR', x: 'b / 2', y: 'BL_y' },
    { name: 'TR', x: 'BR_x', y: '0' },
    { name: 'V1', x: 'TL_x + t', y: '-t' },
    { name: 'V2', x: 'V1_x', y: '-h + t' },
    { name: 'V3', x: 'TR_x - t', y: 'V2_y' },
    { name: 'V4', x: 'V3_x', y: 'V1_y' },
  ],
  loops: [
    { name: 'obrys', role: 'outer', points: ['TL', 'BL', 'BR', 'TR'] },
    { name: 'dutina', role: 'void', points: ['V1', 'V4', 'V3', 'V2'] },
  ],
  referencePoint: 'T',
};

function evaluate(def: ProfileDefinition, overrides: Record<string, number> = {}) {
  const values = profileParameterValues(def, {}, globals, 0);
  expect(values.issues).toEqual([]);
  for (const [k, v] of Object.entries(overrides)) values.values.set(k, v);
  return evaluateProfileDefinition(def, values.values, globals, 0);
}

describe('profileParameterValues', () => {
  it('evaluates defaults in order and lets laws override them', () => {
    const r = profileParameterValues(
      box,
      { b: { kind: 'expression', expr: '4 + sta / 100' } },
      globals,
      50,
    );
    expect(r.values.get('b')).toBeCloseTo(4.5, 15);
    expect(r.values.get('h')).toBeCloseTo(2.25, 15);
  });

  it('takes an edge law from the resolver plus the allowance, with typed errors', () => {
    const law = {
      kind: 'edge' as const,
      curve: { type: 'alignment' as const, name: '125_L' },
      side: 'left' as const,
      add: 'hv + sta / 1000',
    };
    const r = profileParameterValues(box, { b: law }, globals, 10, () => ({ ok: true, value: 3 }));
    expect(r.issues).toEqual([]);
    expect(r.values.get('b')).toBeCloseTo(3.1, 12);
    expect(r.values.get('h')).toBeCloseTo(1.55, 12);
    // nasledujúci parameter h = b / 2 hlási neznáme b — ako pri každom nevyhodnotiteľnom parametri
    expect(profileParameterValues(box, { b: law }, globals, 10).issues[0]).toMatchObject({
      code: 'EdgeCurveNotFound',
      curve: '125_L',
      parameter: 'b',
    });
    const unreached = profileParameterValues(box, { b: law }, globals, 10, () => ({
      ok: false,
      issue: { code: 'EdgeCurveNotReached', curve: '125_L', station: 10 },
    }));
    expect(unreached.values.has('b')).toBe(false);
    expect(unreached.issues[0]).toMatchObject({ code: 'EdgeCurveNotReached', parameter: 'b' });
  });

  it('reports laws for unknown parameters', () => {
    const r = profileParameterValues(box, { x: { kind: 'constant', value: '1' } }, globals, 0);
    expect(r.issues).toMatchObject([{ code: 'UnknownProfileParameter', name: 'x' }]);
  });
});

describe('evaluateProfileDefinition', () => {
  it('evaluates points with references to earlier points, relative to the reference point', () => {
    const r = evaluate(box);
    expect(r.issues).toEqual([]);
    expect(r.points.get('BR')).toEqual({ x: 2, y: -2 });
    expect(r.loops.map((l) => l.role)).toEqual(['outer', 'void']);
    expect(r.area).toBeCloseTo(4 * 2 - 3 * 1, 12);
    expect(r.centroid.x).toBeCloseTo(0, 12);
    expect(r.centroid.y).toBeCloseTo(-1, 12);
  });

  it('normalizes orientation (outer CCW, void CW) and warns', () => {
    const reversed = {
      ...box,
      loops: [{ name: 'obrys', role: 'outer' as const, points: ['TL', 'TR', 'BR', 'BL'] }],
    };
    const r = evaluate(reversed);
    expect(r.issues).toMatchObject([{ code: 'LoopReversed', loop: 'obrys', severity: 'warning' }]);
    expect(r.area).toBeCloseTo(8, 12);
  });

  it('reports forward point references and unknown points', () => {
    const bad: ProfileDefinition = {
      ...box,
      points: [{ name: 'A', x: 'BL_x', y: '0' }, ...box.points],
      loops: [{ name: 'obrys', role: 'outer', points: ['TL', 'BL', 'XX', 'TR'] }],
    };
    const r = evaluate(bad);
    expect(r.issues).toMatchObject([
      { code: 'ForwardPointReference', point: 'A', reference: 'BL_x' },
      { code: 'UnknownPoint', loop: 'obrys', name: 'XX' },
    ]);
  });

  it('reports self-intersections, open loops and voids outside the outer loop', () => {
    const r = evaluate({
      ...box,
      loops: [
        { name: 'obrys', role: 'outer', points: ['TL', 'BR', 'BL', 'TR'] },
        { name: 'čiara', role: 'void', points: ['V1', 'V2'] },
      ],
    });
    expect(r.issues.map((i) => i.code)).toEqual(['SelfIntersection', 'OpenLoop']);
    const outside = evaluate(box, { t: -0.5 });
    expect(outside.issues.map((i) => i.code)).toContain('VoidOutsideOuter');
  });

  it('reports missing outer loop and unknown reference point', () => {
    const r = evaluate({
      ...box,
      loops: [box.loops[1] as ProfileDefinition['loops'][number]],
      referencePoint: 'Q',
    });
    expect(r.issues.map((i) => i.code)).toEqual([
      'UnknownReferencePoint',
      'MissingOuterLoop',
      'VoidOutsideOuter',
    ]);
  });

  it('reports duplicate point names', () => {
    const r = evaluate({ ...box, points: [...box.points, { name: 'T', x: '1', y: '1' }] });
    expect(r.issues).toMatchObject([{ code: 'DuplicatePointName', name: 'T' }]);
  });
});
