import { vec2 } from '@bridge/geom';
import { describe, expect, it } from 'vitest';
import { handleAt, type LineHandle, previewOnHandle } from './lineEdit.ts';

const handles: LineHandle[] = [
  { id: 'a', deckId: 'nk', s: 10, free: false, plan: [vec2(10, -5), vec2(10, 5)], u: 10 },
  { id: 'b', deckId: 'nk', s: 26, free: true, plan: [vec2(26, -5), vec2(26, 5)], u: 26 },
];
const identity = (p: { x: number; y: number }) => p;

describe('handleAt', () => {
  it('finds the nearest bearing line within the snap radius in plan and profile', () => {
    expect(handleAt(vec2(18, 20), handles, identity, 'plan')).toBeUndefined();
    expect(handleAt(vec2(24, 7), handles, identity, 'plan')?.id).toBe('b');
    expect(handleAt(vec2(12, 300), handles, identity, 'profile')?.id).toBe('a');
  });

  it('can restrict the candidates to free lines', () => {
    expect(handleAt(vec2(12, 0), handles, identity, 'plan', (h) => h.free)).toBeUndefined();
    expect(previewOnHandle(handles[1] as LineHandle)).toEqual({
      deckId: 'nk',
      s: 26,
      lineId: 'b',
      spans: [],
      plan: handles[1]?.plan,
      u: 26,
    });
  });
});
