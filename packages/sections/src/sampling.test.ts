import { createAlignment, suggestOrigin } from '@bridge/alignment';
import { syntheticAlignmentData } from '@bridge/alignment/testing';
import type { StationFunction } from '@bridge/model';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SAMPLING, type SamplingInput, sampleStations } from './sampling.ts';

const data = syntheticAlignmentData(undefined, 1000);
const { alignment } = createAlignment(data, suggestOrigin(data));
const noScope = () => () => undefined;

const input = (changes: Partial<SamplingInput> = {}): SamplingInput => ({
  alignment,
  sFrom: 0,
  sTo: alignment.length,
  laws: [],
  scope: noScope,
  breaks: [],
  reach: 8,
  ...changes,
});

const steps = (s: number[]) => s.slice(1).map((v, i) => v - (s[i] as number));

describe('sampleStations', () => {
  it('starts and ends at the range, strictly increasing, never longer than the max step', () => {
    const s = sampleStations(input({ sFrom: 10, sTo: 210 }));
    expect(s[0]).toBe(10);
    expect(s[s.length - 1]).toBe(210);
    for (const d of steps(s)) {
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThanOrEqual(DEFAULT_SAMPLING.maxStep + 1e-9);
    }
  });

  it('keeps the chord error of the outermost section point in curves within the tolerance', () => {
    const reach = 8;
    const s = sampleStations(input({ reach }));
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1] as number;
      const b = s[i] as number;
      const k = Math.max(
        ...[a, (a + b) / 2, b].map((v) => Math.abs(alignment.evaluateHorizontal(v).curvature)),
      );
      if (k === 0) continue;
      const r = 1 / k - reach;
      expect((b - a) ** 2 / (8 * r)).toBeLessThanOrEqual(DEFAULT_SAMPLING.tolerance * 1.001);
    }
    // v oblúku R 250 je krok kratší ako na priamke
    const inArc = steps(s.filter((v) => v > 115 && v < 185));
    expect(Math.max(...inArc)).toBeLessThan(DEFAULT_SAMPLING.maxStep);
  });

  it('samples element boundaries, vertical curve ends and extra breaks exactly', () => {
    const s = sampleStations(input({ breaks: [123.4567] }));
    // zlomy bližšie ako 1e-6 m sa zlúčia do jednej vzorky
    const has = (v: number) => s.some((x) => Math.abs(x - v) <= 1e-6);
    for (const e of alignment.elements) expect(has(e.sStart)).toBe(true);
    for (const k of alignment.profile?.keyPoints ?? []) {
      if (k.kind === 'pvc' || k.kind === 'pvt') expect(has(k.s)).toBe(true);
    }
    expect(s).toContain(123.4567);
  });

  it('samples law segment boundaries (display stations) and just before an inner boundary', () => {
    const law: StationFunction = {
      kind: 'piecewise',
      segments: [
        { from: 1000, to: 1050.5, v0: '1.7', v1: '1.7', shape: 'linear' },
        { from: 1050.5, to: 1100, v0: '2.5', v1: '1.7', shape: 'linear' },
      ],
    };
    const s = sampleStations(input({ laws: [{ law, unit: 'length' }] }));
    expect(s).toContain(50.5);
    expect(s).toContain(50.5 - DEFAULT_SAMPLING.jumpGap);
    expect(s).toContain(100);
  });

  it('refines steps along a parabolic haunch according to its curvature', () => {
    const law: StationFunction = {
      kind: 'piecewise',
      segments: [{ from: 1000, to: 1020, v0: '3', v1: '1.5', shape: 'parabolic', vertexAt: 'end' }],
    };
    const s = sampleStations(input({ sTo: 40, laws: [{ law, unit: 'length' }] }));
    // f'' = 2·1,5 / 20² → krok ≤ √(8·tol / f'')
    const limit = Math.sqrt((8 * DEFAULT_SAMPLING.tolerance) / ((2 * 1.5) / 400));
    for (const d of steps(s.filter((v) => v <= 20))) expect(d).toBeLessThanOrEqual(limit + 1e-9);
    expect(Math.max(...steps(s.filter((v) => v >= 20)))).toBeGreaterThan(limit);
  });

  it('is deterministic', () => {
    expect(sampleStations(input())).toEqual(sampleStations(input()));
  });
});
