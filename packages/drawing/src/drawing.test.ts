import { type Vec2, vec2 } from '@bridge/geom';
import {
  bridgeAxisLength,
  bridgeAxisPlan,
  bridgeAxisProfileLine,
  bridgeLengths,
  evaluateSpans,
  polylineProfileLine,
  spanLines,
} from '@bridge/sections';
import { evaluateReference212 } from '@bridge/sections/testing';
import { describe, expect, it } from 'vitest';
import { type DeckDrawingData, deckDrawingData } from './deck.ts';
import { bridgeDimensions } from './dimensions.ts';
import { type Drawing, type Entity, type TextEntity, textHeight, translate } from './model.ts';
import { planDrawing } from './plan.ts';
import {
  profileCuts,
  profileDrawing,
  profileEdgeLines,
  profileGrade,
  profileReadout,
  profileTicks,
} from './profile.ts';
import { sectionDrawing } from './section.ts';
import { readableText } from './text.ts';

const ref = evaluateReference212();
const data = deckDrawingData(ref.ctx, ref.deck, ref.results, {}, ref.lines) as DeckDrawingData;

describe('deckDrawingData', () => {
  it('collects the outline, the bridge axis over the deck, its samples and supports', () => {
    expect(data.road).toBe(ref.alignment.name);
    expect(data.axis[0]?.s).toBeCloseTo(ref.sFrom, 9);
    expect(data.axis.at(-1)?.s).toBeCloseTo(ref.sTo, 9);
    expect(data.outline.polygon.length).toBeGreaterThan(4);
    expect(data.samples.sections.length).toBeGreaterThan(10);
    expect(data.own.map((r) => r.support.name)).toEqual(['1', '2', '3', '4']);
    expect(data.lines.map((l) => l.line.name)).toEqual(['1', '2', '3', '4']);
  });
});

const axis = ref.p.bridgeAxes[0];
if (!axis) throw new Error('chýba os mosta');
const measure = bridgeAxisLength(axis, ref.alignment, ref.ctx.parameters);
const axisLine = bridgeAxisProfileLine(ref.alignment, measure);
const cuts = profileCuts(data, axisLine, measure);

describe('profileCuts', () => {
  it('cuts the deck and all its supports in the bridge axis with x = length along the axis', () => {
    expect(cuts.deck.outer).toHaveLength(1);
    const xs = cuts.deck.outer[0]?.map((p) => p.x) ?? [];
    expect(Math.min(...xs)).toBeCloseTo(measure.lengthAt(ref.sFrom), 9);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(56, 6);
    expect(cuts.supports.map((s) => [s.name, s.cut.length > 0])).toEqual([
      ['1', true],
      ['2', true],
      ['3', true],
      ['4', true],
    ]);
    // osi uloženia v dĺžke po osi mosta: 0,50 + 16 + 23 + 16 od začiatku NK
    const start = measure.lengthAt(ref.sFrom);
    expect(cuts.lines.map((l) => [l.name, l.u - start])).toEqual([
      ['1', expect.closeTo(0.5, 6)],
      ['2', expect.closeTo(16.5, 6)],
      ['3', expect.closeTo(39.5, 6)],
      ['4', expect.closeTo(55.5, 6)],
    ]);
  });

  it('cuts only what the line crosses along the deck edge', () => {
    const edge = polylineProfileLine('deckEdge', data.outline.right, ref.alignment);
    const c = profileCuts(data, edge);
    expect(c.deck.outer).toHaveLength(1);
    // stenové piliere (7,5 m) okraj NK nezasiahne, opory (krídla pod okrajmi) áno
    expect(c.supports.map((s) => s.cut.length > 0)).toEqual([true, false, false, true]);
    // šikmé osi pretnú pravý okraj (8,25 m vpravo) o 8,25 / sin α ďalej po osi uloženia; rozostup ostáva
    expect(c.lines.map((l) => l.u - (c.lines[0]?.u ?? 0))).toEqual([
      0,
      expect.closeTo(16, 6),
      expect.closeTo(39, 6),
      expect.closeTo(55, 6),
    ]);
  });
});

describe('profileEdgeLines', () => {
  it('runs along both deck edges 30 m beyond the deck ends with x = length along the bridge axis', () => {
    const { left, right } = profileEdgeLines(data, measure);
    for (const [edge, x] of [
      [left, -8.25],
      [right, 8.25],
    ] as const) {
      for (const p of edge) {
        expect(ref.alignment.project(p.point)?.offset).toBeCloseTo(x, 6);
      }
      const us = edge.map((p) => p.s);
      expect(us.every((u, i) => i === 0 || u > (us[i - 1] as number))).toBe(true);
      // šikmé konce: okraj začína o x · cot α pred / za koncom NK v osi
      expect((us.at(-1) as number) - (us[0] as number)).toBeCloseTo(56 + 60, 6);
    }
  });
});

describe('profileTicks', () => {
  it('labels the bridge axis in road kilometres', () => {
    const ticks = profileTicks(axisLine, 20, 0, axisLine.uTo);
    expect(ticks.map((t) => t.station)).toEqual([
      9260, 9280, 9300, 9320, 9340, 9360, 9380, 9400, 9420, 9440,
    ]);
    expect(ticks[0]?.u).toBeCloseTo(measure.lengthAt(10), 9);
  });

  it('labels a plan line by the road station at the foot of the perpendicular', () => {
    const edge = polylineProfileLine('deckEdge', data.outline.right, ref.alignment);
    const ticks = profileTicks(edge, 10, edge.uFrom, edge.uTo);
    // pravý okraj šikmej NK je posunutý o −8,25 · cot α ≈ −4,4 m (km 9,302 9 – 9,358 9)
    expect(ticks.map((t) => t.station)).toEqual([9310, 9320, 9330, 9340, 9350]);
    const at = edge.stationAt(ticks[0]?.u ?? 0) ?? 0;
    expect(ref.alignment.stationing.toDisplay(at).station).toBeCloseTo(9310, 6);
  });
});

const on = (d: Drawing, layer: Entity['layer']) => d.entities.filter((e) => e.layer === layer);
const texts = (d: Drawing) => d.entities.filter((e): e is TextEntity => e.kind === 'text');

describe('planDrawing', () => {
  const plan = planDrawing({
    alignment: ref.alignment,
    decks: [data],
    supports: ref.results,
    stationing: { step: 20, labelStep: 100 },
  });

  it('draws the road axis, stationing, deck outline and every support with its axis and name', () => {
    expect(plan.scale).toBe(200);
    expect(on(plan, 'roadAxis')).toHaveLength(1);
    expect(on(plan, 'deck')).toEqual([expect.objectContaining({ closed: true, owner: 'nk' })]);
    expect(on(plan, 'bridgeAxis')).toHaveLength(1);
    expect(on(plan, 'supportAxis')).toHaveLength(4);
    // 2 ložiská na podperu
    expect(on(plan, 'bearing')).toHaveLength(8);
    // piliere majú základ, opory nie (hrúbka 0)
    expect(on(plan, 'footing')).toHaveLength(2);
    expect(
      texts(plan)
        .filter((t) => t.layer === 'label')
        .map((t) => t.text),
    ).toEqual(['1', '2', '3', '4']);
    // os km 9,250 – 9,450: značky každých 20 m (9,260 … 9,440), popisy každých 100 m
    expect(
      texts(plan)
        .filter((t) => t.layer === 'stationing')
        .map((t) => t.text),
    ).toEqual(['km 9,300', 'km 9,400']);
    expect(on(plan, 'stationing').filter((e) => e.kind === 'polyline')).toHaveLength(10);
  });

  it('keeps all texts readable and 2.5 mm high at 1 : 200', () => {
    for (const t of texts(plan)) {
      expect(t.rotation).toBeGreaterThan(-Math.PI / 2);
      expect(t.rotation).toBeLessThanOrEqual(Math.PI / 2 + 1e-12);
      expect(t.height).toBeCloseTo(0.5, 12);
    }
  });

  it('adds other alignments as road axes and plan lines with their id', () => {
    const view = planDrawing({
      alignment: ref.alignment,
      decks: [],
      supports: [],
      otherAlignments: [ref.alignment],
      planLines: [
        { id: 'c1', name: 'Okraj', points: [vec2(0, 0), vec2(10, 0), vec2(20, 5)] },
        { id: 'c2', name: 'Bod', points: [vec2(0, 0)] },
      ],
    });
    expect(on(view, 'roadAxis')).toHaveLength(2);
    expect(on(view, 'planLine')).toEqual([
      expect.objectContaining({
        owner: 'c1',
        closed: false,
        points: [vec2(0, 0), vec2(10, 0), vec2(20, 5)],
      }),
    ]);
  });

  it('omits the stationing for the interactive view', () => {
    const view = planDrawing({ alignment: ref.alignment, decks: [], supports: [] });
    expect(on(view, 'stationing')).toEqual([]);
  });
});

describe('profileDrawing', () => {
  const profile = profileDrawing({
    line: axisLine,
    decks: [{ id: data.id, cut: cuts.deck }],
    supports: cuts.supports,
    lines: cuts.lines,
    terrain: [
      [
        { u: 40, z: 310 },
        { u: 140, z: 309 },
      ],
    ],
  });

  it('draws grade, terrain, the deck and support cuts in metres above sea level 1 : 1', () => {
    expect(on(profile, 'grade')).toHaveLength(1);
    expect(on(profile, 'terrain')).toHaveLength(1);
    const deck = on(profile, 'deck')[0];
    const ys = deck?.kind === 'polyline' ? deck.points.map((p: Vec2) => p.y) : [];
    // horný povrch NK okolo 318 m n. m., spodok o 1,20 m nižšie
    expect(Math.max(...ys)).toBeGreaterThan(317);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1.6);
    expect(on(profile, 'footing')).toHaveLength(2);
    expect(on(profile, 'support').length).toBeGreaterThanOrEqual(4);
  });

  it('draws the grade over the whole road axis in the bridge axis', () => {
    const grade = profileGrade(axisLine);
    expect(grade[0]?.x).toBeCloseTo(0, 9);
    expect(grade.at(-1)?.x).toBeCloseTo(200, 9);
  });

  it('draws each bearing line through the deck and support and labels it with its number and station', () => {
    const labels = texts(profile).filter((t) => t.layer === 'label');
    expect(labels.map((t) => t.text)).toEqual([
      '1  km 9,307 810',
      '2  km 9,323 810',
      '3  km 9,346 810',
      '4  km 9,362 810',
    ]);
    for (const t of labels) expect(t.rotation).toBeCloseTo(Math.PI / 2, 12);
    const axes = on(profile, 'supportAxis');
    expect(axes.map((e) => e.owner)).toEqual(['l1', 'l2', 'l3', 'l4']);
    // os piliera siaha nad NK a pod základ
    const pier = axes[1];
    const ys = pier?.kind === 'polyline' ? pier.points.map((p: Vec2) => p.y) : [];
    expect(Math.max(...ys)).toBeGreaterThan(318);
    expect(Math.min(...ys)).toBeLessThan(309.6);
  });

  it('draws a bearing line without a support through the deck only', () => {
    const free = profileDrawing({
      line: axisLine,
      decks: [{ id: data.id, cut: cuts.deck }],
      supports: [],
      lines: cuts.lines.slice(1, 2),
      terrain: [],
    });
    const axis = on(free, 'supportAxis')[0];
    const ys = axis?.kind === 'polyline' ? axis.points.map((p: Vec2) => p.y) : [];
    // výška NK + presah 3 mm na papieri hore aj dole (1 : 200 → 2 × 0,6 m)
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1.29 + 1.2 + 1e-6);
  });
});

describe('profileReadout', () => {
  const profile = profileDrawing({
    line: axisLine,
    decks: [{ id: data.id, cut: cuts.deck }],
    supports: cuts.supports,
    terrain: [
      [
        { u: 40, z: 310 },
        { u: 140, z: 309 },
      ],
    ],
  });
  const grade = profileGrade(axisLine);

  it('reads the grade, deck top and soffit, terrain and the soffit height above terrain', () => {
    const u = measure.lengthAt((ref.sFrom + ref.sTo) / 2);
    const r = profileReadout(
      profile,
      grade,
      { left: [[vec2(40, 312), vec2(140, 312)]], right: [] },
      u,
    );
    const z = ref.alignment.elevation((ref.sFrom + ref.sTo) / 2).z + ref.alignment.origin.z;
    expect(r.grade).toBeCloseTo(z, 6);
    // os mosta leží 0,09 m pod niveletou (vozovka), NK h = 1,20 m
    expect(r.deckTop).toBeCloseTo(z - 0.09, 3);
    expect((r.deckTop ?? 0) - (r.deckBottom ?? 0)).toBeCloseTo(1.2, 3);
    expect(r.terrain).toBeCloseTo(310 - (u - 40) / 100, 9);
    expect(r.clearance).toBeCloseTo((r.deckBottom ?? 0) - (r.terrain ?? 0), 9);
    expect(r.terrainLeft).toBeCloseTo(312, 9);
    expect(r.terrainRight).toBeUndefined();
  });

  it('leaves values outside the deck and terrain undefined', () => {
    const r = profileReadout(profile, grade, undefined, 5);
    expect(r.deckTop).toBeUndefined();
    expect(r.terrain).toBeUndefined();
    expect(r.clearance).toBeUndefined();
    expect(r.grade).toBeDefined();
  });
});

describe('bridgeDimensions', () => {
  it('gives the dimension chains of the 212-00 drawing', () => {
    const spans = evaluateSpans(ref.deck, spanLines(ref.lines, ref.results), {
      measure: measure.lengthAt,
    }).spans;
    const lengths = bridgeLengths({
      measure,
      supports: ref.results,
      sFrom: ref.sFrom,
      sTo: ref.sTo,
      axisLine: bridgeAxisPlan(
        axis,
        ref.alignment,
        ref.ctx.parameters,
        ref.sFrom - 30,
        ref.sTo + 30,
      ),
    });
    const chains = bridgeDimensions(spans, lengths, measure.lengthAt);
    const values = Object.fromEntries(
      chains.map((c) => [c.kind, c.segments.map((s) => Math.round(s.value * 100) / 100)]),
    );
    expect(values).toEqual({
      overall: [65.84],
      deck: [4.92, 56, 4.92],
      spans: [0.5, 16, 23, 16, 0.5],
      bridged: [0.9, 53.2, 0.9],
    });
    // reťazce nadväzujú: koniec úseku = začiatok ďalšieho
    for (const c of chains) {
      c.segments.slice(1).forEach((s, i) => {
        expect(s.sFrom).toBeCloseTo(c.segments[i]?.sTo ?? Number.NaN, 9);
      });
    }
  });
});

describe('sectionDrawing', () => {
  it('draws the road axis across the whole content', () => {
    const d = sectionDrawing({
      decks: [
        {
          id: 'nk',
          loops: [
            {
              role: 'outer',
              points: [
                { x: -2, y: 300 },
                { x: 2, y: 300 },
                { x: 2, y: 301 },
                { x: -2, y: 301 },
              ],
            },
          ],
        },
      ],
      supports: [],
      terrain: [
        [
          { x: -10, y: 295 },
          { x: 10, y: 296 },
        ],
      ],
    });
    expect(d.scale).toBe(100);
    const axisLine = on(d, 'roadAxis')[0];
    expect(axisLine?.kind === 'polyline' && axisLine.points).toEqual([
      { x: 0, y: 294 },
      { x: 0, y: 302 },
    ]);
    expect(on(d, 'deck')).toHaveLength(1);
    expect(textHeight(d.scale)).toBeCloseTo(0.25, 12);
  });
});

describe('helpers', () => {
  it('turns upside-down text around and mirrors its alignment', () => {
    const t = readableText('label', { x: 0, y: 0 }, 'A', 1, Math.PI, 'left');
    expect(t.rotation).toBeCloseTo(0, 12);
    expect(t.align).toBe('right');
    expect(readableText('label', { x: 0, y: 0 }, 'A', 1, Math.PI / 2, 'left').rotation).toBeCloseTo(
      Math.PI / 2,
      12,
    );
  });

  it('translates polylines and texts', () => {
    const d = translate(
      {
        scale: 200,
        entities: [
          { kind: 'polyline', layer: 'deck', points: [{ x: 1, y: 2 }], closed: false },
          readableText('label', { x: 3, y: 4 }, 'A', 1, 0, 'left'),
        ],
      },
      -500000,
      -1200000,
    );
    expect(d.entities[0]).toMatchObject({ points: [{ x: -499999, y: -1199998 }] });
    expect(d.entities[1]).toMatchObject({ at: { x: -499997, y: -1199996 } });
  });
});
