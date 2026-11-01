import { describe, expect, it } from 'vitest';
import { defaultGeometry, defaultSupport } from './supports.ts';

describe('support defaults', () => {
  it('puts the foundation 8 m below the soffit for piers and 5 m for abutments', () => {
    expect(defaultSupport('a', 'P1', 'pier', 'l1', 251.234).foundationTop).toBe('243.2');
    expect(defaultSupport('a', 'O1', 'abutment', 'l1', 251.234).geometry.type).toBe('abutment');
  });

  it('sizes a new abutment to the deck width', () => {
    const o = defaultSupport('a', 'O1', 'abutment', 'l1', 251.234, 16.54);
    expect(o.geometry).toMatchObject({ type: 'abutment', length: '16.5' });
    expect(o.footing.length).toBe('16.5');
  });

  it('provides geometry defaults per type', () => {
    expect(defaultGeometry('columns')).toMatchObject({
      type: 'columns',
      shape: 'circle',
      count: '2',
    });
  });
});
