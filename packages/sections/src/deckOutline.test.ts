import type { Polygon2D, Vec2 } from '@bridge/geom';
import { describe, expect, it } from 'vitest';
import { deckOutline } from './deckOutline.ts';
import { type DeckSamples, sampleSuperstructure } from './deckSampling.ts';
import type { SupportResult } from './supports.ts';
import { evaluateReference212 } from './testing/reference212.ts';

const ref = evaluateReference212();
const samples = sampleSuperstructure(ref.ctx, ref.deck, ref.results) as DeckSamples;
const outline = deckOutline(samples);

/** Kolmá vzdialenosť bodu od priamej osi cesty (+ vpravo). */
function offset(p: Vec2): number {
  const r = ref.alignment.evaluateHorizontal(0);
  return (p.x - r.point.x) * Math.cos(r.azimuth) - (p.y - r.point.y) * Math.sin(r.azimuth);
}

describe('deckOutline', () => {
  it('follows the deck edges at half the width from the axis', () => {
    expect(outline.left.length).toBeGreaterThan(10);
    for (const p of outline.left) expect(offset(p)).toBeCloseTo(-8.25, 6);
    for (const p of outline.right) expect(offset(p)).toBeCloseTo(8.25, 6);
  });

  it('closes the outline with ends parallel to the abutment axes', () => {
    const direction = (i: number) => (ref.results[i] as SupportResult).direction;
    const ends: [Vec2, Vec2, Vec2][] = [
      [outline.left[0] as Vec2, outline.right[0] as Vec2, direction(0)],
      [outline.left.at(-1) as Vec2, outline.right.at(-1) as Vec2, direction(3)],
    ];
    for (const [a, b, d] of ends) {
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      expect(Math.abs(((b.x - a.x) * d.y - (b.y - a.y) * d.x) / len)).toBeLessThan(1e-9);
    }
    const poly: Polygon2D = outline.polygon;
    expect(poly).toHaveLength(outline.left.length + outline.right.length);
  });

  it('keeps the deck length on the axis between the skewed ends', () => {
    // stred konca na osi mosta leží na staničení od / do
    const mid = (a: Vec2, b: Vec2) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const start = mid(outline.left[0] as Vec2, outline.right[0] as Vec2);
    const end = mid(outline.left.at(-1) as Vec2, outline.right.at(-1) as Vec2);
    expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeCloseTo(56, 6);
  });
});
