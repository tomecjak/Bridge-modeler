import { createAlignment, suggestOrigin } from '@bridge/alignment';
import { syntheticAlignmentData } from '@bridge/alignment/testing';
import { type Polygon2D, pointInPolygon, signedArea, vec2 } from '@bridge/geom';
import {
  buildParameterSet,
  defaultAbutmentGeometry,
  type Superstructure,
  type Support,
} from '@bridge/model';
import {
  abutmentParts,
  BEARING_PLAN_SIZE,
  evaluateSupport,
  type SupportContext,
  type SupportResult,
  seatAt,
  singleDeckExample,
  supportPlan,
} from '@bridge/sections';
import { describe, expect, it } from 'vitest';
import { MeshKernel } from './kernel.ts';
import { meshBounds, meshVolume } from './mesh.ts';
import { supportMesh } from './supports.ts';

const kernel = new MeshKernel();
const data = syntheticAlignmentData(undefined, 1000);
const example = singleDeckExample(data.name, 1020, 1400, { deck: 'nk', profile: 'pr', axis: 'ax' });
const { alignment } = createAlignment(data, suggestOrigin(data));
const ctx: SupportContext = {
  alignments: new Map([[data.name, alignment]]),
  parameters: buildParameterSet([]),
  bridgeAxes: example.bridgeAxes,
  profiles: [example.profile],
  planLines: [],
  superstructures: example.superstructures as Superstructure[],
};

const pier = (changes: Partial<Support> = {}): SupportResult =>
  evaluateSupport(ctx, {
    id: 'p1',
    name: 'P1',
    kind: 'pier',
    superstructure: 'nk',
    station: 1040,
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

/** Objem drieku numericky: ∫∫ (horná hrana − základ) dA po pôdoryse (mriežka 1 cm). */
function bodyVolume(r: SupportResult): number {
  const plan = supportPlan(r) as { body: Polygon2D[] };
  const axis = r.axis as NonNullable<SupportResult['axis']>;
  const n = axis.frame.normal;
  const step = 0.01;
  let v = 0;
  for (const poly of plan.body) {
    const xs = poly.map((p) => p.x);
    const ys = poly.map((p) => p.y);
    for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) {
      for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) {
        if (!pointInPolygon(vec2(x, y), poly)) continue;
        const across = (x - axis.point.x) * n.x + (y - axis.point.y) * n.y;
        v += (seatAt(r, across) - r.foundationTop) * step * step;
      }
    }
  }
  return v;
}

function expectSupportVolume(r: SupportResult) {
  expect(r.issues).toEqual([]);
  const mesh = supportMesh(kernel, r);
  const footing = r.footing.length * r.footing.width * r.footing.thickness;
  const bearings = r.bearings.reduce((a, b) => a + BEARING_PLAN_SIZE ** 2 * (b.soffit - b.seat), 0);
  expect(meshVolume(mesh)).toBeCloseTo(footing + bodyVolume(r) + bearings, 1);
  return mesh;
}

describe('supportMesh', () => {
  it('builds footing, wall with a sloped top following the seats, and bearings', () => {
    const r = pier();
    // spodok NK má priečny sklon → horné hrany pri ložiskách sa líšia
    expect(r.bearings[0]?.seat).not.toBeCloseTo(r.bearings[1]?.seat ?? 0, 3);
    const mesh = expectSupportVolume(r);
    const b = meshBounds(mesh);
    expect(b?.min.z).toBeCloseTo(r.foundationTop - 1.2, 9);
    expect(b?.max.z).toBeCloseTo(Math.max(...r.bearings.map((x) => x.soffit)), 9);
  });

  it('builds a skewed wall pier', () => {
    expectSupportVolume(pier({ crossingAngle: '70' }));
  });

  it('builds circular and rectangular columns', () => {
    const columns = (shape: 'circle' | 'rect') =>
      pier({
        geometry: {
          type: 'columns',
          shape,
          diameter: '1.2',
          width: '1.2',
          depth: '1',
          count: '2',
          spacing: '3.6',
        },
      });
    expectSupportVolume(columns('circle'));
    expectSupportVolume(columns('rect'));
  });

  it('skips bearings for a fixed connection and stays empty for an unevaluated support', () => {
    const fixed = pier({ connection: 'fixed', bearingHeight: '0' });
    const mesh = expectSupportVolume(fixed);
    expect(meshBounds(mesh)?.max.z).toBeCloseTo(Math.max(...fixed.bearings.map((x) => x.seat)), 9);
    const broken = pier({ superstructure: 'missing' });
    expect(supportMesh(kernel, broken).indices).toHaveLength(0);
  });

  it('keeps the footing plan from supportPlan', () => {
    const r = pier({ crossingAngle: '70' });
    const plan = supportPlan(r) as { footing: Polygon2D };
    expect(Math.abs(signedArea(plan.footing))).toBeCloseTo(32, 9);
  });
});

describe('supportMesh — opora', () => {
  const abutment = (changes: Partial<Support> = {}) =>
    pier({
      kind: 'abutment',
      station: 1021,
      crossingAngle: '70',
      geometry: defaultAbutmentGeometry('16'),
      footing: { length: '0', width: '0', thickness: '0' },
      foundationTop: '238',
      ...changes,
    });

  /** Objem častí numericky: ∫∫ (vrch − spodok) dA po pôdoryse každej časti (mriežka 1 cm). */
  function partsVolume(r: SupportResult): number {
    const step = 0.01;
    let v = 0;
    for (const part of abutmentParts(r) ?? []) {
      const xs = part.plan.map((p) => p.x);
      const ys = part.plan.map((p) => p.y);
      for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) {
        for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) {
          const p = vec2(x, y);
          if (pointInPolygon(p, part.plan)) v += (part.top(p) - part.bottom(p)) * step * step;
        }
      }
    }
    return v;
  }

  it('builds seat, stem, backwall and hung wings of a skewed abutment without a footing', () => {
    const r = abutment();
    expect(r.issues).toEqual([]);
    expect(abutmentParts(r)?.map((p) => p.name)).toEqual([
      'seat',
      'stem',
      'backwall',
      'wing',
      'wing',
    ]);
    const mesh = supportMesh(kernel, r);
    const bearings = r.bearings.reduce(
      (a, b) => a + BEARING_PLAN_SIZE ** 2 * (b.soffit - b.seat),
      0,
    );
    expect(meshVolume(mesh)).toBeCloseTo(partsVolume(r) + bearings, 0);
    expect(meshBounds(mesh)?.min.z).toBeCloseTo(r.foundationTop, 9);
  });

  it('reaches the deck top with the backwall and wings', () => {
    const r = abutment();
    const parts = abutmentParts(r) ?? [];
    const highest = Math.max(...parts.flatMap((part) => part.plan.map((p) => part.top(p))));
    expect(meshBounds(supportMesh(kernel, r))?.max.z).toBeCloseTo(highest, 9);
  });
});
