import { distance2, vec2 } from '@bridge/geom';
import { describe, expect, it } from 'vitest';
import { ArcSegment, LineSegment, SpiralSegment } from './segments.ts';

const toLocal = (s: SpiralSegment, t: number) => {
  // poloha v rámci začiatku prechodnice: x' pozdĺž počiatočnej dotyčnice, y' kolmo (vľavo pre ccw)
  const p = s.pointAt(t);
  const dx = p.x - s.start.x;
  const dy = p.y - s.start.y;
  const ux = Math.sin(s.startAzimuth);
  const uy = Math.cos(s.startAzimuth);
  return { along: dx * ux + dy * uy, across: ux * dy - uy * dx };
};

describe('LineSegment', () => {
  const line = new LineSegment(vec2(10, 20), vec2(13, 24));

  it('evaluates point, azimuth and zero curvature', () => {
    expect(line.length).toBe(5);
    expect(line.pointAt(2.5)).toEqual(vec2(11.5, 22));
    expect(line.azimuthAt(1)).toBeCloseTo(Math.atan2(3, 4), 15);
    expect(line.curvatureAt(1)).toBe(0);
  });

  it('projects a point onto the segment', () => {
    const r = line.project(vec2(10 + 4, 20 - 3)); // kolmo vpravo od začiatku o 5 m
    expect(r.t).toBeCloseTo(0, 12);
    expect(r.distance).toBeCloseTo(5, 12);
  });
});

describe('ArcSegment', () => {
  const R = 100;
  const quarter = (Math.PI * R) / 2;

  it('turns right (azimuth increases) for cw rotation', () => {
    // začiatok na sever od stredu → pohyb na východ, oblúk doprava
    const arc = new ArcSegment(vec2(0, R), vec2(0, 0), R, 'cw', quarter);
    const end = arc.pointAt(quarter);
    expect(end.x).toBeCloseTo(R, 10);
    expect(end.y).toBeCloseTo(0, 10);
    expect(arc.azimuthAt(0)).toBeCloseTo(Math.PI / 2, 15);
    expect(arc.azimuthAt(quarter)).toBeCloseTo(Math.PI, 14);
    expect(arc.curvatureAt(10)).toBeCloseTo(1 / R, 15);
  });

  it('turns left for ccw rotation', () => {
    const arc = new ArcSegment(vec2(0, R), vec2(0, 0), R, 'ccw', quarter);
    const end = arc.pointAt(quarter);
    expect(end.x).toBeCloseTo(-R, 10);
    expect(end.y).toBeCloseTo(0, 10);
    expect(arc.azimuthAt(0)).toBeCloseTo((3 * Math.PI) / 2, 15);
    expect(arc.curvatureAt(10)).toBeCloseTo(-1 / R, 15);
  });

  it('projects points inside and beyond the arc', () => {
    const arc = new ArcSegment(vec2(0, R), vec2(0, 0), R, 'cw', quarter);
    const p = arc.pointAt(40);
    const r = arc.project(vec2(p.x * 1.05, p.y * 1.05));
    expect(r.t).toBeCloseTo(40, 9);
    expect(r.distance).toBeCloseTo(0.05 * R, 9);
    expect(arc.project(vec2(-50, 80)).t).toBe(0);
  });
});

describe('SpiralSegment (clothoid)', () => {
  // Civil 3D: L = 90,000000180596, R = 290,000000025116 → totalX, totalY, theta z LandXML.
  const L = 90.000000180596;
  const R = 290.000000025116;
  const entry = new SpiralSegment(vec2(0, 0), 0.3, L, 0, -1 / R);

  it('matches Civil 3D clothoid parameters (X, Y, theta)', () => {
    const end = toLocal(entry, L);
    expect(end.along).toBeCloseTo(89.783535315247, 9);
    expect(end.across).toBeCloseTo(4.647172172931, 9);
    const theta = Math.abs(entry.azimuthAt(L) - entry.azimuthAt(0));
    expect(theta).toBeCloseTo((8.890724424273 * Math.PI) / 180, 12);
  });

  it('matches the Fresnel series of a clothoid from tangent', () => {
    const A2 = R * L;
    for (const l of [5, 20, 45.5, 77, L]) {
      const x =
        l - l ** 5 / (40 * A2 ** 2) + l ** 9 / (3456 * A2 ** 4) - l ** 13 / (599040 * A2 ** 6);
      const y =
        l ** 3 / (6 * A2) -
        l ** 7 / (336 * A2 ** 3) +
        l ** 11 / (42240 * A2 ** 5) -
        l ** 15 / (9676800 * A2 ** 7);
      const p = toLocal(entry, l);
      expect(Math.abs(p.along - x)).toBeLessThan(1e-10);
      expect(Math.abs(p.across - y)).toBeLessThan(1e-10);
    }
  });

  it('has linear curvature and continuous azimuth derivative', () => {
    expect(entry.curvatureAt(0)).toBe(0);
    expect(entry.curvatureAt(L / 2)).toBeCloseTo(-0.5 / R, 15);
    const h = 1e-4;
    const t = 33.3;
    const dAz = (entry.azimuthAt(t + h) - entry.azimuthAt(t - h)) / (2 * h);
    expect(dAz).toBeCloseTo(entry.curvatureAt(t), 9);
  });

  it('exit spiral (R → ∞) is the reversed entry spiral', () => {
    const exit = new SpiralSegment(vec2(0, 0), 0, L, 1 / R, 0);
    const chord = distance2(exit.pointAt(0), exit.pointAt(L));
    const entryChord = distance2(entry.pointAt(0), entry.pointAt(L));
    expect(chord).toBeCloseTo(entryChord, 10);
  });

  it('supports partial clothoids between two finite radii', () => {
    const s = new SpiralSegment(vec2(0, 0), 0, 60, 1 / 400, 1 / 200);
    // čiastková klotoida je úsek plnej klotoidy s rovnakým A² = L / (k1 − k0)
    const A2 = 60 / (1 / 200 - 1 / 400);
    const l0 = A2 / 400;
    const full = new SpiralSegment(vec2(0, 0), 0, l0 + 60, 0, (l0 + 60) / A2);
    const a = full.pointAt(l0);
    const b = full.pointAt(l0 + 60);
    expect(distance2(s.pointAt(0), s.pointAt(60))).toBeCloseTo(distance2(a, b), 9);
  });

  it('projects points to the nearest station', () => {
    for (const t of [0.5, 12, 44.4, 89]) {
      const p = entry.pointAt(t);
      const az = entry.azimuthAt(t);
      const off = vec2(p.x + 3 * Math.cos(az), p.y - 3 * Math.sin(az)); // 3 m vpravo
      const r = entry.project(off);
      expect(r.t).toBeCloseTo(t, 8);
      expect(r.distance).toBeCloseTo(3, 8);
    }
  });
});
