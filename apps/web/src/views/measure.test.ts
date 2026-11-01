import { vec2 } from '@bridge/geom';
import { describe, expect, it } from 'vitest';
import {
  drawingVertices,
  formatPlanMeasure,
  formatProfileMeasure,
  planMeasure,
  snapPoint,
} from './measure.ts';

describe('measure', () => {
  it('snaps to the nearest vertex within the radius in screen pixels', () => {
    // 10 px na meter, prevýšenie 5×
    const toScreen = (p: { x: number; y: number }) => vec2(p.x * 10, -p.y * 50);
    const candidates = [vec2(0, 0), vec2(1, 0.1), vec2(3, 0)];
    expect(snapPoint(vec2(11, -2), candidates, toScreen)).toEqual(vec2(1, 0.1));
    expect(snapPoint(vec2(16, -20), candidates, toScreen)).toBeUndefined();
  });

  it('collects vertices of drawing polylines and extra lines', () => {
    const drawing = {
      scale: 200,
      entities: [
        {
          kind: 'polyline' as const,
          layer: 'deck' as const,
          points: [vec2(0, 0), vec2(1, 1)],
          closed: true,
        },
        {
          kind: 'text' as const,
          layer: 'label' as const,
          at: vec2(5, 5),
          text: 'P1',
          height: 1,
          rotation: 0,
          align: 'left' as const,
        },
      ],
    };
    expect(drawingVertices(drawing, [[vec2(2, 2)]])).toEqual([vec2(0, 0), vec2(1, 1), vec2(2, 2)]);
  });

  it('measures length, height difference and grade in the profile in true values', () => {
    expect(formatProfileMeasure(vec2(120, 300), vec2(100, 301))).toBe(
      'Δl 20,000 m  ·  Δh 1,000 m  ·  sklon -5,00 %',
    );
  });

  it('measures distance and coordinate differences in plan', () => {
    expect(planMeasure(vec2(1, 1), vec2(-2, 5))).toEqual({ distance: 5, dE: -3, dN: 4 });
    expect(formatPlanMeasure(vec2(0, 0), vec2(3, 4))).toBe(
      'vzdialenosť 5,000 m  ·  ΔE 3,000  ·  ΔN 4,000',
    );
  });
});
