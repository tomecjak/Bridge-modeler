import { describe, expect, it } from 'vitest';
import { defaultGeometry, defaultSupport } from './supports.ts';

describe('support defaults', () => {
  it('founds a pier by the terrain and an abutment by its height', () => {
    expect(defaultSupport('a', 'P1', 'pier', 'l1', 251.234).foundation).toEqual({
      mode: 'terrain',
      cover: '0.5',
      height: '8',
      // odhad 8 m pod spodkom NK − hrúbka základu 1,2 m pre prepnutie na kótu
      level: '242',
    });
    const o = defaultSupport('a', 'O1', 'abutment', 'l1', 251.234);
    expect(o.geometry.type).toBe('abutment');
    expect(o.foundation).toMatchObject({ mode: 'height', height: '4', level: '245' });
  });

  it('sizes a new abutment to the deck width', () => {
    const o = defaultSupport('a', 'O1', 'abutment', 'l1', 251.234, 16.54);
    expect(o.geometry).toMatchObject({ type: 'abutment', length: '16.5' });
    expect(o.footing.length).toBe('16.5');
  });

  it('takes the bearings derived from the deck profile', () => {
    expect(defaultSupport('a', 'P1', 'pier', 'l1', 250, 12, [-1.25, 1.25]).bearings).toEqual([
      '-1.25',
      '1.25',
    ]);
    expect(defaultSupport('a', 'P1', 'pier', 'l1', 250).bearings).toEqual(['-1.8', '1.8']);
  });

  it('provides geometry defaults per type', () => {
    expect(defaultGeometry('columns')).toMatchObject({
      type: 'columns',
      shape: 'circle',
      count: '2',
    });
  });
});
