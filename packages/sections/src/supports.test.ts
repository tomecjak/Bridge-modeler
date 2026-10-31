import { type AlignmentData, createAlignment, suggestOrigin } from '@bridge/alignment';
import { syntheticAlignmentData } from '@bridge/alignment/testing';
import {
  buildParameterSet,
  defaultAbutmentGeometry,
  type Superstructure,
  type Support,
} from '@bridge/model';
import { describe, expect, it } from 'vitest';
import { deckTopAt, evaluateSupport, type SupportContext } from './supports.ts';
import { singleDeckExample } from './templates/singleBeamHaunched.ts';

const base = syntheticAlignmentData(undefined, 1000);
const example = singleDeckExample(base.name, 1020, 1400, { deck: 'nk', profile: 'pr', axis: 'ax' });

function context(
  data: AlignmentData = base,
  laws: Superstructure['parameterLaws'] = {},
): SupportContext {
  const { alignment } = createAlignment(data, suggestOrigin(base));
  return {
    alignments: new Map([[data.name, alignment]]),
    parameters: buildParameterSet([]),
    bridgeAxes: example.bridgeAxes,
    profiles: [example.profile],
    superstructures: [{ ...(example.superstructures[0] as Superstructure), parameterLaws: laws }],
  };
}

const pier = (changes: Partial<Support> = {}): Support => ({
  id: 'p1',
  name: 'P1',
  kind: 'pier',
  superstructure: 'nk',
  station: 1060,
  crossingAngle: '90',
  offset: '0',
  geometry: { type: 'wall', thickness: '1.2', length: '6' },
  footing: { length: '8', width: '4', thickness: '1.2' },
  connection: 'bearing',
  bearingHeight: '0.35',
  bearings: ['-1.8', '1.8'],
  foundationTop: '240',
  ...changes,
});

describe('evaluateSupport — výška podpery', () => {
  it('computes seat and height under each bearing from the deck soffit', () => {
    const ctx = context();
    const r = evaluateSupport(ctx, pier());
    expect(r.issues).toEqual([]);
    const axisZ = r.axis?.point.z ?? Number.NaN;
    // spodok NK rovnobežný s vrchom: y = −h − q·x (h = 1,7, q = 4,5 %)
    const [left, right] = r.bearings;
    expect(left?.soffit).toBeCloseTo(axisZ - 1.7 + 0.045 * 1.8, 9);
    expect(right?.soffit).toBeCloseTo(axisZ - 1.7 - 0.045 * 1.8, 9);
    expect(right?.seat).toBeCloseTo((right?.soffit ?? 0) - 0.35, 12);
    expect(right?.height).toBeCloseTo((right?.seat ?? 0) - 240, 12);
    expect(r.height.min).toBeCloseTo(right?.height ?? 0, 12);
    expect(r.height.max).toBeCloseTo(left?.height ?? 0, 12);
  });

  it('recomputes heights when the grade line changes (niveleta +0,5 m → výška +0,5 m)', () => {
    const before = evaluateSupport(context(), pier());
    const raised: AlignmentData = {
      ...base,
      profiles: base.profiles.map((p) => ({
        ...p,
        pvis: p.pvis.map((v) => ({ ...v, elevation: v.elevation + 0.5 })),
      })),
    };
    const after = evaluateSupport(context(raised), pier());
    after.bearings.forEach((b, i) => {
      expect(b.seat - (before.bearings[i]?.seat ?? 0)).toBeCloseTo(0.5, 9);
      expect(b.height - (before.bearings[i]?.height ?? 0)).toBeCloseTo(0.5, 9);
    });
  });

  it('recomputes heights when the deck depth changes (h 1,7 → 1,9 m → výška −0,2 m)', () => {
    const before = evaluateSupport(context(), pier());
    const after = evaluateSupport(context(base, { h: { kind: 'constant', value: '1.9' } }), pier());
    after.bearings.forEach((b, i) => {
      expect(b.height - (before.bearings[i]?.height ?? 0)).toBeCloseTo(-0.2, 9);
    });
  });
});

describe('evaluateSupport — šikmosť (uhol kríženia)', () => {
  it('rotates the support axis by the crossing angle counter-clockwise from the bridge axis', () => {
    const r = evaluateSupport(context(), pier({ crossingAngle: '70' }));
    expect(r.issues).toEqual([]);
    const tx = r.axis?.frame.tangent.x ?? 0;
    const ty = r.axis?.frame.tangent.y ?? 0;
    const d = r.direction;
    const angle = Math.atan2(tx * d.y - ty * d.x, tx * d.x + ty * d.y); // kladný = proti smeru hodín
    expect((angle * 180) / Math.PI).toBeCloseTo(70, 9);
  });

  it('places a bearing on the right on a smaller station and keeps its perpendicular offset', () => {
    const r = evaluateSupport(context(), pier({ crossingAngle: '70' }));
    const right = r.bearings[1];
    const cot = 1 / Math.tan((70 * Math.PI) / 180);
    expect(right?.station).toBeCloseTo(1060 - 1.8 * cot, 9);
    // kolmá vzdialenosť od osi NK = 1,8 m vpravo
    const n = r.axis?.frame.normal ?? { x: 0, y: 0 };
    const p = r.axis?.point ?? { x: 0, y: 0 };
    const rel = { x: (right?.plan.x ?? 0) - p.x, y: (right?.plan.y ?? 0) - p.y };
    expect(rel.x * n.x + rel.y * n.y).toBeCloseTo(1.8, 6);
  });

  it('a perpendicular support has all bearings on the same station', () => {
    const r = evaluateSupport(context(), pier());
    expect(r.bearings.map((b) => b.station)).toEqual([1060, 1060]);
  });
});

describe('evaluateSupport — problémy', () => {
  it('reports non-positive heights, invalid angles and bearings outside the deck soffit', () => {
    expect(
      evaluateSupport(context(), pier({ foundationTop: '400' })).issues.map((i) => i.code),
    ).toContain('NonPositiveSupportHeight');
    expect(evaluateSupport(context(), pier({ crossingAngle: '0' })).issues).toMatchObject([
      { code: 'InvalidCrossingAngle', owner: { kind: 'support', name: 'P1' } },
    ]);
    expect(evaluateSupport(context(), pier({ bearings: ['9'] })).issues).toMatchObject([
      { code: 'BearingOutsideDeck', index: 0, x: 9 },
    ]);
  });

  it('reports stations outside the deck and unknown decks', () => {
    expect(evaluateSupport(context(), pier({ station: 1500 })).issues).toMatchObject([
      { code: 'StationOutsideSuperstructure' },
    ]);
    expect(evaluateSupport(context(), pier({ superstructure: 'x' })).issues).toMatchObject([
      { code: 'UnknownSuperstructure', id: 'x' },
    ]);
  });

  it('reports expression errors with the field', () => {
    expect(evaluateSupport(context(), pier({ bearingHeight: '0.3 +' })).issues).toMatchObject([
      { code: 'ExpressionError', field: 'bearingHeight' },
    ]);
  });
});

describe('evaluateSupport — opora pri šikmom konci NK', () => {
  it('accepts an abutment bearing beyond the deck station that lies inside the skewed deck end', () => {
    const ctx = context();
    // NK od km 1,020; opora 1 m za začiatkom s uhlom 60° → ložisko vpravo (x = 1,8) na km 1,018 96
    const r = evaluateSupport(
      ctx,
      pier({
        kind: 'abutment',
        station: 1021,
        crossingAngle: '60',
        geometry: defaultAbutmentGeometry(),
      }),
    );
    expect(r.issues).toEqual([]);
    const right = r.bearings.find((b) => b.x === 1.8);
    expect(right?.station).toBeCloseTo(1021 - 1.8 / Math.tan(Math.PI / 3), 9);
    expect(right?.station).toBeLessThan(1020);
  });

  it('still rejects a pier bearing outside the deck', () => {
    const r = evaluateSupport(context(), pier({ station: 1021, crossingAngle: '60' }));
    expect(r.issues.some((i) => i.code === 'StationOutsideSuperstructure')).toBe(true);
  });
});

describe('evaluateSupport — bez základu', () => {
  it('accepts a zero footing thickness (seat on piles) and skips footing length and width', () => {
    const r = evaluateSupport(
      context(),
      pier({ footing: { length: '0', width: '0', thickness: '0' } }),
    );
    expect(r.issues).toEqual([]);
    expect(r.footing.thickness).toBe(0);
  });

  it('rejects a negative footing thickness', () => {
    const r = evaluateSupport(
      context(),
      pier({ footing: { length: '8', width: '4', thickness: '-1' } }),
    );
    expect(r.issues).toContainEqual(
      expect.objectContaining({ code: 'InvalidDimension', name: 'footing.thickness' }),
    );
  });
});

describe('evaluateSupport — opora a koniec NK', () => {
  const abutment = (changes: Partial<Support> = {}) =>
    pier({ kind: 'abutment', station: 1021, geometry: defaultAbutmentGeometry(), ...changes });

  it('records the nearer deck end with its top surface and grade', () => {
    const ctx = context();
    const r = evaluateSupport(ctx, abutment());
    expect(r.issues).toEqual([]);
    const end = r.deckEnd;
    expect(end?.side).toBe('start');
    const al = ctx.alignments.get(base.name);
    expect(end?.s).toBeCloseTo(al?.stationing.fromDisplay(1020) ?? Number.NaN, 12);
    // referenčný bod prierezu leží na hornom povrchu v osi
    const axisZ = al?.evaluate(end?.s ?? 0).point.z ?? Number.NaN;
    expect(end && deckTopAt(end, 0)).toBeCloseTo(axisZ - 0.09, 9);
    // mimo šírky NK výška okraja
    const left = end?.top[0];
    expect(end && left && deckTopAt(end, left.x - 5)).toBe(left?.z);
    const xs = end?.top.map((p) => p.x) ?? [];
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(end?.grade).toBeCloseTo(al?.evaluate(end?.s ?? 0).grade ?? Number.NaN, 12);

    const far = evaluateSupport(ctx, abutment({ station: 1399 }));
    expect(far.deckEnd?.side).toBe('end');
  });

  it('evaluates and checks the backwall and wing dimensions', () => {
    const r = evaluateSupport(context(), abutment());
    expect(r.dimensions).toMatchObject({ seatHeight: 1.1, gap: 0.08, wingAngle: 0, wingLength: 4 });
    const bad = evaluateSupport(
      context(),
      abutment({
        geometry: {
          ...defaultAbutmentGeometry(),
          wings: { ...defaultAbutmentGeometry().wings, angle: '90' },
        },
      }),
    );
    expect(bad.issues).toContainEqual(
      expect.objectContaining({ code: 'InvalidDimension', name: 'wingAngle' }),
    );
  });

  it('has no deck end for a pier', () => {
    expect(evaluateSupport(context(), pier()).deckEnd).toBeUndefined();
  });
});
