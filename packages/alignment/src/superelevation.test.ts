import { describe, expect, it } from 'vitest';
import { SUPERELEVATION_TOLERANCE, superelevationDiagram } from './superelevation.ts';

describe('superelevation diagram (ADR 0022)', () => {
  it('builds full superelevation and transitions in continuous stations', () => {
    const r = superelevationDiagram(
      [
        {
          staStart: 1020,
          staEnd: 1060,
          beginRunout: 1005,
          beginRunoff: 1010,
          fullSuper: 1020,
          fullSuperelev: -4,
          runoff: 1060,
          startOfRunout: 1070,
          endOfRunout: 1075,
        },
        // oblúk bez údajov sa vynechá
        { staStart: 1100, staEnd: 1120 },
      ],
      1000,
      SUPERELEVATION_TOLERANCE,
    );
    expect(r.issues).toEqual([]);
    expect(r.segments).toEqual([
      { kind: 'transition', from: 5, to: 20 },
      { kind: 'full', from: 20, to: 60, q: -0.04 },
      { kind: 'transition', from: 60, to: 75 },
    ]);
  });

  it('takes the element range when the full superelevation stations are missing', () => {
    const r = superelevationDiagram(
      [{ staStart: 30, staEnd: 50, fullSuperelev: 2.5 }],
      0,
      SUPERELEVATION_TOLERANCE,
    );
    expect(r.segments).toEqual([{ kind: 'full', from: 30, to: 50, q: 0.025 }]);
  });

  it('rejects data shifted between curves as in the Civil 3D export 125-00', () => {
    const r = superelevationDiagram(
      [
        {
          staStart: 0,
          staEnd: 18.524803146286,
          beginRunout: 92.572026007482,
          beginRunoff: 98.341256776713,
          fullSuper: 107.572026007482,
          fullSuperelev: -4,
          runoff: 140.916261744502,
          startOfRunout: 151.884669038198,
        },
        { staStart: 107.572026009029, staEnd: 140.91626174129 },
        { staStart: 160, staEnd: 180, fullSuper: 175, runoff: 170, fullSuperelev: 3 },
        { staStart: 200, staEnd: 220, beginRunoff: 195 },
      ],
      0,
      SUPERELEVATION_TOLERANCE,
    );
    expect(r.segments).toBeUndefined();
    expect(r.issues.map((i) => i.code === 'SuperelevationInconsistent' && i.index)).toEqual([
      1, 3, 4,
    ]);
    expect(r.issues.every((i) => i.severity === 'warning')).toBe(true);
  });
});
