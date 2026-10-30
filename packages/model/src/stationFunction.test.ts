import { describe, expect, it } from 'vitest';
import { compileStationFunction } from './stationFunction.ts';
import type { StationFunction } from './types.ts';

const scope = (name: string) => ({ h0: 1.0, h1: 1.6 })[name];

function compile(fn: StationFunction, unit: 'length' | 'angle' | 'slope' | 'none' = 'length') {
  const r = compileStationFunction(fn, unit);
  if (!r.ok) throw new Error(`compile failed: ${JSON.stringify(r.issues)}`);
  return r.fn;
}

function at(fn: ReturnType<typeof compile>, sta: number): number {
  const r = fn.at(sta, scope);
  if (!r.ok) throw new Error(`evaluation failed at ${sta}: ${JSON.stringify(r.issue)}`);
  return r.value;
}

const slope = (fn: ReturnType<typeof compile>, sta: number, h = 1e-5) =>
  (at(fn, sta + h) - at(fn, sta - h)) / (2 * h);

describe('constant and expression functions', () => {
  it('evaluates a constant expression', () => {
    expect(at(compile({ kind: 'constant', value: 'h0 + 0.35' }), 1234)).toBeCloseTo(1.35, 15);
  });

  it('exposes the display station as `sta`', () => {
    const fn = compile({ kind: 'expression', expr: 'h0 + 0.002 * (sta - 1200)' });
    expect(at(fn, 1250)).toBeCloseTo(1.1, 15);
  });
});

describe('piecewise — haunches', () => {
  // nábeh od podpery (1200, h1 = 1,6 m) k poľu (1215, h0 = 1,0 m), potom konštantne
  const haunch = (
    shape: 'linear' | 'parabolic' | 'circular',
    vertexAt?: 'start' | 'end',
  ): StationFunction => ({
    kind: 'piecewise',
    segments: [
      { from: 1200, to: 1215, v0: 'h1', v1: 'h0', shape, ...(vertexAt ? { vertexAt } : {}) },
      { from: 1215, to: 1260, v0: 'h0', v1: 'h0', shape: 'linear' },
    ],
  });

  it('linear haunch interpolates', () => {
    const fn = compile(haunch('linear'));
    expect(at(fn, 1200)).toBeCloseTo(1.6, 15);
    expect(at(fn, 1207.5)).toBeCloseTo(1.3, 15);
    expect(at(fn, 1240)).toBeCloseTo(1.0, 15);
  });

  it('parabolic haunch has correct values and tangents at both ends (vertex at end)', () => {
    const fn = compile(haunch('parabolic', 'end'));
    const L = 15;
    const dv = 1.0 - 1.6;
    expect(at(fn, 1200)).toBeCloseTo(1.6, 15);
    expect(at(fn, 1215)).toBeCloseTo(1.0, 15);
    // vrchol na konci: vodorovná dotyčnica → hladký prechod do konštantného úseku
    expect(slope(fn, 1215 - 1e-4)).toBeCloseTo(0, 4);
    // na začiatku: dv/dsta = 2·Δ / L
    expect(slope(fn, 1200 + 1e-4)).toBeCloseTo((2 * dv) / L, 4);
    // v strede: v0 + Δ·(1 − (1 − t)²) pri t = 0,5
    expect(at(fn, 1207.5)).toBeCloseTo(1.6 + dv * 0.75, 15);
  });

  it('parabolic haunch with vertex at start', () => {
    const fn = compile({
      kind: 'piecewise',
      segments: [{ from: 0, to: 10, v0: '1', v1: '2', shape: 'parabolic', vertexAt: 'start' }],
    });
    expect(slope(fn, 1e-4)).toBeCloseTo(0, 4);
    expect(slope(fn, 10 - 1e-4)).toBeCloseTo(0.2, 4);
    expect(at(fn, 5)).toBeCloseTo(1.25, 15);
  });

  it('circular haunch is tangent at the vertex and has radius (L² + Δ²) / 2|Δ|', () => {
    const fn = compile(haunch('circular', 'end'));
    const L = 15;
    const delta = 0.6;
    const R = (L * L + delta * delta) / (2 * delta);
    expect(at(fn, 1200)).toBeCloseTo(1.6, 12);
    expect(at(fn, 1215)).toBeCloseTo(1.0, 12);
    expect(slope(fn, 1215 - 1e-4)).toBeCloseTo(0, 4);
    // bod vo vzdialenosti d od vrcholu leží na kružnici: (R − (v − 1))² + d² = R²
    const d = 6;
    const v = at(fn, 1215 - d);
    expect((R - (v - 1.0)) ** 2 + d * d).toBeCloseTo(R * R, 9);
  });

  it('uses the later segment at a shared boundary', () => {
    const fn = compile({
      kind: 'piecewise',
      segments: [
        { from: 0, to: 10, v0: '0', v1: '1', shape: 'linear' },
        { from: 10, to: 20, v0: '5', v1: '5', shape: 'linear' },
      ],
    });
    expect(at(fn, 10)).toBe(5);
  });
});

describe('piecewise — validation', () => {
  const seg = (from: number, to: number) => ({
    from,
    to,
    v0: '1',
    v1: '1',
    shape: 'linear' as const,
  });

  it('reports gaps, overlaps and reversed segments', () => {
    const issues = (segments: ReturnType<typeof seg>[]) => {
      const r = compileStationFunction({ kind: 'piecewise', segments }, 'length');
      return r.ok ? [] : r.issues;
    };
    expect(issues([seg(0, 10), seg(12, 20)])).toMatchObject([{ code: 'SegmentGap', segment: 1 }]);
    expect(issues([seg(0, 10), seg(8, 20)])).toMatchObject([
      { code: 'SegmentOverlap', segment: 1 },
    ]);
    expect(issues([seg(10, 0)])).toMatchObject([{ code: 'SegmentOrder', segment: 0 }]);
    expect(issues([])).toMatchObject([{ code: 'EmptyPiecewise' }]);
  });

  it('requires a vertex for curved shapes and lengths for circular haunches', () => {
    const r1 = compileStationFunction(
      { kind: 'piecewise', segments: [{ from: 0, to: 1, v0: '1', v1: '2', shape: 'parabolic' }] },
      'length',
    );
    expect(r1.ok ? [] : r1.issues).toMatchObject([{ code: 'MissingVertex', segment: 0 }]);
    const r2 = compileStationFunction(
      {
        kind: 'piecewise',
        segments: [{ from: 0, to: 1, v0: '1', v1: '2', shape: 'circular', vertexAt: 'end' }],
      },
      'angle',
    );
    expect(r2.ok ? [] : r2.issues).toMatchObject([{ code: 'CircularShapeNotAllowed', segment: 0 }]);
  });

  it('reports syntax errors with field and segment', () => {
    const r = compileStationFunction(
      { kind: 'piecewise', segments: [{ from: 0, to: 1, v0: '1 +', v1: '2', shape: 'linear' }] },
      'length',
    );
    expect(r.ok ? [] : r.issues).toMatchObject([
      {
        code: 'ExpressionError',
        field: 'v0',
        segment: 0,
        expression: '1 +',
        error: { code: 'UnexpectedEnd' },
      },
    ]);
  });

  it('reports evaluation errors with the expression text', () => {
    const fn = compile({ kind: 'constant', value: 'h0 + chyba' });
    expect(fn.at(0, scope)).toMatchObject({
      ok: false,
      issue: {
        code: 'ExpressionError',
        field: 'value',
        expression: 'h0 + chyba',
        error: { code: 'UnknownIdentifier' },
      },
    });
  });

  it('reports stations outside the defined range', () => {
    const fn = compile({ kind: 'piecewise', segments: [seg(0, 10)] });
    expect(fn.at(10.5, scope)).toMatchObject({
      ok: false,
      issue: { code: 'StationOutsideFunction', from: 0, to: 10 },
    });
  });

  it('lists referenced names except `sta`', () => {
    const fn = compile({ kind: 'expression', expr: 'h0 + sta * k' });
    expect([...fn.references].sort()).toEqual(['h0', 'k']);
    expect(fn.usesStation).toBe(true);
    expect(compile({ kind: 'constant', value: 'h0' }).usesStation).toBe(false);
  });
});
