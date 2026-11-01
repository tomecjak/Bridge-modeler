import { createAlignment, suggestOrigin } from '@bridge/alignment';
import { syntheticAlignmentData } from '@bridge/alignment/testing';
import { type Vec2, vec2 } from '@bridge/geom';
import {
  type AbutmentGeometry,
  buildParameterSet,
  defaultAbutmentGeometry,
  type Superstructure,
  type Support,
} from '@bridge/model';
import { describe, expect, it } from 'vitest';
import {
  abutmentParts,
  overallLength,
  type SolidPart,
  seatFrontLine,
  transverseOffset,
} from './abutment.ts';
import { supportPlan } from './supportGeometry.ts';
import { deckTopAt, evaluateSupport, type SupportContext, type SupportResult } from './supports.ts';
import { singleDeckExample } from './templates/singleBeamHaunched.ts';

// NK od km 1,020 na priamke (s = 0 … 50 m syntetickej osi)
const data = syntheticAlignmentData(undefined, 1000);
const example = singleDeckExample(data.name, 1020, 1045, { deck: 'nk', profile: 'pr', axis: 'ax' });
const { alignment } = createAlignment(data, suggestOrigin(data));
const ctx: SupportContext = {
  alignments: new Map([[data.name, alignment]]),
  parameters: buildParameterSet([]),
  bridgeAxes: example.bridgeAxes,
  profiles: [example.profile],
  planLines: [],
  superstructures: example.superstructures as Superstructure[],
  bearingLines: [],
};

function abutment(
  angle = 90,
  geometry: Partial<AbutmentGeometry> = {},
  changes: Partial<Support> = {},
): SupportResult {
  const line = {
    id: 'l1',
    name: '1',
    superstructure: 'nk',
    station: 1020.5,
    crossingAngle: String(angle),
  };
  return evaluateSupport(
    { ...ctx, bearingLines: [line] },
    {
      id: 'o1',
      name: 'O1',
      kind: 'abutment',
      bearingLine: 'l1',
      offset: '0',
      geometry: { ...defaultAbutmentGeometry('16'), ...geometry },
      footing: { length: '0', width: '0', thickness: '0' },
      connection: 'bearing',
      bearingHeight: '0.45',
      bearings: ['-3', '3'],
      foundationTop: '0',
      ...changes,
    },
  );
}

const part = (parts: SolidPart[] | undefined, name: SolidPart['name'], i = 0) =>
  parts?.filter((p) => p.name === name)[i] as SolidPart;

/** Vzdialenosť bodu v osi mosta od bodu osi na staničení km 1,020 5 (+ v smere staničenia). */
function along(r: SupportResult, p: Vec2): number {
  const t = r.deckEnd?.tangent ?? vec2(0, 1);
  const o = r.axis?.point ?? { x: 0, y: 0 };
  return (p.x - o.x) * t.x + (p.y - o.y) * t.y;
}

describe('abutmentParts — kolmá opora', () => {
  // horná hrana základu = spodok prahu → plytká opora bez drieku
  const shallow = () => {
    const probe = abutment();
    const seat = Math.min(...probe.bearings.map((b) => b.seat));
    return abutment(90, {}, { foundationTop: String(seat - 1.1 + (alignment.origin.z ?? 0)) });
  };

  it('builds seat, backwall and two wings; no stem when the seat sits on the foundation', () => {
    const r = shallow();
    expect(r.issues).toEqual([]);
    expect(abutmentParts(r)?.map((p) => p.name)).toEqual(['seat', 'backwall', 'wing', 'wing']);
  });

  it('adds a stem when the foundation is lower than the seat bottom', () => {
    const r = abutment(90, {}, { foundationTop: '230' });
    const stem = part(abutmentParts(r), 'stem');
    expect(stem).toBeDefined();
    const p = stem.plan[0] as Vec2;
    expect(stem.bottom(p)).toBeCloseTo(230 - alignment.origin.z, 9);
    expect(stem.top(p)).toBeCloseTo(part(abutmentParts(r), 'seat').bottom(p), 12);
  });

  // zadná líca opory = zadná líca múrika: koniec NK 0,5 m za osou, medzera 0,08, múrik 0,5 (ADR 0018)
  const back = -0.5 - 0.08 - 0.5;

  it('places the seat from the backwall rear face to the front face 0.9 m into the span', () => {
    const r = shallow();
    const seat = part(abutmentParts(r), 'seat');
    const ws = seat.plan.map((p) => along(r, p));
    expect(Math.max(...ws)).toBeCloseTo(0.9, 9);
    expect(Math.min(...ws)).toBeCloseTo(back, 9);
    const xs = seat.plan.map((p) => transverseOffset(r, p));
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(16, 9);
    // vrch prahu = horná hrana podpery pri ložisku
    const b = r.bearings[0];
    expect(b && seat.top(b.plan)).toBeCloseTo(b?.seat ?? Number.NaN, 9);
    expect(b && seat.bottom(b.plan)).toBeCloseTo((b?.seat ?? 0) - 1.1, 9);
  });

  it('puts the backwall behind the deck end with the gap and up to the deck top', () => {
    const r = shallow();
    const wall = part(abutmentParts(r), 'backwall');
    const ws = wall.plan.map((p) => along(r, p));
    // koniec NK je 0,5 m za osou ložísk
    expect(Math.max(...ws)).toBeCloseTo(-0.5 - 0.08, 9);
    expect(Math.min(...ws)).toBeCloseTo(-0.5 - 0.08 - 0.5, 9);
    const end = r.deckEnd;
    const p = wall.plan.find((q) => along(r, q) > -0.6) as Vec2;
    const expected = (end ? deckTopAt(end, transverseOffset(r, p)) : 0) + (end?.grade ?? 0) * -0.08;
    expect(wall.top(p)).toBeCloseTo(expected, 9);
  });

  it('runs parallel wings 4 m back from the rear face and hangs them down to 1.5 m at the free end', () => {
    const r = shallow();
    const wing = part(abutmentParts(r), 'wing');
    const [r0, r1] = wing.plan as [Vec2, Vec2];
    expect(along(r, r0)).toBeCloseTo(back, 9);
    expect(along(r, r1)).toBeCloseTo(back - 4, 9);
    expect(transverseOffset(r, r1)).toBeCloseTo(transverseOffset(r, r0), 9);
    expect(wing.bottom(r1)).toBeCloseTo(wing.top(r1) - 1.5, 9);
    expect(wing.bottom(r0)).toBeCloseTo(part(abutmentParts(r), 'seat').bottom(r0), 9);
    // hrúbka krídla smerom k osi mosta
    const xs = wing.plan.map((p) => Math.abs(transverseOffset(r, p)));
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.6, 9);
    expect(Math.max(...xs)).toBeCloseTo(8, 9);
  });

  it('founds the wings on the foundation top on request', () => {
    const r = abutment(90, {
      wings: { ...defaultAbutmentGeometry().wings, support: 'founded' },
    });
    const wing = part(abutmentParts(r), 'wing', 1);
    expect(wing.bottom(wing.plan[1] as Vec2)).toBeCloseTo(r.foundationTop, 9);
  });

  it('splays the wings outward by the wing angle', () => {
    const r = abutment(90, { wings: { ...defaultAbutmentGeometry().wings, angle: '30' } });
    for (const i of [0, 1]) {
      const [r0, r1] = part(abutmentParts(r), 'wing', i).plan as [Vec2, Vec2];
      const back = along(r, r0) - along(r, r1);
      const out = Math.abs(transverseOffset(r, r1)) - Math.abs(transverseOffset(r, r0));
      expect(Math.atan2(out, back)).toBeCloseTo(Math.PI / 6, 9);
    }
  });

  it('measures the overall bridge length to the wing ends', () => {
    const r = shallow();
    const s = (station: number) => alignment.stationing.fromDisplay(station) as number;
    const total = overallLength([r], { sFrom: s(1020), sTo: s(1045) });
    expect(total).toBeCloseTo(s(1045) - (s(1020.5) + back - 4), 9);
  });

  it('shows the seat, backwall and wings in the plan and drops the footing when its thickness is 0', () => {
    const plan = supportPlan(shallow());
    expect(plan?.body).toHaveLength(4);
    expect(plan?.footing).toBeUndefined();
  });
});

describe('abutmentParts — šikmá opora', () => {
  it('keeps the backwall parallel to the skewed deck end with the gap measured along the bridge axis', () => {
    const angle = 61.84;
    const r = abutment(angle);
    expect(r.issues).toEqual([]);
    const cot = 1 / Math.tan((angle * Math.PI) / 180);
    const wall = part(abutmentParts(r), 'backwall');
    // predná líca: bod v priečnej polohe x je 0,08 m (v osi mosta) za šikmým koncom NK
    const front = [...wall.plan].sort(
      (a, b) =>
        along(r, b) + transverseOffset(r, b) * cot - (along(r, a) + transverseOffset(r, a) * cot),
    )[0] as Vec2;
    expect(along(r, front) + transverseOffset(r, front) * cot).toBeCloseTo(-0.5 - 0.08, 9);
  });

  it('measures the longitudinal dimensions along the bridge axis', () => {
    const angle = 61.84;
    const r = abutment(angle, { frontOffset: '0.9', backwallThickness: '0.84' });
    const sin = Math.sin((angle * Math.PI) / 180);
    const seat = part(abutmentParts(r), 'seat');
    // kolmo na os opory: (0,84 + 0,08 + 0,50 + 0,90) · sin α ≈ 2,05 (212-00)
    const f = vec2(r.direction.y, -r.direction.x);
    const ws = seat.plan.map((p) => p.x * f.x + p.y * f.y);
    expect(Math.max(...ws) - Math.min(...ws)).toBeCloseTo(2.32 * sin, 9);
    expect(2.32 * sin).toBeCloseTo(2.05, 2);
  });

  it('keeps parallel wings parallel to the bridge axis', () => {
    const r = abutment(61.84);
    const [r0, r1] = part(abutmentParts(r), 'wing').plan as [Vec2, Vec2];
    expect(transverseOffset(r, r1)).toBeCloseTo(transverseOffset(r, r0), 9);
    expect(along(r, r0) - along(r, r1)).toBeCloseTo(4, 9);
  });

  it('builds a monolithic wall centred on the bearing line from the deck soffit to the foundation', () => {
    const r = abutment(
      90,
      { construction: 'monolithic', wallThickness: '1.0' },
      { connection: 'fixed', bearingHeight: '0', foundationTop: '230' },
    );
    expect(r.issues).toEqual([]);
    const parts = abutmentParts(r);
    expect(parts?.map((p) => p.name)).toEqual(['stem', 'wing', 'wing']);
    const wall = part(parts, 'stem');
    const ws = wall.plan.map((p) => along(r, p));
    expect(Math.min(...ws)).toBeCloseTo(-0.5, 9);
    expect(Math.max(...ws)).toBeCloseTo(0.5, 9);
    const b = r.bearings[0];
    expect(b && wall.top(b.plan)).toBeCloseTo(b?.soffit ?? Number.NaN, 9);
    expect(wall.bottom(wall.plan[0] as Vec2)).toBeCloseTo(230 - alignment.origin.z, 9);
    // krídlo začína na zadnej líci steny, predná líca steny určuje premostenie
    expect(along(r, part(parts, 'wing').plan[0] as Vec2)).toBeCloseTo(-0.5, 9);
    const front = seatFrontLine(r);
    expect(front && along(r, front.point)).toBeCloseTo(0.5, 9);
    // telo v pôdoryse je stena
    expect(supportPlan(r)?.body).toHaveLength(3);
  });

  it('is undefined for a pier', () => {
    const pier = abutment(
      90,
      {},
      { kind: 'pier', geometry: { type: 'wall', thickness: '1.2', length: '6' } },
    );
    expect(abutmentParts(pier)).toBeUndefined();
  });
});
