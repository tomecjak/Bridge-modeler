import { signedArea, vec2 } from '@bridge/geom';
import type { Support } from '@bridge/model';
import { describe, expect, it } from 'vitest';
import { columnOffsets, supportElevation, supportPlan } from './supportGeometry.ts';
import { type SupportResult, seatAt } from './supports.ts';

function result(
  geometry: Support['geometry'],
  dimensions: Record<string, number>,
  angleDeg = 90,
): SupportResult {
  const alpha = (angleDeg * Math.PI) / 180;
  // os mosta na sever: tangenta (0, 1), normála vpravo (1, 0); os podpery = otočená o α proti smeru hodín
  const direction = vec2(-Math.sin(alpha), Math.cos(alpha));
  return {
    support: { geometry } as Support,
    s: 0,
    station: 0,
    axis: {
      point: { x: 0, y: 0, z: 10 },
      frame: {
        origin: { x: 0, y: 0, z: 10 },
        tangent: { x: 0, y: 1, z: 0 },
        normal: { x: 1, y: 0, z: 0 },
        binormal: { x: 0, y: 0, z: 1 },
      },
      horizontalOffset: 0,
      verticalOffset: 0,
    },
    direction,
    center: vec2(0, 0),
    crossingAngle: alpha,
    bearings: [
      { index: 0, x: -2, s: 0, station: 0, plan: vec2(0, 0), soffit: 8.6, seat: 8.2, height: 8.2 },
      { index: 1, x: 2, s: 0, station: 0, plan: vec2(0, 0), soffit: 8.4, seat: 8.0, height: 8.0 },
    ],
    foundationTop: 0,
    height: { min: 8, max: 8.2 },
    dimensions,
    footing: { length: 8, width: 4, thickness: 1.2 },
    issues: [],
  };
}

describe('supportPlan', () => {
  it('draws a wall pier as a rectangle length × thickness with the long side along the support axis', () => {
    const plan = supportPlan(
      result({ type: 'wall', thickness: '1.2', length: '6' }, { thickness: 1.2, length: 6 }, 70),
    );
    const wall = plan?.body[0] ?? [];
    expect(Math.abs(signedArea(wall))).toBeCloseTo(7.2, 12);
    const side = vec2((wall[1]?.x ?? 0) - (wall[0]?.x ?? 0), (wall[1]?.y ?? 0) - (wall[0]?.y ?? 0));
    // dlhá strana zviera s osou mosta (sever) uhol 70° proti smeru hodín
    expect((Math.atan2(-side.x, side.y) * 180) / Math.PI).toBeCloseTo(70, 9);
    expect(Math.abs(signedArea(plan?.footing ?? []))).toBeCloseTo(32, 12);
  });

  it('places columns symmetrically with the given spacing; circle or rectangle', () => {
    expect(columnOffsets(3, 3.5)).toEqual([-3.5, 0, 3.5]);
    const round = supportPlan(
      result(
        {
          type: 'columns',
          shape: 'circle',
          diameter: '1.2',
          width: '1',
          depth: '1',
          count: '2',
          spacing: '4',
        },
        { diameter: 1.2, count: 2, spacing: 4 },
      ),
    );
    expect(round?.body).toHaveLength(2);
    expect(Math.abs(signedArea(round?.body[0] ?? []))).toBeCloseTo(Math.PI * 0.36, 1);
    const rect = supportPlan(
      result(
        {
          type: 'columns',
          shape: 'rect',
          diameter: '1',
          width: '1.5',
          depth: '0.8',
          count: '2',
          spacing: '4',
        },
        { width: 1.5, depth: 0.8, count: 2, spacing: 4 },
      ),
    );
    expect(Math.abs(signedArea(rect?.body[1] ?? []))).toBeCloseTo(1.2, 12);
  });
});

describe('supportElevation', () => {
  it('runs the top through the seats at the bearings and the bottom on the foundation top', () => {
    const r = result(
      { type: 'wall', thickness: '1.2', length: '6' },
      { thickness: 1.2, length: 6 },
    );
    expect(seatAt(r, 0)).toBeCloseTo(8.1, 12);
    expect(seatAt(r, 5)).toBe(8.0);
    const el = supportElevation(r);
    const wall = el?.body[0] ?? [];
    expect(wall.map((p) => p.y)).toEqual([0, 0, 8.0, 8.2]);
    expect(wall[1]?.x).toBeCloseTo(3, 12);
    expect(el?.footing?.[0]?.y).toBeCloseTo(-1.2, 12);
  });

  it('projects a skewed support width onto the deck cross-section (× sin α)', () => {
    const r = result(
      { type: 'wall', thickness: '1.2', length: '6' },
      { thickness: 1.2, length: 6 },
      60,
    );
    const wall = supportElevation(r)?.body[0] ?? [];
    expect((wall[1]?.x ?? 0) - (wall[0]?.x ?? 0)).toBeCloseTo(6 * Math.sin(Math.PI / 3), 12);
  });
});
