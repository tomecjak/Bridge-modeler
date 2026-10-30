import { describe, expect, it } from 'vitest';
import { defaultGeometry, defaultSupport } from './supports.ts';

describe('support defaults', () => {
  it('puts the foundation 8 m below the soffit for piers and 5 m for abutments', () => {
    expect(defaultSupport('a', 'P1', 'pier', 'nk', 1100, 251.234).foundationTop).toBe('243.2');
    expect(defaultSupport('a', 'O1', 'abutment', 'nk', 1100, 251.234).geometry.type).toBe(
      'abutment',
    );
  });

  it('provides geometry defaults per type', () => {
    expect(defaultGeometry('columns')).toMatchObject({
      type: 'columns',
      shape: 'circle',
      count: '2',
    });
  });
});
