import { describe, expect, it } from 'vitest';
import { renameParameter } from './rename.ts';
import type { Parameter } from './types.ts';

const params: Parameter[] = [
  { id: '1', name: 'h0', unit: 'length', law: { kind: 'constant', value: '1.0' } },
  { id: '2', name: 'h1', unit: 'length', law: { kind: 'constant', value: 'h0 + 0.6' } },
  {
    id: '3',
    name: 'h',
    unit: 'length',
    law: {
      kind: 'piecewise',
      segments: [{ from: 0, to: 10, v0: 'h1', v1: 'h0', shape: 'linear' }],
    },
  },
  { id: '4', name: 's', unit: 'none', law: { kind: 'expression', expr: 'h0 * sta' } },
];

describe('renameParameter', () => {
  it('renames the parameter and rewrites all references', () => {
    const r = renameParameter(params, '1', 'hNK');
    expect(r.map((p) => p.name)).toEqual(['hNK', 'h1', 'h', 's']);
    expect(r[1]?.law).toEqual({ kind: 'constant', value: 'hNK + 0.6' });
    expect(r[2]?.law).toMatchObject({ segments: [{ v0: 'h1', v1: 'hNK' }] });
    expect(r[3]?.law).toEqual({ kind: 'expression', expr: 'hNK * sta' });
  });
});
