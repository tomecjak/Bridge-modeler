import { describe, expect, it } from 'vitest';
import { evaluateLaw, lawIssues } from './laws.ts';
import type { StationFunction } from './types.ts';

const scope = (n: string) => ({ hv: 0.09 })[n];

describe('evaluateLaw', () => {
  it('evaluates a law over global parameters and the station', () => {
    const law: StationFunction = { kind: 'expression', expr: '-hv + 0.001 * (sta - 1000)' };
    expect(evaluateLaw(law, 'length', scope, 1010)).toEqual({ ok: true, value: -0.08 });
  });

  it('reports compile problems', () => {
    const law: StationFunction = { kind: 'constant', value: '1 +' };
    expect(evaluateLaw(law, 'length', scope, 0)).toMatchObject({
      ok: false,
      issue: { code: 'ExpressionError' },
    });
    expect(lawIssues(law, 'length')).toHaveLength(1);
  });
});
