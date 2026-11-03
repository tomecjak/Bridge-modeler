import { createEmptyProject, type Parameter } from '@bridge/model';
import { describe, expect, it } from 'vitest';
import { issuesOf, nextParameterName, parameterLawCommand } from './parameters.ts';

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

  it('changes the override of the active variant, otherwise the shared law', () => {
    const project = createEmptyProject('Most');
    const law = { kind: 'constant' as const, value: '2' };
    expect(parameterLawCommand(project, 'p1', law)).toEqual({
      type: 'updateParameter',
      id: 'p1',
      changes: { law },
    });
    (project.variants[0] as (typeof project.variants)[number]).parameters.p1 = law;
    expect(parameterLawCommand(project, 'p1', law)).toEqual({
      type: 'setParameterOverride',
      id: 'p1',
      law,
    });
  });
});
