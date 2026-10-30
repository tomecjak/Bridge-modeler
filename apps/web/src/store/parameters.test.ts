import type { Parameter } from '@bridge/model';
import { describe, expect, it } from 'vitest';
import { issuesOf, nextParameterName } from './parameters.ts';

const p = (name: string): Parameter => ({
  id: name,
  name,
  unit: 'none',
  law: { kind: 'constant', value: '1' },
});

describe('parameter helpers', () => {
  it('finds the first free default name', () => {
    expect(nextParameterName([p('p1'), p('p3')])).toBe('p2');
  });

  it('assigns cycle issues to every parameter in the cycle', () => {
    const issues = [{ code: 'Cycle' as const, path: ['a', 'b', 'a'] }];
    expect(issuesOf(issues, 'b')).toHaveLength(1);
    expect(issuesOf(issues, 'c')).toHaveLength(0);
  });
});
