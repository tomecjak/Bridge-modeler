/**
 * Fixture: rez E–E dvojice NK rýchlostnej cesty R2 (výkres `fixtures/inbox/Dvojica NK.png`, M 1:100).
 * Kóty v mm z výkresu; obrázok sa neverzuje. Šírky betónu sú bez presahov ríms (400 a 350 mm patria rímsam).
 */
import { createAlignment, suggestOrigin } from '@bridge/alignment';
import { syntheticAlignmentData } from '@bridge/alignment/testing';
import { buildParameterSet, type Superstructure } from '@bridge/model';
import { describe, expect, it } from 'vitest';
import {
  evaluateSuperstructure,
  type SectionContext,
  singleDeckExample,
  twinDeckExample,
} from '../src/index.ts';

const mm = (v: number) => v / 1000;
const TOL = 1e-9;

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
const deck = (id: string) => example.superstructures.find((s) => s.id === id) as Superstructure;

/** y priamky cez dva body v danom x */
function lineY(a: { x: number; y: number }, b: { x: number; y: number }, x: number): number {
  return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
}

function section(id: string) {
  const r = evaluateSuperstructure(ctx, deck(id), 100);
  expect(r.issues).toEqual([]);
  const p = (name: string) => {
    const v = r.points.get(name);
    if (!v) throw new Error(`missing point ${name}`);
    return v;
  };
  return { r, p };
}

const DECKS = [
  { id: 'L', name: 'ľavá NK', width: 14650, left: 4850, bottom: 5000, right: 4800 },
  { id: 'P', name: 'pravá NK', width: 13050, left: 4550, bottom: 4000, right: 4500 },
];

describe('rez E–E dvojice NK — kóty z výkresu', () => {
  for (const d of DECKS) {
    describe(d.name, () => {
      it(`šírka betónu ${d.width} a spodok ${d.left} + ${d.bottom} + ${d.right}`, () => {
        const { p } = section(d.id);
        expect(p('TR').x - p('TL').x).toBeCloseTo(mm(d.width), 9);
        expect(p('BL').x - p('TL').x).toBeCloseTo(mm(d.left), 9);
        expect(p('BR').x - p('BL').x).toBeCloseTo(mm(d.bottom), 9);
        expect(p('TR').x - p('BR').x).toBeCloseTo(mm(d.right), 9);
      });

      it('os NK je v strede spodnej šírky trámu', () => {
        const { p } = section(d.id);
        expect((p('BL').x + p('BR').x) / 2).toBeCloseTo(0, 12);
      });

      it('výška v osi 1 700 zvislo, s vozovkou 90 spolu 1 790', () => {
        const { r, p } = section(d.id);
        const bottomAtAxis = lineY(p('BL'), p('BR'), 0);
        expect(0 - bottomAtAxis).toBeCloseTo(mm(1700), 9);
        // os mosta leží na hornom povrchu betónu 90 mm pod niveletou
        const pavement = -(r.axis?.verticalOffset ?? Number.NaN);
        expect(pavement).toBeCloseTo(mm(90), 12);
        expect(pavement + (0 - bottomAtAxis)).toBeCloseTo(mm(1790), 9);
      });

      it('konzola 200 na konci a 500 pri nábehu (zvislo)', () => {
        const { p } = section(d.id);
        expect(p('TL').y - p('EL').y).toBeCloseTo(mm(200), 9);
        expect(p('TR').y - p('ER').y).toBeCloseTo(mm(200), 9);
        expect(lineY(p('TL'), p('TR'), p('NL').x) - p('NL').y).toBeCloseTo(mm(500), 9);
        expect(lineY(p('TL'), p('TR'), p('NR').x) - p('NR').y).toBeCloseTo(mm(500), 9);
      });

      it('priečny sklon 4,5 % a spodok rovnobežný s vozovkou', () => {
        const { p } = section(d.id);
        expect((p('TL').y - p('TR').y) / (p('TR').x - p('TL').x)).toBeCloseTo(0.045, 12);
        expect((p('BL').y - p('BR').y) / (p('BR').x - p('BL').x)).toBeCloseTo(0.045, 12);
      });

      it('obrys je uzavretý, bez samopretínania, s kladnou plochou', () => {
        const { r } = section(d.id);
        expect(r.loops).toHaveLength(1);
        expect(r.area).toBeGreaterThan(5);
        expect(r.area).toBeLessThan(15);
      });
    });
  }

  it('medzera medzi betónom oboch NK 350 + 100 + 100 + 350 = 900 (os R2 uprostred)', () => {
    const left = section('L');
    const right = section('P');
    const leftEdge = left.r.toWorld(left.p('TR'));
    const rightEdge = right.r.toWorld(right.p('TL'));
    expect(Math.hypot(rightEdge.x - leftEdge.x, rightEdge.y - leftEdge.y)).toBeCloseTo(mm(900), 6);
    const road = alignment.evaluate(100);
    const mid = { x: (leftEdge.x + rightEdge.x) / 2, y: (leftEdge.y + rightEdge.y) / 2 };
    expect(Math.hypot(mid.x - road.point.x, mid.y - road.point.y)).toBeLessThan(TOL + 1e-6);
  });

  it('vodorovný spodok, ak spodokRovnobezny = 0', () => {
    const sup = {
      ...deck('L'),
      parameterLaws: {
        ...deck('L').parameterLaws,
        spodokRovnobezny: { kind: 'constant' as const, value: '0' },
      },
    };
    const r = evaluateSuperstructure(ctx, sup, 100);
    const bl = r.points.get('BL');
    const br = r.points.get('BR');
    expect(bl?.y).toBeCloseTo(br?.y ?? Number.NaN, 12);
    expect(bl?.y).toBeCloseTo(-mm(1700), 12);
  });

  it('1 000 vyhodnotení prierezu trvá menej ako 100 ms (odozva náhľadu)', () => {
    const sup = deck('L');
    evaluateSuperstructure(ctx, sup, 100); // zahriatie
    const start = performance.now();
    for (let i = 0; i < 1000; i++) evaluateSuperstructure(ctx, sup, 60 + (i % 200));
    const elapsed = performance.now() - start;
    console.info(`1 000 prierezov: ${elapsed.toFixed(1)} ms`);
    expect(elapsed).toBeLessThan(100);
  });
});

describe('singleDeckExample', () => {
  it('creates one deck on the road axis 90 mm below the grade line', () => {
    const single = singleDeckExample(data.name, 1050, 1300, {
      deck: 'N',
      profile: 'pr',
      axis: 'ax',
    });
    const r = evaluateSuperstructure(
      { ...ctx, bridgeAxes: single.bridgeAxes, profiles: [single.profile] },
      single.superstructures[0] as Superstructure,
      100,
    );
    expect(r.issues).toEqual([]);
    const road = alignment.evaluate(100);
    const ref = r.toWorld({ x: 0, y: 0 });
    expect(Math.hypot(ref.x - road.point.x, ref.y - road.point.y)).toBeLessThan(1e-9);
    expect(ref.z).toBeCloseTo(road.point.z - 0.09, 12);
  });
});
