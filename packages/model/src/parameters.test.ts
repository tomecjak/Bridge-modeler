import { createStationing } from '@bridge/alignment';
import { describe, expect, it } from 'vitest';
import { buildParameterSet, toModelValue, validateStations } from './parameters.ts';
import type { Parameter, StationFunction } from './types.ts';

let nextId = 0;
const p = (
  name: string,
  law: StationFunction | string,
  unit: Parameter['unit'] = 'length',
): Parameter => ({
  id: `p${nextId++}`,
  name,
  unit,
  law: typeof law === 'string' ? { kind: 'constant', value: law } : law,
});

describe('buildParameterSet — dependencies', () => {
  it('evaluates parameters in dependency order regardless of definition order', () => {
    const set = buildParameterSet([p('h', 'h0 + t'), p('t', '0.35'), p('h0', '1.2')]);
    expect(set.issues).toEqual([]);
    expect(set.order.indexOf('h0')).toBeLessThan(set.order.indexOf('h'));
    const h = set.value('h', 0);
    expect(h.ok && h.value).toBeCloseTo(1.55, 15);
  });

  it('reports a cycle with a readable path', () => {
    const set = buildParameterSet([
      p('h', 'b + 1'),
      p('b', 'c * 2'),
      p('c', 'h / 3'),
      p('ok', '1'),
    ]);
    const cycle = set.issues.find((i) => i.code === 'Cycle');
    expect(cycle).toMatchObject({ code: 'Cycle', path: ['h', 'b', 'c', 'h'] });
    expect(set.value('ok', 0)).toEqual({ ok: true, value: 1 });
    expect(set.value('h', 0).ok).toBe(false);
  });

  it('reports self references as cycles', () => {
    const set = buildParameterSet([p('h', 'h + 1')]);
    expect(set.issues).toMatchObject([{ code: 'Cycle', path: ['h', 'h'] }]);
  });

  it('reports unknown references and propagates invalid dependencies', () => {
    const set = buildParameterSet([p('a', 'chyba + 1'), p('b', 'a * 2')]);
    expect(set.issues).toEqual([
      { code: 'UnknownReference', parameter: 'a', name: 'chyba' },
      { code: 'DependsOnInvalid', parameter: 'b', dependency: 'a' },
    ]);
  });

  it('validates names', () => {
    const set = buildParameterSet([
      p('h', '1'),
      p('h', '2'),
      p('2x', '1'),
      p('sta', '1'),
      p('sin', '1'),
    ]);
    expect(set.issues).toMatchObject([
      { code: 'DuplicateParameterName', name: 'h' },
      { code: 'InvalidParameterName', name: '2x' },
      { code: 'InvalidParameterName', name: 'sta' },
      { code: 'InvalidParameterName', name: 'sin' },
    ]);
  });
});

describe('buildParameterSet — station dependence', () => {
  const haunch: StationFunction = {
    kind: 'piecewise',
    segments: [
      { from: 1200, to: 1215, v0: 'h1', v1: 'h0', shape: 'parabolic', vertexAt: 'end' },
      { from: 1215, to: 1260, v0: 'h0', v1: 'h0', shape: 'linear' },
    ],
  };

  it('distinguishes station-dependent parameters (directly and through dependencies)', () => {
    const set = buildParameterSet([
      p('h0', '1'),
      p('h1', '1.6'),
      p('h', haunch),
      p('hSpodok', 'h + 0.2'),
      p('b', '14.35'),
    ]);
    expect([...set.stationDependent].sort()).toEqual(['h', 'hSpodok']);
    const at = set.evaluateAt(1207.5);
    expect(at.issues).toEqual([]);
    expect(at.values.get('hSpodok')).toBeCloseTo(1.6 - 0.6 * 0.75 + 0.2, 12);
    expect(at.values.get('b')).toBe(14.35);
  });

  it('reports runtime problems per parameter and for dependants', () => {
    const set = buildParameterSet([p('h0', '1'), p('h1', '1.6'), p('h', haunch), p('x', 'h * 2')]);
    const at = set.evaluateAt(1300);
    expect(at.issues).toMatchObject([
      { code: 'StationOutsideFunction', parameter: 'h' },
      { code: 'DependsOnInvalid', parameter: 'x', dependency: 'h' },
    ]);
    expect(at.values.has('h0')).toBe(true);
  });

  it('evaluates station-independent parameters only once', () => {
    let calls = 0;
    const set = buildParameterSet(
      [p('a', '2'), p('b', { kind: 'expression', expr: 'a * sta' })],
      () => calls++,
    );
    set.evaluateAt(1);
    set.evaluateAt(2);
    set.evaluateAt(3);
    // `a` raz, `b` trikrát
    expect(calls).toBe(4);
  });
});

describe('toModelValue', () => {
  it('converts angles from degrees to radians, keeps other units', () => {
    expect(toModelValue('angle', 180)).toBe(Math.PI);
    expect(toModelValue('length', 1.2)).toBe(1.2);
    expect(toModelValue('slope', 0.025)).toBe(0.025);
  });
});

describe('validateStations', () => {
  it('reports segment bounds inside a station equation gap or overlap', () => {
    const stationing = createStationing(1000, 500, [
      { staInternal: 1100, staBack: 1100, staAhead: 1150 },
      { staInternal: 1300, staBack: 1350, staAhead: 1330 },
    ]);
    const law: StationFunction = {
      kind: 'piecewise',
      segments: [
        { from: 1050, to: 1120, v0: '1', v1: '1', shape: 'linear' },
        { from: 1120, to: 1340, v0: '1', v1: '1', shape: 'linear' },
      ],
    };
    expect(validateStations([p('h', law)], stationing)).toEqual([
      { code: 'StationNotOnAlignment', parameter: 'h', station: 1120 },
      { code: 'AmbiguousStation', parameter: 'h', station: 1340 },
    ]);
  });
});
