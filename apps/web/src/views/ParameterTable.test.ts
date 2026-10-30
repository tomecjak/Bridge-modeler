import { describe, expect, it } from 'vitest';
import { convertLaw } from './ParameterTable.tsx';

describe('convertLaw', () => {
  const range = { from: 1100, to: 1200 };

  it('keeps the expression text when switching kinds', () => {
    expect(convertLaw({ kind: 'constant', value: 'h0 + 0.2' }, 'expression', range)).toEqual({
      kind: 'expression',
      expr: 'h0 + 0.2',
    });
    expect(convertLaw({ kind: 'constant', value: '1.2' }, 'piecewise', range)).toEqual({
      kind: 'piecewise',
      segments: [{ from: 1100, to: 1200, v0: '1.2', v1: '1.2', shape: 'linear' }],
    });
    expect(
      convertLaw(
        { kind: 'piecewise', segments: [{ from: 0, to: 1, v0: 'a', v1: 'b', shape: 'linear' }] },
        'constant',
        range,
      ),
    ).toEqual({ kind: 'constant', value: 'a' });
  });
});
