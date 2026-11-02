import { createAlignment, suggestOrigin } from '@bridge/alignment';
import { syntheticAlignmentData } from '@bridge/alignment/testing';
import { isCounterClockwise, type Vec2 } from '@bridge/geom';
import { buildParameterSet, type EdgeBeam, type Superstructure } from '@bridge/model';
import { describe, expect, it } from 'vitest';
import { deckChecks } from './deckChecks.ts';
import { sampleSuperstructure } from './deckSampling.ts';
import {
  deckEdge,
  deckWidthRange,
  deckWidths,
  edgeBeamEdges,
  evaluateEdgeBeam,
  FREE_WIDTH_TOLERANCE,
  freeWidthIssues,
  sampleEdgeBeam,
} from './edgeBeam.ts';
import { evaluateProfileDefinition, profileParameterValues } from './profile.ts';
import { evaluateSuperstructure, type SectionContext } from './superstructure.ts';
import { crossbeamBlock } from './templates/catalog.ts';
import { DECK_SLOPE_VARIABLE, EDGE_BEAM_TYPOLOGY, edgeBeamTemplate } from './templates/edgeBeam.ts';
import { singleDeckExample } from './templates/singleBeamHaunched.ts';

const data = syntheticAlignmentData(undefined, 1000);
const { alignment } = createAlignment(data, suggestOrigin(data));
const example = singleDeckExample(data.name, 1050, 1300, { deck: 'nk', profile: 'pr', axis: 'ax' });
const rimsa = edgeBeamTemplate('rimsa');

const beam = (side: EdgeBeam['side'], laws: Record<string, string> = {}): EdgeBeam => ({
  id: `r-${side}`,
  name: side === 'left' ? 'Rímsa vľavo' : 'Rímsa vpravo',
  superstructure: 'nk',
  side,
  profile: 'rimsa',
  parameterLaws: Object.fromEntries(
    Object.entries(laws).map(([k, v]) => [k, { kind: 'constant' as const, value: v }]),
  ),
});

/** NK z príkladu s priečnym sklonom q (kladný = klesá doprava). */
function deck(q: number): Superstructure {
  const sup = example.superstructures[0] as Superstructure;
  return { ...sup, parameterLaws: { q: { kind: 'constant', value: String(q) } } };
}

function context(edgeBeams: EdgeBeam[] = [], extra: Partial<SectionContext> = {}): SectionContext {
  return {
    alignments: new Map([[data.name, alignment]]),
    parameters: buildParameterSet([]),
    bridgeAxes: example.bridgeAxes,
    profiles: [example.profile, rimsa],
    planLines: [],
    edgeBeams,
    ...extra,
  };
}

const point = (p: Map<string, Vec2>, name: string): Vec2 => {
  const v = p.get(name);
  if (!v) throw new Error(`chýba bod ${name}`);
  return v;
};

const DEFAULTS = { b: 0.9, c: 0.35, hI: 0.25, hN: 0.4, p: 0.04 };

describe('edge beam template', () => {
  it('is an L shape with a nose over the deck edge, evaluated with the deck slope qNK', () => {
    expect(rimsa.typology).toBe(EDGE_BEAM_TYPOLOGY);
    const qNK = 0.03;
    const globals = (n: string) => (n === DECK_SLOPE_VARIABLE ? qNK : undefined);
    const values = profileParameterValues(rimsa, {}, globals, 0);
    expect(values.issues).toEqual([]);
    const r = evaluateProfileDefinition(rimsa, values.values, globals, 0);
    expect(r.issues).toEqual([]);
    const { b, c, hI, hN, p } = DEFAULTS;
    const ib = point(r.points, 'IB');
    expect(ib.x).toBeCloseTo(-(b - c), 12);
    // spodok na hornom povrchu NK, ktorý klesá von od NK o qNK
    expect(ib.y).toBeCloseTo(qNK * (b - c), 12);
    expect(point(r.points, 'IT').y - ib.y).toBeCloseTo(hI, 12);
    expect(point(r.points, 'OT').y - point(r.points, 'IT').y).toBeCloseTo(p * b, 12);
    expect(point(r.points, 'NO')).toEqual({ x: c, y: -hN });
    // plocha: časť nad NK (lichobežník nad šikmým spodkom) + nos od −hN po hornú plochu
    const topAt = (x: number) => ib.y + hI + p * (x + (b - c));
    const overDeck = ((b - c) * (topAt(-(b - c)) - ib.y + topAt(0))) / 2;
    const nose = (c * (topAt(0) + topAt(c))) / 2 + c * hN;
    expect(r.area).toBeCloseTo(overDeck + nose, 12);
  });
});

describe('deck edge', () => {
  it.each([0.045, -0.03])(
    'is the extreme top point with the slope falling outward (q = %f)',
    (q) => {
      const section = evaluateSuperstructure(context(), deck(q), 100);
      const left = deckEdge(section.loops, 'left');
      const right = deckEdge(section.loops, 'right');
      expect(left?.point).toEqual(section.points.get('TL'));
      expect(right?.point).toEqual(section.points.get('TR'));
      expect(left?.slope).toBeCloseTo(-q, 12);
      expect(right?.slope).toBeCloseTo(q, 12);
    },
  );

  it('is undefined without outer loops', () => {
    expect(deckEdge([], 'left')).toBeUndefined();
  });
});

describe('evaluateEdgeBeam', () => {
  const q = 0.045;
  const ctx = context([beam('left'), beam('right')]);
  const section = evaluateSuperstructure(ctx, deck(q), 100);
  const topY = (x: number) => -q * x;

  it.each(['left', 'right'] as const)(
    'sits the %s edge beam on the deck top with the overhang c outside the deck edge',
    (side) => {
      const r = evaluateEdgeBeam(ctx, beam(side), section);
      expect(r.issues).toEqual([]);
      expect(r.loops).toHaveLength(1);
      const loop = r.loops[0];
      expect(loop && isCounterClockwise(loop.polygon)).toBe(true);
      const edge = point(section.points, side === 'left' ? 'TL' : 'TR');
      const dir = side === 'left' ? -1 : 1;
      expect(point(r.points, 'A')).toEqual(edge);
      const ib = point(r.points, 'IB');
      expect(ib.x).toBeCloseTo(edge.x - dir * (DEFAULTS.b - DEFAULTS.c), 12);
      expect(ib.y).toBeCloseTo(topY(ib.x), 12);
      expect(point(r.points, 'NO').x).toBeCloseTo(edge.x + dir * DEFAULTS.c, 12);
      // horná plocha stúpa von od vozovky o p (absolútne, bez ohľadu na sklon NK)
      const it_ = point(r.points, 'IT');
      expect(point(r.points, 'OT').y - it_.y).toBeCloseTo(DEFAULTS.p * DEFAULTS.b, 12);
      expect(r.toWorld(it_)).toEqual(section.toWorld(it_));
      expect(r.station).toBe(section.station);
    },
  );

  it('mirrors the left edge beam: same area as the right one on a flat deck', () => {
    const flat = evaluateSuperstructure(ctx, deck(0), 100);
    const left = evaluateEdgeBeam(ctx, beam('left'), flat);
    const right = evaluateEdgeBeam(ctx, beam('right'), flat);
    expect(left.area).toBeCloseTo(right.area, 12);
    expect(left.area).toBeGreaterThan(0.3);
  });

  it('uses the edge beam parameter laws', () => {
    const r = evaluateEdgeBeam(ctx, beam('right', { b: '1.75', c: '0.4' }), section);
    const { inner, outer } = edgeBeamEdges(r, 'right');
    expect((outer?.x ?? 0) - (inner?.x ?? 0)).toBeCloseTo(1.75, 12);
    expect((outer?.x ?? 0) - point(section.points, 'TR').x).toBeCloseTo(0.4, 12);
  });

  it('reports an unknown profile as an edge beam issue', () => {
    const r = evaluateEdgeBeam(ctx, { ...beam('left'), profile: 'nic' }, section);
    expect(r.loops).toEqual([]);
    expect(r.issues).toEqual([
      { code: 'UnknownProfile', id: 'nic', owner: { kind: 'edgeBeam', name: 'Rímsa vľavo' } },
    ]);
  });
});

describe('sampleEdgeBeam', () => {
  it('follows the deck samples and ends, anchored on the main deck profile in crossbeam bands', () => {
    const sup = deck(0.045);
    const narrow = { ...crossbeamBlock('pb'), id: 'pb' };
    const bands = new Map([
      [
        sup.id,
        [
          {
            line: {
              id: 'o1',
              name: '1',
              superstructure: sup.id,
              station: 1100,
              crossingAngle: '90',
            },
            profile: narrow,
            // spojité staničenie (km 1,099 – 1,101)
            sFrom: 99,
            sTo: 101,
            angle: Math.PI / 2,
          },
        ],
      ],
    ]);
    const ctx = context([beam('right')], {
      crossbeams: bands,
      profiles: [example.profile, rimsa, narrow],
    });
    const samples = sampleSuperstructure(ctx, sup, []);
    if (!('sections' in samples)) throw new Error('NK sa nevyhodnotila');
    const segment = sampleEdgeBeam(ctx, beam('right'), samples);
    expect(segment.stations).toEqual(samples.stations);
    expect(segment.startAngle).toBe(samples.endAngles.start);
    expect(segment.endAngle).toBe(samples.endAngles.end);
    const k = segment.stations.findIndex((s) => s >= 99 - 1e-9 && s <= 101 + 1e-9);
    expect(k).toBeGreaterThan(0);
    const inBand = segment.sections[k];
    const main = evaluateSuperstructure(ctx, sup, segment.stations[k] as number, example.profile);
    expect(inBand && point(inBand.points, 'A')).toEqual(main.points.get('TR'));
    // NK má v páse prierez priečnika (užší), rímsa sa ho nedrží
    const crossbeam = evaluateSuperstructure(ctx, sup, segment.stations[k] as number);
    expect(crossbeam.points.get('TR')?.x).not.toBeCloseTo(main.points.get('TR')?.x ?? 0, 3);
  });

  it('adds the breaks of the edge beam parameter laws to the deck samples', () => {
    const sup = deck(0.045);
    const wide: EdgeBeam = {
      ...beam('left'),
      parameterLaws: {
        b: {
          kind: 'piecewise',
          segments: [
            { from: 1050, to: 1123.4, v0: '0.9', v1: '0.9', shape: 'linear' },
            { from: 1123.4, to: 1300, v0: '0.9', v1: '1.5', shape: 'linear' },
          ],
        },
      },
    };
    const samples = sampleSuperstructure(context([wide]), sup, []);
    if (!('sections' in samples)) throw new Error('NK sa nevyhodnotila');
    const at = alignment.stationing.fromDisplay(1123.4) ?? Number.NaN;
    expect(samples.stations.some((s) => Math.abs(s - at) < 1e-9)).toBe(true);
  });
});

describe('deckWidths', () => {
  it('measures the deck width, the free width between the edge beams and the bridge width', () => {
    const ctx = context([beam('left', { b: '1.75', c: '0.4' }), beam('right')]);
    const sup = deck(0.045);
    const section = evaluateSuperstructure(ctx, sup, 100);
    const w = deckWidths(ctx, sup, 100);
    const deckWidth = point(section.points, 'TR').x - point(section.points, 'TL').x;
    expect(w?.deck).toBeCloseTo(deckWidth, 12);
    expect(w?.free).toBeCloseTo(deckWidth - (1.75 - 0.4) - (0.9 - 0.35), 12);
    expect(w?.bridge).toBeCloseTo(deckWidth + 0.4 + 0.35, 12);
  });

  it('has no free width without both edge beams and measures the bridge to the deck edge', () => {
    const ctx = context([beam('left')]);
    const sup = deck(0.045);
    const w = deckWidths(ctx, sup, 100);
    expect(w?.free).toBeUndefined();
    expect(w?.bridge).toBeCloseTo((w?.deck ?? 0) + DEFAULTS.c, 12);
  });
});

describe('free width check (ADR 0023)', () => {
  // NK 7,35 + 7,30 = 14,65; rímsy na NK 1,35 a 0,55 → voľná šírka 12,75
  const beams = [beam('left', { b: '1.75', c: '0.4' }), beam('right')];
  const stations = [60, 100, 200];
  const brief = (freeWidth: number | null) => ({ freeWidth, roadCategory: '' });

  it('collects the deck, free and bridge widths over the deck samples', () => {
    const range = deckWidthRange(context(beams), deck(0.045), stations);
    expect(range?.deck.min).toBeCloseTo(14.65, 9);
    expect(range?.bridge.max).toBeCloseTo(15.4, 9);
    expect(range?.free?.min).toBeCloseTo(12.75, 9);
    expect(range?.free?.max).toBeCloseTo(12.75, 9);
    expect(
      deckWidthRange(context([beams[0] as EdgeBeam]), deck(0.045), stations)?.free,
    ).toBeUndefined();
  });

  it('warns once when the free width is more than 1 mm below the required one', () => {
    const issues = (freeWidth: number | null, sup = deck(0.045), list = beams) =>
      freeWidthIssues(
        context(list, { brief: brief(freeWidth) }),
        sup,
        stations,
        FREE_WIDTH_TOLERANCE,
      );
    expect(issues(12.75)).toEqual([]);
    expect(issues(12.7505)).toEqual([]);
    expect(issues(12.752)).toEqual([
      {
        code: 'FreeWidthBelowRequired',
        station: 1060,
        width: expect.closeTo(12.75, 9),
        required: 12.752,
        source: 'brief',
        severity: 'warning',
      },
    ]);
    // hodnota pri NK má prednosť pred zadaním
    expect(issues(9.5, { ...deck(0.045), freeWidth: 13 })[0]).toMatchObject({
      required: 13,
      source: 'deck',
    });
    // bez požadovanej hodnoty alebo bez oboch ríms sa nekontroluje
    expect(issues(null)).toEqual([]);
    expect(issues(13, deck(0.045), [beams[0] as EdgeBeam])).toEqual([]);
  });

  it('is part of the deck checks', () => {
    const ctx = context(beams, { brief: brief(13) });
    const checks = deckChecks(ctx, deck(0.045), undefined);
    expect(checks.filter((i) => i.code === 'FreeWidthBelowRequired')).toEqual([
      expect.objectContaining({ owner: { kind: 'superstructure', name: 'NK' }, required: 13 }),
    ]);
  });
});
