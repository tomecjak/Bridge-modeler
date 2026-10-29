import { describe, expect, it } from 'vitest';
import { integrate, integrateVec2 } from './quadrature.ts';

describe('integrate (composite Gauss–Legendre)', () => {
  it('is exact for polynomials up to degree 15 on one segment', () => {
    const f = (t: number) => 16 * t ** 15 - 3 * t ** 2 + 1;
    expect(integrate(f, 0, 2, 1)).toBeCloseTo(2 ** 16 - 8 + 2, 9);
  });

  it('integrates cos to machine precision', () => {
    expect(integrate(Math.cos, 0, Math.PI / 2, 4)).toBeCloseTo(1, 15);
  });

  it('integrates a vector function component-wise', () => {
    const r = integrateVec2((t) => ({ x: Math.cos(t), y: Math.sin(t) }), 0, Math.PI, 4);
    expect(r.x).toBeCloseTo(0, 15);
    expect(r.y).toBeCloseTo(2, 14);
  });

  it('returns zero for an empty interval', () => {
    expect(integrate(Math.exp, 1, 1, 3)).toBe(0);
  });
});
