import { describe, expect, it } from 'vitest';
import { createStationing } from './stationing.ts';

describe('stationing without equations', () => {
  const st = createStationing(-7724.35, 12527.25, []);

  it('offsets s by staStart, including negative stations', () => {
    expect(st.toDisplay(0)).toEqual({ station: -7724.35, region: 0 });
    expect(st.toDisplay(6427.698).station).toBeCloseTo(-1296.652, 9);
    expect(st.fromDisplay(-1296.652)).toBeCloseTo(6427.698, 9);
  });
});

describe('stationing with equations', () => {
  // s 0–300; skok vpred v s = 100 (1100 → 1150, medzera), skok späť v s = 200 (1250 → 1230, prekryv)
  const st = createStationing(1000, 300, [
    { staInternal: 1100, staBack: 1100, staAhead: 1150 },
    { staInternal: 1200, staBack: 1250, staAhead: 1230 },
  ]);

  it('converts s to display station per region', () => {
    expect(st.toDisplay(50)).toEqual({ station: 1050, region: 0 });
    expect(st.toDisplay(100)).toEqual({ station: 1150, region: 1 });
    expect(st.toDisplay(150)).toEqual({ station: 1200, region: 1 });
    expect(st.toDisplay(250)).toEqual({ station: 1280, region: 2 });
    expect(st.regions).toHaveLength(3);
  });

  it('returns undefined for display stations inside a gap', () => {
    expect(st.fromDisplay(1120)).toBeUndefined();
  });

  it('resolves overlapping display stations by region', () => {
    expect(st.fromDisplayAll(1240)).toEqual([190, 210]);
    expect(st.fromDisplay(1240)).toBe(190);
    expect(st.fromDisplay(1240, 2)).toBe(210);
  });

  it('round-trips every s', () => {
    for (let s = 0; s <= 300; s += 7.7) {
      const d = st.toDisplay(s);
      expect(st.fromDisplay(d.station, d.region)).toBeCloseTo(s, 9);
    }
  });
});
