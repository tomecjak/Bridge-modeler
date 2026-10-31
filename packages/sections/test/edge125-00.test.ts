/**
 * Okraj podľa krivky na osiach z Civil 3D (`fixtures/inbox/125-00_C3D.xml`: os 125-00 a krátke oblúky napojenia
 * 125_L, 125_R, ≈ 23 m, odbočujú od okraja 1,5 m pri km 0,004–0,020). Podklad sa neverzuje a výkaz vzdialeností
 * k nemu nie je → test overuje vnútornú konzistenciu (nájdený bod leží na okrajovej osi ≤ 1e-6 m, kolmo na os cesty)
 * a že ďaleké úseky osi oblúk nenájdu. Bez podkladu sa preskočí.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createAlignment, parseLandXml, suggestOrigin } from '@bridge/alignment';
import { vec2 } from '@bridge/geom';
import { describe, expect, it } from 'vitest';
import { type EdgeCurveContext, edgeBreaks, edgeDistance } from '../src/edge.ts';

const file = resolve(import.meta.dirname, '../../../fixtures/inbox/125-00_C3D.xml');
const available = existsSync(file);

describe.skipIf(!available)('edge curves on the Civil 3D alignments 125-00', () => {
  const parsed = available ? parseLandXml(readFileSync(file, 'utf8')) : undefined;
  const data = parsed?.alignments ?? [];
  const main = data.find((d) => d.name === '125-00');
  if (!main) return;
  const origin = suggestOrigin(main);
  const ctx: EdgeCurveContext = {
    alignments: new Map(
      data.map((d) => {
        const a = createAlignment(d, origin).alignment;
        return [a.name, a];
      }),
    ),
    planLines: [],
  };
  const road = ctx.alignments.get('125-00');

  it.each([
    ['125_L', 'left'],
    ['125_R', 'right'],
  ] as const)('finds %s on the %s side on a perpendicular to the road axis', (name, side) => {
    if (!road) throw new Error('chýba os 125-00');
    const edge = ctx.alignments.get(name);
    if (!edge) throw new Error(`chýba os ${name}`);
    let reached = 0;
    for (let s = 0; s <= road.length; s += 0.5) {
      const r = road.evaluateHorizontal(s);
      const n = vec2(Math.cos(r.azimuth), -Math.sin(r.azimuth));
      const d = edgeDistance(ctx, { type: 'alignment', name }, r.point, n, side);
      if (!d.ok) continue;
      reached++;
      const sign = side === 'right' ? 1 : -1;
      const p = vec2(r.point.x + sign * d.value * n.x, r.point.y + sign * d.value * n.y);
      expect(Math.abs(edge.project(p)?.offset ?? Number.NaN)).toBeLessThan(1e-6);
      expect(Math.abs((road.project(p)?.s ?? Number.NaN) - s)).toBeLessThan(1e-6);
      expect(d.value).toBeGreaterThan(0);
    }
    // oblúk leží pri km 0,004 – 0,020; ďalej ho kolmica (do 50 m) nenájde
    expect(reached).toBeGreaterThan(25);
    expect(reached).toBeLessThan(40);
    expect(edgeBreaks(ctx, { type: 'alignment', name }, road).length).toBeGreaterThan(0);
  });
});
