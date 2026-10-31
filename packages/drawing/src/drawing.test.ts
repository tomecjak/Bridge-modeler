import { type Vec2, vec2 } from '@bridge/geom';
import { evaluateReference212 } from '@bridge/sections/testing';
import { describe, expect, it } from 'vitest';
import { type DeckDrawingData, deckDrawingData } from './deck.ts';
import { type Drawing, type Entity, type TextEntity, textHeight, translate } from './model.ts';
import { planDrawing } from './plan.ts';
import { profileDrawing } from './profile.ts';
import { sectionDrawing } from './section.ts';
import { readableText } from './text.ts';

const ref = evaluateReference212();
const data = deckDrawingData(ref.ctx, ref.deck, ref.results) as DeckDrawingData;

describe('deckDrawingData', () => {
  it('collects the outline, the bridge axis over the deck and cuts of all its supports', () => {
    expect(data.road).toBe(ref.alignment.name);
    expect(data.axis[0]?.s).toBeCloseTo(ref.sFrom, 9);
    expect(data.axis.at(-1)?.s).toBeCloseTo(ref.sTo, 9);
    expect(data.outline.polygon.length).toBeGreaterThan(4);
    expect(data.longitudinal.outer).toHaveLength(1);
    expect(data.supports.map((s) => [s.name, s.cut.length > 0])).toEqual([
      ['1', true],
      ['2', true],
      ['3', true],
      ['4', true],
    ]);
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
    alignment: ref.alignment,
    decks: [{ id: data.id, cut: data.longitudinal }],
    supports: data.supports,
    terrain: [
      [
        { s: 40, z: 310 },
        { s: 140, z: 309 },
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

  it('labels each support vertically with its name and station', () => {
    const labels = texts(profile).filter((t) => t.layer === 'label');
    expect(labels.map((t) => t.text)).toEqual([
      '1  km 9,307 810',
      '2  km 9,323 810',
      '3  km 9,346 810',
      '4  km 9,362 810',
    ]);
    for (const t of labels) expect(t.rotation).toBeCloseTo(Math.PI / 2, 12);
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
