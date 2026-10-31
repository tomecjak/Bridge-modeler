/**
 * End-to-end test: referenčný most 212-00 (fixtúra `@bridge/sections/testing`, výkres `fixtures/inbox/Vzorový most.pdf`).
 */
import { evaluateSpans, overallLength, seatAt } from '@bridge/sections';
import { evaluateReference212, reference212Project, SIN } from '@bridge/sections/testing';
import { describe, expect, it } from 'vitest';
import { meshVolume } from './mesh.ts';
import { buildScene, createSceneCache } from './scene.ts';

describe('referenčný most 212-00', () => {
  it('evaluates all supports without issues', () => {
    for (const r of evaluateReference212().results) expect(r.issues, r.support.name).toEqual([]);
  });

  it('has spans 16 / 23 / 16 m along the axis and 14.10 / 20.26 / 14.10 m perpendicular', () => {
    const { results, deck } = evaluateReference212();
    const spans = evaluateSpans(deck, results);
    expect(spans.issues.filter((i) => i.severity !== 'warning')).toEqual([]);
    expect(spans.spans.map((s) => s.length)).toEqual([
      expect.closeTo(16, 9),
      expect.closeTo(23, 9),
      expect.closeTo(16, 9),
    ]);
    // výkres má podpery s mierne rozdielnou šikmosťou (68,40 – 68,94 g), test používa 68,71 g pre všetky → ± 2 cm
    const perpendicular = spans.spans.map((s) => s.length * SIN);
    [14.1, 20.26, 14.1].forEach((v, i) => {
      expect(Math.abs((perpendicular[i] as number) - v)).toBeLessThanOrEqual(0.02);
    });
  });

  it('has a 56.00 m deck and a 65.84 m overall length to the wing ends', () => {
    const { results, sFrom, sTo } = evaluateReference212();
    expect(sTo - sFrom).toBeCloseTo(56, 9);
    expect(overallLength(results, { sFrom, sTo })).toBeCloseTo(65.84, 6);
  });

  it('matches the abutment seat elevations of the drawing within 5 mm', () => {
    const { results, alignment } = evaluateReference212();
    const seat = (i: number) =>
      seatAt(results[i] as (typeof results)[number], 0) + alignment.origin.z;
    expect(Math.abs(seat(0) - 316.772)).toBeLessThan(0.005);
    expect(Math.abs(seat(3) - 316.417)).toBeLessThan(0.005);
  });

  it('builds the whole bridge as closed solids', () => {
    const scene = buildScene(reference212Project(), createSceneCache());
    expect(scene.objects.map((o) => o.id)).toEqual(['nk', 'p1', 'p2', 'p3', 'p4']);
    for (const o of scene.objects) {
      expect(o.issues, o.id).toEqual([]);
      expect(meshVolume(o.mesh), o.id).toBeGreaterThan(0);
    }
  });
});
