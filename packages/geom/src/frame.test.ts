import { describe, expect, it } from 'vitest';
import { frameFromAzimuthGrade } from './frame.ts';
import { cross3, dot3, length3, vec3 } from './vec.ts';

describe('frameFromAzimuthGrade', () => {
  it('points normal to the right and binormal up for a level northbound frame', () => {
    const f = frameFromAzimuthGrade(vec3(1, 2, 3), 0, 0);
    expect(f.origin).toEqual(vec3(1, 2, 3));
    expect(f.tangent.y).toBeCloseTo(1, 15);
    expect(f.normal.x).toBeCloseTo(1, 15);
    expect(f.binormal.z).toBeCloseTo(1, 15);
  });

  it('is orthonormal and right-handed for any azimuth and grade', () => {
    for (let i = 0; i < 200; i++) {
      const azimuth = (i * 0.731) % (2 * Math.PI);
      const grade = ((i % 21) - 10) * 0.012;
      const f = frameFromAzimuthGrade(vec3(0, 0, 0), azimuth, grade);
      for (const v of [f.tangent, f.normal, f.binormal]) expect(length3(v)).toBeCloseTo(1, 14);
      expect(dot3(f.tangent, f.normal)).toBeCloseTo(0, 14);
      expect(dot3(f.tangent, f.binormal)).toBeCloseTo(0, 14);
      expect(f.normal.z).toBe(0);
      const t = cross3(f.binormal, f.normal);
      expect(t.x).toBeCloseTo(f.tangent.x, 14);
      expect(t.y).toBeCloseTo(f.tangent.y, 14);
      expect(t.z).toBeCloseTo(f.tangent.z, 14);
      expect(f.tangent.z / Math.hypot(f.tangent.x, f.tangent.y)).toBeCloseTo(grade, 14);
    }
  });
});
