import { describe, expect, it } from 'vitest';
import { effectiveFreeWidth, emptyBrief, parseRoadCategory } from './brief.ts';

describe('parseRoadCategory', () => {
  it('reads the letter, the free width b and the design speed', () => {
    expect(parseRoadCategory('C 9,5/70')).toEqual({ letter: 'C', b: 9.5, speed: 70 });
    expect(parseRoadCategory('R 24,5/120')).toEqual({ letter: 'R', b: 24.5, speed: 120 });
    expect(parseRoadCategory(' MZ 14 / 50 ')).toEqual({ letter: 'MZ', b: 14, speed: 50 });
  });

  it('accepts a decimal point, no space and no speed', () => {
    expect(parseRoadCategory('C9.5')).toEqual({ letter: 'C', b: 9.5 });
    expect(parseRoadCategory('c 7,5')).toEqual({ letter: 'C', b: 7.5 });
  });

  it('rejects text that is not a category', () => {
    for (const text of ['', 'C', '9,5', 'cesta I. triedy', 'C 0/50', 'C 9,5/']) {
      expect(parseRoadCategory(text)).toBeUndefined();
    }
  });
});

describe('effectiveFreeWidth', () => {
  it('prefers the manual value, then b from the category', () => {
    const brief = { ...emptyBrief(), roadCategory: 'C 9,5/70' };
    expect(effectiveFreeWidth(brief)).toBe(9.5);
    expect(effectiveFreeWidth({ ...brief, freeWidth: 10.25 })).toBe(10.25);
    expect(effectiveFreeWidth(emptyBrief())).toBeUndefined();
  });
});
