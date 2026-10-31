import { type AlignmentData, createAlignment } from '@bridge/alignment';
import { vec2 } from '@bridge/geom';
import type { PlanLine } from '@bridge/model';
import { describe, expect, it } from 'vitest';
import { type EdgeCurveContext, edgeBreaks, edgeDistance } from './edge.ts';

const origin = { x: 0, y: 0, z: 0 };
const line = (name: string, a: [number, number], b: [number, number]): AlignmentData => ({
  name,
  staStart: 0,
  length: Math.hypot(b[0] - a[0], b[1] - a[1]),
  horizontal: [
    {
      kind: 'line',
      length: Math.hypot(b[0] - a[0], b[1] - a[1]),
      start: vec2(...a),
      end: vec2(...b),
    },
  ],
  stationEquations: [],
  profiles: [],
});
/** Oblúk so stredom (20, 50), R = 25 od najľavejšieho bodu (−5, 50) na sever, doprava. */
const R = 25;
const arc: AlignmentData = {
  name: 'oblúk',
  staStart: 0,
  length: R * 0.9,
  horizontal: [
    {
      kind: 'arc',
      length: R * 0.9,
      start: vec2(-5, 50),
      end: vec2(20 - R * Math.cos(0.9), 50 + R * Math.sin(0.9)),
      center: vec2(20, 50),
      radius: R,
      rotation: 'cw',
    },
  ],
  stationEquations: [],
  profiles: [],
};
const build = (data: AlignmentData) => createAlignment(data, origin).alignment;

const ctx: EdgeCurveContext = {
  alignments: new Map(
    [
      line('cesta', [0, 0], [0, 100]),
      line('rovnobežná', [-5, -10], [-5, 110]),
      line('rozbiehavá', [-5, 0], [-10, 100]),
      arc,
    ].map((d) => [d.name, build(d)]),
  ),
  planLines: [
    {
      id: 'c1',
      name: 'Okraj P',
      points: [vec2(4, 0), vec2(4, 40), vec2(6, 60), vec2(6, 100)],
    } satisfies PlanLine,
  ],
};
// os cesty na sever: bod (0, s), normála vpravo (1, 0)
const right = vec2(1, 0);
const at = (s: number) => vec2(0, s);
const value = (r: ReturnType<typeof edgeDistance>) => (r.ok ? r.value : Number.NaN);

describe('edgeDistance', () => {
  it('measures a parallel, a diverging and a circular alignment perpendicular to the axis', () => {
    const parallel = { type: 'alignment', name: 'rovnobežná' } as const;
    const diverging = { type: 'alignment', name: 'rozbiehavá' } as const;
    const circle = { type: 'alignment', name: 'oblúk' } as const;
    for (const s of [0, 12.5, 50, 99]) {
      expect(Math.abs(value(edgeDistance(ctx, parallel, at(s), right, 'left')) - 5)).toBeLessThan(
        1e-9,
      );
      expect(
        Math.abs(value(edgeDistance(ctx, diverging, at(s), right, 'left')) - (5 + s / 20)),
      ).toBeLessThan(1e-9);
    }
    for (const s of [50, 55, 60, 65]) {
      const exact = -(20 - Math.sqrt(R * R - (s - 50) ** 2));
      expect(Math.abs(value(edgeDistance(ctx, circle, at(s), right, 'left')) - exact)).toBeLessThan(
        1e-6,
      );
    }
  });

  it('intersects a plan line, also between its vertices', () => {
    const ref = { type: 'planLine', id: 'c1' } as const;
    expect(value(edgeDistance(ctx, ref, at(20), right, 'right'))).toBeCloseTo(4, 12);
    expect(value(edgeDistance(ctx, ref, at(50), right, 'right'))).toBeCloseTo(5, 12);
    expect(value(edgeDistance(ctx, ref, at(80), right, 'right'))).toBeCloseTo(6, 12);
  });

  it('reports a curve on the other side, beyond its end or farther than 50 m, and an unknown curve', () => {
    const parallel = { type: 'alignment', name: 'rovnobežná' } as const;
    expect(edgeDistance(ctx, parallel, at(50), right, 'right')).toMatchObject({
      ok: false,
      issue: { code: 'EdgeCurveNotReached', curve: 'rovnobežná' },
    });
    expect(
      edgeDistance(ctx, { type: 'alignment', name: 'oblúk' }, at(90), right, 'left'),
    ).toMatchObject({ ok: false, issue: { code: 'EdgeCurveNotReached', curve: 'oblúk' } });
    expect(
      edgeDistance(ctx, { type: 'planLine', id: 'c1' }, at(150), right, 'right'),
    ).toMatchObject({ ok: false, issue: { code: 'EdgeCurveNotReached', curve: 'Okraj P' } });
    const far: EdgeCurveContext = {
      ...ctx,
      planLines: [{ id: 'far', name: 'Ďaleko', points: [vec2(-60, 0), vec2(-60, 100)] }],
    };
    expect(edgeDistance(far, { type: 'planLine', id: 'far' }, at(50), right, 'left')).toMatchObject(
      {
        ok: false,
        issue: { code: 'EdgeCurveNotReached' },
      },
    );
    expect(edgeDistance(ctx, { type: 'planLine', id: 'x' }, at(50), right, 'right')).toMatchObject({
      ok: false,
      issue: { code: 'EdgeCurveNotFound', curve: 'x' },
    });
  });
});

describe('edgeBreaks', () => {
  const road = ctx.alignments.get('cesta');
  it('projects plan line vertices and alignment element joints onto the road', () => {
    if (!road) throw new Error('chýba os');
    expect(edgeBreaks(ctx, { type: 'planLine', id: 'c1' }, road)).toEqual([0, 40, 60, 100]);
    // rovnobežná os začína pred osou cesty a končí za ňou → jej konce sa na os nepremietnu
    expect(edgeBreaks(ctx, { type: 'alignment', name: 'rovnobežná' }, road)).toEqual([]);
    expect(
      edgeBreaks(ctx, { type: 'alignment', name: 'oblúk' }, road).map((s) => s.toFixed(6)),
    ).toEqual([50, 50 + R * Math.sin(0.9)].map((s) => s.toFixed(6)));
  });
});
