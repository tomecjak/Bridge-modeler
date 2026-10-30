import { describe, expect, it } from 'vitest';
import type { VerticalProfileData } from '../data.ts';
import { StationOutOfRangeError } from '../errors.ts';
import { buildVertical } from './vertical.ts';

const STA_START = 1000;

// PVI v spojitom staničení (staStart + s); sklony −1,38 %, +2 %, −3 %
const profileData: VerticalProfileData = {
  name: 'Niveleta',
  pvis: [
    { station: 1000, elevation: 300 },
    { station: 1100, elevation: 298.62, curve: { kind: 'parabolic', length: 60 } },
    { station: 1300, elevation: 302.62, curve: { kind: 'circular', length: 0, radius: 2000 } },
    { station: 1500, elevation: 296.62 },
  ],
};

function build(data = profileData) {
  const { profile, issues } = buildVertical(data, STA_START);
  if (!profile) throw new Error(`profile not built: ${JSON.stringify(issues)}`);
  return { profile, issues };
}

describe('buildVertical', () => {
  const { profile, issues } = build();
  const g1 = -0.0138;
  const g2 = 0.02;
  const g3 = -0.03;

  it('builds without issues and spans the PVI range in s', () => {
    expect(issues).toEqual([]);
    expect(profile.startS).toBe(0);
    expect(profile.endS).toBe(500);
  });

  it('interpolates tangents', () => {
    expect(profile.evaluate(30).z).toBeCloseTo(300 + 30 * g1, 12);
    expect(profile.evaluate(30).grade).toBeCloseTo(g1, 12);
    expect(profile.evaluate(490).z).toBeCloseTo(296.62 + 10 * -g3, 12);
  });

  it('evaluates a symmetric parabolic curve', () => {
    const L = 60;
    // na PVI: z_PVI + (g2 − g1)·L/8
    expect(profile.evaluate(100).z).toBeCloseTo(298.62 + ((g2 - g1) * L) / 8, 12);
    expect(profile.evaluate(100).grade).toBeCloseTo((g1 + g2) / 2, 12);
    // najnižší bod: x = −g1·L / (g2 − g1) od PVC
    const sLow = 70 + (-g1 * L) / (g2 - g1);
    expect(profile.evaluate(sLow).grade).toBeCloseTo(0, 12);
  });

  it('is continuous in elevation and grade at PVC and PVT', () => {
    const r = 2000;
    const a1 = Math.atan(g2);
    const a2 = Math.atan(g3);
    const t = r * Math.tan(Math.abs(a2 - a1) / 2);
    const joints = [70, 130, 300 - t * Math.cos(a1), 300 + t * Math.cos(a2)];
    for (const s of joints) {
      const before = profile.evaluate(s - 1e-7);
      const after = profile.evaluate(s + 1e-7);
      expect(Math.abs(before.z - after.z)).toBeLessThan(1e-8);
      expect(Math.abs(before.grade - after.grade)).toBeLessThan(1e-7);
    }
  });

  it('evaluates a circular curve with the given radius', () => {
    // krivosť z'' / (1 + z'²)^(3/2) = −1/R pre vrcholový oblúk
    const h = 0.5;
    const s = 300;
    const z0 = profile.evaluate(s - h).z;
    const z1 = profile.evaluate(s).z;
    const z2 = profile.evaluate(s + h).z;
    const zpp = (z0 - 2 * z1 + z2) / (h * h);
    const zp = profile.evaluate(s).grade;
    expect(zpp / (1 + zp * zp) ** 1.5).toBeCloseTo(-1 / 2000, 7);
  });

  it('throws a typed error outside the profile', () => {
    expect(() => profile.evaluate(-0.01)).toThrow(StationOutOfRangeError);
    try {
      profile.evaluate(501);
    } catch (e) {
      expect((e as StationOutOfRangeError).code).toBe('ProfileOutOfRange');
    }
  });

  it('lists PVC / PVI / PVT points for drawings', () => {
    expect(profile.keyPoints.map((p) => p.kind)).toEqual([
      'start',
      'pvc',
      'pvi',
      'pvt',
      'pvc',
      'pvi',
      'pvt',
      'end',
    ]);
  });
});

describe('buildVertical issues', () => {
  it('reports overlapping vertical curves', () => {
    const data: VerticalProfileData = {
      name: 'P',
      pvis: [
        { station: 1000, elevation: 300 },
        { station: 1050, elevation: 301, curve: { kind: 'parabolic', length: 80 } },
        { station: 1100, elevation: 300, curve: { kind: 'parabolic', length: 80 } },
        { station: 1200, elevation: 302 },
      ],
    };
    expect(buildVertical(data, STA_START).issues).toMatchObject([
      { code: 'VerticalCurvesOverlap', severity: 'error', profile: 'P' },
    ]);
  });

  it('reports profiles with fewer than two PVIs or unordered stations', () => {
    const one: VerticalProfileData = { name: 'P', pvis: [{ station: 1000, elevation: 300 }] };
    expect(buildVertical(one, STA_START).profile).toBeUndefined();
    const unordered: VerticalProfileData = {
      name: 'P',
      pvis: [
        { station: 1100, elevation: 300 },
        { station: 1000, elevation: 300 },
      ],
    };
    expect(buildVertical(unordered, STA_START).issues).toMatchObject([{ code: 'InvalidProfile' }]);
  });
});
