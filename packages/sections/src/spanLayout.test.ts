import { type AlignmentData, createAlignment } from '@bridge/alignment';
import { vec2 } from '@bridge/geom';
import { type BridgeAxis, buildParameterSet } from '@bridge/model';
import { describe, expect, it } from 'vitest';
import { bridgeAxisLength } from './axisLength.ts';
import {
  layoutStations,
  moveLine,
  parseSpanLayout,
  setSpanLength,
  snapSpan,
  snapToPrevious,
} from './spanLayout.ts';

const origin = { x: 0, y: 0, z: 0 };
const straight: AlignmentData = {
  name: 'priamka',
  staStart: 1000,
  length: 300,
  horizontal: [{ kind: 'line', length: 300, start: vec2(0, 0), end: vec2(0, 300) }],
  stationEquations: [],
  profiles: [],
};
const R = 300;
const arc: AlignmentData = {
  ...straight,
  name: 'oblúk',
  horizontal: [
    {
      kind: 'arc',
      length: 300,
      start: vec2(0, 0),
      end: vec2(R - R * Math.cos(300 / R), R * Math.sin(300 / R)),
      center: vec2(R, 0),
      radius: R,
      rotation: 'cw',
    },
  ],
};
const axis = (h: number): BridgeAxis => ({
  id: 'ax',
  name: 'Os mosta',
  alignment: 'x',
  horizontalOffset: { kind: 'constant', value: String(h) },
  verticalOffset: { kind: 'constant', value: '0' },
});
const measureOf = (data: AlignmentData, h = 0) =>
  bridgeAxisLength(axis(h), createAlignment(data, origin).alignment, buildParameterSet([]));

describe('parseSpanLayout', () => {
  it('reads sums, repeated spans and decimal commas', () => {
    expect(parseSpanLayout('16 + 23 + 16')).toEqual({ ok: true, spans: [16, 23, 16] });
    expect(parseSpanLayout('3×20')).toEqual({ ok: true, spans: [20, 20, 20] });
    expect(parseSpanLayout('3x20')).toEqual({ ok: true, spans: [20, 20, 20] });
    expect(parseSpanLayout('20 + 2*25,5 + 20')).toEqual({ ok: true, spans: [20, 25.5, 25.5, 20] });
    expect(parseSpanLayout(' 18.5 ')).toEqual({ ok: true, spans: [18.5] });
  });

  it('reports empty text, unknown tokens and non-positive spans', () => {
    expect(parseSpanLayout('  ')).toEqual({ ok: false, error: { code: 'Empty' } });
    expect(parseSpanLayout('16 + a')).toEqual({
      ok: false,
      error: { code: 'InvalidTerm', term: 'a' },
    });
    expect(parseSpanLayout('16 +')).toEqual({
      ok: false,
      error: { code: 'InvalidTerm', term: '' },
    });
    expect(parseSpanLayout('0 + 16')).toEqual({
      ok: false,
      error: { code: 'NonPositiveSpan', value: 0 },
    });
    expect(parseSpanLayout('1.5×20')).toEqual({
      ok: false,
      error: { code: 'InvalidTerm', term: '1.5×20' },
    });
  });
});

describe('layoutStations', () => {
  const overhang = { start: 0.5, end: 0.5 };

  it('lays out spans from the start, from the end and symmetrically on a straight axis', () => {
    const measure = measureOf(straight);
    const spans = [16, 23, 16];
    expect(
      layoutStations({ spans, anchor: { kind: 'start', s: 7.81 }, measure, overhang }),
    ).toEqual({
      stations: [7.81, 23.81, 46.81, 62.81].map((s) => expect.closeTo(s, 9)),
      deck: { sFrom: expect.closeTo(7.31, 9), sTo: expect.closeTo(63.31, 9) },
    });
    const fromEnd = layoutStations({ spans, anchor: { kind: 'end', s: 62.81 }, measure, overhang });
    expect(fromEnd.stations[0]).toBeCloseTo(7.81, 9);
    const centred = layoutStations({
      spans,
      anchor: { kind: 'center', s: 100 },
      measure,
      overhang,
    });
    expect(centred.stations.map((s) => s - 100)).toEqual(
      [-27.5, -11.5, 11.5, 27.5].map((s) => expect.closeTo(s, 9)),
    );
  });

  it('keeps the spans along a bridge axis offset 7 m into a curve, not along the road', () => {
    const measure = measureOf(arc, 7);
    const r = layoutStations({
      spans: [16, 23, 16],
      anchor: { kind: 'start', s: 50 },
      measure,
      overhang,
    });
    const lengths = r.stations.map((s) => measure.lengthAt(s));
    expect(lengths.slice(1).map((l, i) => l - (lengths[i] as number))).toEqual(
      [16, 23, 16].map((x) => expect.closeTo(x, 9)),
    );
    // po osi cesty sú polia dlhšie (os mosta je vnútri oblúka)
    expect((r.stations[1] as number) - (r.stations[0] as number)).toBeCloseTo(16 / (1 - 7 / R), 6);
    expect(measure.lengthAt(r.stations[0] as number) - measure.lengthAt(r.deck.sFrom)).toBeCloseTo(
      0.5,
      9,
    );
  });
});

describe('moveLine', () => {
  const measure = measureOf(straight);
  const deck = { sFrom: 9.5, sTo: 65.5 };
  const stations = [10, 26, 49, 65];

  it('moves one interior line and leaves the rest and the deck', () => {
    expect(moveLine({ stations, deck, measure, index: 1, l: 27.5, following: false })).toEqual({
      stations: [10, expect.closeTo(27.5, 9), 49, 65],
      deck,
    });
  });

  it('moves the following lines too and the deck end with them', () => {
    const r = moveLine({ stations, deck, measure, index: 1, l: 27.5, following: true });
    expect(r.stations).toEqual([10, 27.5, 50.5, 66.5].map((s) => expect.closeTo(s, 9)));
    expect(r.deck).toEqual({ sFrom: 9.5, sTo: expect.closeTo(67, 9) });
  });

  it('keeps the deck overhang when the first line moves', () => {
    const r = moveLine({ stations, deck, measure, index: 0, l: 8, following: false });
    expect(r.deck.sFrom).toBeCloseTo(7.5, 9);
    expect(r.deck.sTo).toBe(65.5);
  });
});

describe('setSpanLength', () => {
  const measure = measureOf(arc, 7);
  const deck = { sFrom: 49.5, sTo: 110 };
  const stations = [50, 66, 89, 105];

  it('changes one span and moves the lines after it with the deck end', () => {
    const r = setSpanLength({ stations, deck, measure, span: 1, length: 25, side: 'after' });
    const l = r.stations.map((s) => measure.lengthAt(s)) as [number, number, number, number];
    expect(l[2] - l[1]).toBeCloseTo(25, 9);
    expect(r.stations.slice(0, 2)).toEqual([50, 66]);
    // ostatné polia a presah konca NK ostanú
    const before = stations.map((s) => measure.lengthAt(s));
    expect(l[3] - l[2]).toBeCloseTo((before[3] as number) - (before[2] as number), 9);
    expect(measure.lengthAt(r.deck.sTo) - l[3]).toBeCloseTo(
      measure.lengthAt(deck.sTo) - (before[3] as number),
      9,
    );
    expect(r.deck.sFrom).toBe(49.5);
  });

  it('moves the lines before the span toward the start', () => {
    const r = setSpanLength({ stations, deck, measure, span: 1, length: 20, side: 'before' });
    const l = r.stations.map((s) => measure.lengthAt(s)) as [number, number, number, number];
    expect(l[2] - l[1]).toBeCloseTo(20, 9);
    expect(r.stations.slice(2)).toEqual([89, 105]);
    expect(r.deck.sTo).toBe(110);
    expect(l[0] - measure.lengthAt(r.deck.sFrom)).toBeCloseTo(
      measure.lengthAt(50) - measure.lengthAt(49.5),
      9,
    );
  });
});

describe('snapping', () => {
  it('rounds a span to the step and never to zero', () => {
    expect(snapSpan(16.2)).toBe(16);
    expect(snapSpan(16.3)).toBe(16.5);
    expect(snapSpan(0.1)).toBe(0.5);
    expect(snapSpan(23.04, 0.1)).toBeCloseTo(23, 12);
  });

  it('snaps the span from the previous line, or to the next line for the first one', () => {
    expect(snapToPrevious([10, 26], 40.2)).toBeCloseTo(40, 12);
    expect(snapToPrevious([10, 26], 18.4)).toBeCloseTo(18.5, 12);
    expect(snapToPrevious([26, 49], 9.8)).toBeCloseTo(10, 12);
    expect(snapToPrevious([], 9.8)).toBe(9.8);
  });
});
