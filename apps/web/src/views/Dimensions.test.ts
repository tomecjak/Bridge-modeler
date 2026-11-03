import { describe, expect, it } from 'vitest';
import { chainRows, rowVisible, textPlacement, textWidth } from './Dimensions.tsx';

describe('annotation rules (ADR 0025)', () => {
  it('orders rows spans, deck, overall, bridged without gaps for missing chains', () => {
    const rows = chainRows([
      { kind: 'overall', segments: [] },
      { kind: 'spans', segments: [] },
    ]);
    expect([...rows]).toEqual([
      ['spans', 0],
      ['overall', 1],
    ]);
  });

  it('places text inside, outside at the ends, or hides it for a short inner segment', () => {
    const w = textWidth(0.9);
    expect(textPlacement(w + 1, 0.9, 1, 3)).toBe('inside');
    expect(textPlacement(w - 1, 0.9, 0, 3)).toBe('before');
    expect(textPlacement(w - 1, 0.9, 2, 3)).toBe('after');
    expect(textPlacement(w - 1, 0.9, 1, 3)).toBe('hidden');
  });

  it('shows a row only when at least half of its texts fit', () => {
    const w = textWidth(60);
    expect(rowVisible([w, w, 1], [60, 60, 60])).toBe(true);
    expect(rowVisible([w, 1, 1], [60, 60, 60])).toBe(false);
    expect(rowVisible([], [])).toBe(false);
  });
});
