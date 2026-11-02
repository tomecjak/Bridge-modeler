import { distance2 } from '@bridge/geom';
import { describe, expect, it } from 'vitest';
import { createAlignment, suggestOrigin } from '../alignment.ts';
import { toLandXml } from '../testing/landxml-writer.ts';
import { syntheticAlignmentData } from '../testing/synthetic.ts';
import { parseLandXml } from './parse.ts';

// Celá cesta LandXML → AlignmentData → Alignment na syntetickej osi (beží aj v CI bez podkladov).
describe('LandXML round trip of a synthetic alignment', () => {
  const data = syntheticAlignmentData(undefined, -250);
  const { alignments, issues } = parseLandXml(toLandXml(data));

  it('parses back without issues', () => {
    expect(issues).toEqual([]);
    expect(alignments).toHaveLength(1);
  });

  it('evaluates identically to the source geometry', () => {
    const parsed = alignments[0];
    if (!parsed) throw new Error('missing alignment');
    const origin = suggestOrigin(data);
    const expected = createAlignment(data, origin);
    const actual = createAlignment(parsed, origin);
    expect(actual.issues).toEqual([]);
    for (let s = 0; s <= expected.alignment.length; s += 2.5) {
      const a = actual.alignment.evaluate(s);
      const e = expected.alignment.evaluate(s);
      expect(distance2(a.point, e.point)).toBeLessThan(1e-6);
      expect(Math.abs(a.point.z - e.point.z)).toBeLessThan(1e-9);
      expect(Math.abs(a.azimuth - e.azimuth)).toBeLessThan(1e-9);
    }
  });

  it('keeps the superelevation of curves', () => {
    const withSe = {
      ...data,
      superelevation: [
        {
          staStart: 40,
          staEnd: 90,
          beginRunoff: 30,
          fullSuper: 40,
          fullSuperelev: 3.5,
          runoff: 90,
        },
      ],
    };
    const back = parseLandXml(toLandXml(withSe)).alignments[0];
    expect(back?.superelevation).toEqual(withSe.superelevation);
  });
});
