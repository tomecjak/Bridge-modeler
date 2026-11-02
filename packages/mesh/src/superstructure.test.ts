import { createAlignment, suggestOrigin } from '@bridge/alignment';
import { syntheticAlignmentData } from '@bridge/alignment/testing';
import { dot3, type Polygon2D, signedArea, sub3, type Vec2, type Vec3, vec2 } from '@bridge/geom';
import {
  buildParameterSet,
  defaultAbutmentGeometry,
  levelFoundation,
  type Superstructure,
} from '@bridge/model';
import {
  edgeBeamTemplate,
  evaluateSuperstructure,
  type SectionContext,
  type SuperstructureSection,
  sampleEdgeBeam,
  sampleSuperstructure,
  twinDeckExample,
} from '@bridge/sections';
import { evaluateSupportOnLine, type SupportOnLine } from '@bridge/sections/testing';
import { describe, expect, it } from 'vitest';
import { MeshKernel } from './kernel.ts';
import { meshVolume } from './mesh.ts';
import { sliceMesh } from './slice.ts';
import { edgeBeamMesh, superstructureMesh } from './superstructure.ts';

const kernel = new MeshKernel();
const data = syntheticAlignmentData(undefined, 1000);
const { alignment } = createAlignment(data, suggestOrigin(data));
const example = twinDeckExample(data.name, 1050, 1300, {
  left: 'L',
  right: 'P',
  profile: 'jednotram',
  leftAxis: 'osL',
  rightAxis: 'osP',
});
const ctx: SectionContext = {
  alignments: new Map([[data.name, alignment]]),
  parameters: buildParameterSet([]),
  bridgeAxes: example.bridgeAxes,
  profiles: [example.profile],
  planLines: [],
};
const deck = (id: string, changes: Partial<Superstructure> = {}): Superstructure => ({
  ...(example.superstructures.find((s) => s.id === id) as Superstructure),
  ...changes,
});

/** Najmenšia vzdialenosť bodu od uzavretých polyline. */
function distanceToLoops(p: Vec2, loops: readonly Polygon2D[]): number {
  let best = Infinity;
  for (const l of loops) {
    for (let i = 0; i < l.length; i++) {
      const a = l[i] as Vec2;
      const b = l[(i + 1) % l.length] as Vec2;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const t =
        len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
      best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
    }
  }
  return best;
}

/** Rez siete rovinou prierezu na staničení s, prevedený do roviny prierezu (x vpravo, y nahor). */
function meshCut(
  sup: Superstructure,
  mesh: ReturnType<typeof superstructureMesh>['mesh'],
  s: number,
) {
  const section = evaluateSuperstructure(ctx, sup, s);
  const axis = section.axis;
  if (!axis) throw new Error('no axis');
  const t = axis.frame.tangent;
  const n = axis.frame.normal;
  const up = sup.orientation === 'vertical' ? { x: 0, y: 0, z: 1 } : axis.frame.binormal;
  const th = Math.hypot(t.x, t.y);
  const normal = sup.orientation === 'vertical' ? { x: t.x / th, y: t.y / th, z: 0 } : t;
  const o = axis.point;
  const loops = sliceMesh(mesh, { origin: o, normal }).map((l) =>
    l.map((w: Vec3) => vec2(dot3(sub3(w, o), n), dot3(sub3(w, o), up))),
  );
  return { section, loops };
}

function expectCutMatchesSection(sup: Superstructure, stations: number[], tol: number) {
  const result = superstructureMesh(kernel, { ctx, superstructure: sup, supports: [] });
  expect(result.issues).toEqual([]);
  expect(meshVolume(result.mesh)).toBeGreaterThan(0);
  for (const s of stations) {
    const { section, loops } = meshCut(sup, result.mesh, s);
    expect(loops.length, `s = ${s}`).toBe(section.loops.length);
    for (const l of section.loops) {
      for (const p of l.polygon)
        expect(distanceToLoops(p, loops), `s = ${s}`).toBeLessThanOrEqual(tol);
    }
    const cutArea = loops.reduce((a, l) => a + Math.abs(signedArea(l)), 0);
    const sectionArea = section.loops.reduce((a, l) => a + Math.abs(signedArea(l.polygon)), 0);
    expect(Math.abs(cutArea - sectionArea) / sectionArea).toBeLessThanOrEqual(1e-3);
  }
  return result;
}

/** Pseudonáhodné staničenia (deterministické) vnútri NK. */
function randomStations(count: number, from: number, to: number): number[] {
  let seed = 12345;
  return Array.from({ length: count }, () => {
    seed = (seed * 16807) % 2147483647;
    return from + ((to - from) * seed) / 2147483647;
  });
}

const sFrom = alignment.stationing.fromDisplay(1050) as number;
const sTo = alignment.stationing.fromDisplay(1300) as number;

describe('rez 3D siete = 2D prierez (kritérium Fázy 5)', () => {
  it('matches the 2D section within 2 mm at 50 arbitrary stations (vertical orientation)', () => {
    expectCutMatchesSection(deck('L'), randomStations(50, sFrom + 0.5, sTo - 0.5), 0.002);
  });

  it('matches the 2D section within 2 mm at 50 arbitrary stations (normal to grade)', () => {
    expectCutMatchesSection(
      deck('P', { orientation: 'normalToGrade' }),
      randomStations(50, sFrom + 0.5, sTo - 0.5),
      0.002,
    );
  });

  it('matches exactly at the sample stations', () => {
    const sup = deck('L');
    const { stations } = superstructureMesh(kernel, { ctx, superstructure: sup, supports: [] });
    const inner = stations.slice(1, -1).filter((_, i) => i % 7 === 3);
    expectCutMatchesSection(sup, inner, 1e-6);
  });

  it('follows a jump in the deck depth with a sample just before the boundary', () => {
    const sup = deck('L', {
      parameterLaws: {
        ...deck('L').parameterLaws,
        h: {
          kind: 'piecewise',
          segments: [
            { from: 1050, to: 1150, v0: '1.7', v1: '1.7', shape: 'linear' },
            { from: 1150, to: 1300, v0: '2.2', v1: '2.2', shape: 'linear' },
          ],
        },
      },
    });
    // 149,9 m leží medzi vzorkami v oblúku → tolerancia tetivy; tesne pred skokom ešte h = 1,7
    expectCutMatchesSection(sup, [149.9, 149.999, 150, 150.2], 0.002);
  });
});

describe('šikmý koniec NK podľa opory', () => {
  it('turns the deck start parallel to a 70° abutment and keeps the other end square', () => {
    const sup = deck('L', { from: 1010, to: 1045 }); // priamka s = 0 … 50
    const abutment: SupportOnLine = {
      id: 'o1',
      name: 'O1',
      kind: 'abutment',
      superstructure: 'L',
      station: 1011,
      crossingAngle: '70',
      offset: '0',
      geometry: defaultAbutmentGeometry('16'),
      footing: { length: '17', width: '5', thickness: '1.5' },
      connection: 'bearing',
      bearingHeight: '0.35',
      bearings: ['-3', '3'],
      foundation: levelFoundation('240 - 1.5'),
    };
    const sctx = { ...ctx, superstructures: [sup] };
    const r = superstructureMesh(kernel, {
      ctx,
      superstructure: sup,
      supports: [evaluateSupportOnLine(sctx, abutment)],
    });
    expect(r.endAngles.start).toBeCloseTo((70 * Math.PI) / 180, 12);
    expect(r.endAngles.end).toBeCloseTo(Math.PI / 2, 12);

    const p = r.mesh.positions;
    const stations: { s: number; offset: number }[] = [];
    for (let i = 0; i < p.length; i += 3) {
      const pr = alignment.project(vec2(p[i] as number, p[i + 1] as number));
      if (pr) stations.push({ s: pr.s, offset: pr.offset });
    }
    const cot = 1 / Math.tan((70 * Math.PI) / 180);
    const axisOffset = -7.75;
    const s0 = alignment.stationing.fromDisplay(1010) as number;
    const s1 = alignment.stationing.fromDisplay(1045) as number;
    for (const q of stations) {
      const x = q.offset - axisOffset;
      // žiadny bod pred koncovou plochou, na konci kolmo
      expect(q.s).toBeGreaterThanOrEqual(s0 - x * cot - 1e-6);
      expect(q.s).toBeLessThanOrEqual(s1 + 1e-6);
    }
    // krajné body hornej plochy ležia na šikmej koncovej ploche
    const xs = stations.map((q) => q.offset - axisOffset);
    const right = Math.max(...xs);
    const left = Math.min(...xs);
    const sOf = (x: number) =>
      Math.min(
        ...stations.filter((q) => Math.abs(q.offset - axisOffset - x) < 1e-9).map((q) => q.s),
      );
    expect(sOf(right)).toBeCloseTo(s0 - right * cot, 6);
    expect(sOf(left)).toBeCloseTo(s0 - left * cot, 6);
    expect(meshVolume(r.mesh)).toBeGreaterThan(0);
  });
});

describe('edge beam mesh (ADR 0023)', () => {
  it('sweeps the edge beam along the deck: volume = ∫ A ds along its centroid ± 0.5 %', () => {
    const beam = {
      id: 'r',
      name: 'Rímsa',
      superstructure: 'L',
      side: 'left' as const,
      profile: 'rimsa',
      parameterLaws: {},
    };
    const withBeam: SectionContext = {
      ...ctx,
      profiles: [example.profile, edgeBeamTemplate('rimsa')],
      edgeBeams: [beam],
    };
    const r = edgeBeamMesh(kernel, {
      ctx: withBeam,
      superstructure: deck('L'),
      supports: [],
      beam,
    });
    expect(r.issues).toEqual([]);
    const samples = sampleSuperstructure(withBeam, deck('L'), []);
    if (!('sections' in samples)) throw new Error('NK sa nevyhodnotila');
    const segment = sampleEdgeBeam(withBeam, beam, samples);
    let expected = 0;
    for (let i = 1; i < segment.sections.length; i++) {
      const a = segment.sections[i - 1] as SuperstructureSection;
      const b = segment.sections[i] as SuperstructureSection;
      const ca = a.toWorld(a.centroid);
      const cb = b.toWorld(b.centroid);
      expected += ((a.area + b.area) / 2) * Math.hypot(cb.x - ca.x, cb.y - ca.y, cb.z - ca.z);
    }
    expect(expected).toBeGreaterThan(0.3 * 240);
    expect(Math.abs(meshVolume(r.mesh) / expected - 1)).toBeLessThan(0.005);
  });
});
