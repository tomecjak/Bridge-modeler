/**
 * End-to-end test: referenčný most 212-00 (prehľadný výkres `fixtures/inbox/Vzorový most.pdf`, neverzuje sa).
 * Os cesty je syntetická priamka so sklonom −0,64 % cez km 9,307 81 / 318,512 m n. m. (rozhodnutie 2026-10-31);
 * súradnice sú vymyslené. Rozmery z výkresu: polia 16,00 + 23,00 + 16,00 m (kolmo 14,10 / 20,26 / 14,10),
 * NK 56,00 m, celková dĺžka 65,84 m (krídla 4,00 m, opora 0,84 m, medzera 0,08 m v osi mosta), šikmosť 68,71 g,
 * NK h = 1,20 m + vozovka 0,09 m, výška uloženia 0,45 m, horná hrana prahu opôr 316,772 a 316,417 m n. m.
 */
import type { AlignmentData } from '@bridge/alignment';
import { createAlignment } from '@bridge/alignment';
import {
  buildParameterSet,
  createEmptyProject,
  defaultAbutmentGeometry,
  type ProjectFile,
  type Superstructure,
  type Support,
} from '@bridge/model';
import {
  evaluateSpans,
  evaluateSupport,
  overallLength,
  type SupportContext,
  seatAt,
  singleDeckExample,
} from '@bridge/sections';
import { describe, expect, it } from 'vitest';
import { meshVolume } from './mesh.ts';
import { buildScene, createSceneCache } from './scene.ts';

const GRADE = -0.0064;
const STA1 = 9307.81;
const Z1 = 318.512;
const STATIONS = [9307.81, 9323.81, 9346.81, 9362.81];
/** 68,71 g → ° */
const ANGLE = (68.71 * 360) / 400;
const SIN = Math.sin((ANGLE * Math.PI) / 180);

function road(): AlignmentData {
  const staStart = 9250;
  const length = 200;
  const az = 1.1;
  const start = { x: -512345.6, y: -1187654.3 };
  const end = { x: start.x + length * Math.sin(az), y: start.y + length * Math.cos(az) };
  const z = (sta: number) => Z1 + GRADE * (sta - STA1);
  return {
    name: 'I/68 syntetická',
    staStart,
    length,
    horizontal: [{ kind: 'line', length, start, end }],
    stationEquations: [],
    profiles: [
      {
        name: 'niveleta',
        pvis: [
          { station: staStart, elevation: z(staStart) },
          { station: staStart + length, elevation: z(staStart + length) },
        ],
      },
    ],
  };
}

function project(): ProjectFile {
  const data = road();
  const ex = singleDeckExample(data.name, STA1 - 0.5, (STATIONS[3] as number) + 0.5, {
    deck: 'nk',
    profile: 'jt',
    axis: 'os',
  });
  const deck: Superstructure = {
    ...(ex.superstructures[0] as Superstructure),
    parameterLaws: {
      bL: { kind: 'constant', value: '8.25' },
      bR: { kind: 'constant', value: '8.25' },
      h: { kind: 'constant', value: '1.2' },
    },
  };
  const support = (i: number): Support => {
    const abutment = i === 0 || i === 3;
    return {
      id: `p${i + 1}`,
      name: String(i + 1),
      kind: abutment ? 'abutment' : 'pier',
      superstructure: 'nk',
      station: STATIONS[i] as number,
      crossingAngle: String(ANGLE),
      offset: '0',
      geometry: abutment
        ? {
            ...defaultAbutmentGeometry('20'),
            seatLength: '2.05',
            seatHeight: '1.1',
            frontOffset: '0.9',
            // 0,84 m od múrika po zadnú lícu je kótované v osi mosta → hrúbka kolmo na os opory
            backwallThickness: String(0.84 * SIN),
            gap: '0.08',
          }
        : { type: 'wall', thickness: '1.2', length: '7.5' },
      footing: abutment
        ? { length: '0', width: '0', thickness: '0' }
        : { length: '9', width: '6.5', thickness: '1.5' },
      connection: 'bearing',
      bearingHeight: '0.45',
      bearings: ['-1.25', '1.25'],
      // opory: prah priamo na pilótach (spodok prahu); piliere: základ z výkresu
      foundationTop: abutment
        ? String((i === 0 ? 316.772 : 316.417) - 1.1)
        : i === 1
          ? '311.07'
          : '311.18',
    };
  };
  return {
    ...createEmptyProject('212-00'),
    crs: { epsg: 5514, origin: { x: -512300, y: -1187600, z: 0 } },
    alignments: [data],
    bridgeAxes: ex.bridgeAxes,
    profiles: [ex.profile],
    superstructures: [deck],
    supports: [0, 1, 2, 3].map(support),
  };
}

function evaluate() {
  const p = project();
  const origin = p.crs.origin as NonNullable<ProjectFile['crs']['origin']>;
  const { alignment } = createAlignment(p.alignments[0] as AlignmentData, origin);
  const ctx: SupportContext = {
    alignments: new Map([[alignment.name, alignment]]),
    parameters: buildParameterSet([]),
    bridgeAxes: p.bridgeAxes,
    profiles: p.profiles,
    superstructures: p.superstructures,
  };
  const results = p.supports.map((s) => evaluateSupport(ctx, s));
  const deck = p.superstructures[0] as Superstructure;
  const sFrom = alignment.stationing.fromDisplay(deck.from) as number;
  const sTo = alignment.stationing.fromDisplay(deck.to) as number;
  return { p, alignment, results, deck, sFrom, sTo };
}

describe('referenčný most 212-00', () => {
  it('evaluates all supports without issues', () => {
    for (const r of evaluate().results) expect(r.issues, r.support.name).toEqual([]);
  });

  it('has spans 16 / 23 / 16 m along the axis and 14.10 / 20.26 / 14.10 m perpendicular', () => {
    const { results, deck } = evaluate();
    const spans = evaluateSpans(deck, results);
    expect(spans.issues.filter((i) => i.severity !== 'warning')).toEqual([]);
    expect(spans.spans.map((s) => s.length)).toEqual([
      expect.closeTo(16, 9),
      expect.closeTo(23, 9),
      expect.closeTo(16, 9),
    ]);
    // výkres má podpery s mierne rozdielnou šikmosťou (68,40 – 68,94 g), test používa 68,71 g pre všetky → ± 2 cm
    const perpendicular = spans.spans.map((s) => s.length * SIN);
    [14.1, 20.26, 14.1].forEach((v, i) => {
      expect(Math.abs((perpendicular[i] as number) - v)).toBeLessThanOrEqual(0.02);
    });
  });

  it('has a 56.00 m deck and a 65.84 m overall length to the wing ends', () => {
    const { results, sFrom, sTo } = evaluate();
    expect(sTo - sFrom).toBeCloseTo(56, 9);
    expect(overallLength(results, { sFrom, sTo })).toBeCloseTo(65.84, 6);
  });

  it('matches the abutment seat elevations of the drawing within 5 mm', () => {
    const { results, alignment } = evaluate();
    const seat = (i: number) =>
      seatAt(results[i] as (typeof results)[number], 0) + alignment.origin.z;
    expect(Math.abs(seat(0) - 316.772)).toBeLessThan(0.005);
    expect(Math.abs(seat(3) - 316.417)).toBeLessThan(0.005);
  });

  it('builds the whole bridge as closed solids', () => {
    const scene = buildScene(project(), createSceneCache());
    expect(scene.objects.map((o) => o.id)).toEqual(['nk', 'p1', 'p2', 'p3', 'p4']);
    for (const o of scene.objects) {
      expect(o.issues, o.id).toEqual([]);
      expect(meshVolume(o.mesh), o.id).toBeGreaterThan(0);
    }
  });
});
