import { describe, expect, it } from 'vitest';
import {
  boundsOf,
  fitView,
  focusRange,
  niceStep,
  pan,
  screenToWorld,
  worldToScreen,
  zoomAt,
} from './viewTransform.ts';

const size = { width: 800, height: 600 };

describe('view transform', () => {
  it('maps world to screen with y up and back', () => {
    const v = { cx: 100, cy: 50, sx: 2, sy: 2 };
    expect(worldToScreen(v, size, { x: 100, y: 50 })).toEqual({ x: 400, y: 300 });
    expect(worldToScreen(v, size, { x: 110, y: 60 })).toEqual({ x: 420, y: 280 });
    const w = screenToWorld(v, size, { x: 123, y: 456 });
    expect(worldToScreen(v, size, w).x).toBeCloseTo(123, 12);
    expect(worldToScreen(v, size, w).y).toBeCloseTo(456, 12);
  });

  it('fits bounds with padding and vertical exaggeration', () => {
    const v = fitView({ minX: 0, minY: 290, maxX: 700, maxY: 300 }, size, 50, 10);
    expect(v.sx).toBeCloseTo(1, 12); // 700 m → 700 px
    expect(v.sy).toBeCloseTo(10, 12);
    expect(v.cx).toBe(350);
    expect(v.cy).toBe(295);
  });

  it('keeps the point under the cursor fixed while zooming', () => {
    const v = { cx: 0, cy: 0, sx: 1, sy: 3 };
    const cursor = { x: 600, y: 100 };
    const before = screenToWorld(v, size, cursor);
    const after = screenToWorld(zoomAt(v, size, cursor, 2.5), size, cursor);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it('pans by screen pixels', () => {
    const v = pan({ cx: 0, cy: 0, sx: 2, sy: 2 }, 20, 10);
    expect(v.cx).toBe(-10);
    expect(v.cy).toBe(5);
  });

  it('chooses nice steps', () => {
    expect(niceStep(0.7)).toBe(1);
    expect(niceStep(13)).toBe(20);
    expect(niceStep(20)).toBe(20);
    expect(niceStep(260)).toBe(500);
    expect(niceStep(600)).toBe(1000);
  });

  it('computes bounds of points', () => {
    expect(
      boundsOf([
        { x: 1, y: 5 },
        { x: -2, y: 3 },
      ]),
    ).toEqual({ minX: -2, minY: 3, maxX: 1, maxY: 5 });
  });
});

describe('focusRange', () => {
  it('adds 15 % of the length on both sides, at least the minimum margin, within the axis', () => {
    expect(focusRange({ from: 1000, to: 1200 }, 0, 5000)).toEqual({ from: 970, to: 1230 });
    expect(focusRange({ from: 1050, to: 1000 }, 0, 5000)).toEqual({ from: 980, to: 1070 });
    expect(focusRange({ from: 10, to: 4990 }, 0, 5000)).toEqual({ from: 0, to: 5000 });
  });
});
