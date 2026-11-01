import { type Polygon2D, type Vec2, vec2 } from '@bridge/geom';
import type { BridgeAxis, ProfileDefinition } from '@bridge/model';
import { describe, expect, it } from 'vitest';
import { deckOutline } from './deckOutline.ts';
import { type DeckSamples, sampleSuperstructure } from './deckSampling.ts';
import { bridgeAxisPlan, cutAlongAxis, deckCutAlong, deckLongitudinal } from './longitudinal.ts';
import { polylineProfileLine } from './profileLine.ts';
import { supportParts } from './supportGeometry.ts';
import { evaluateSupport, seatAt } from './supports.ts';
import { evaluateReference212, SIN } from './testing/reference212.ts';

const ref = evaluateReference212();
const z0 = ref.alignment.origin.z;
const samples = sampleSuperstructure(ref.ctx, ref.deck, ref.results) as DeckSamples;
const axis = ref.p.bridgeAxes[0] as BridgeAxis;
const line = bridgeAxisPlan(axis, ref.alignment, ref.ctx.parameters, ref.sFrom - 15, ref.sTo + 15);

const xs = (poly: Polygon2D) => poly.map((p) => p.x);
const length = (poly: Polygon2D) => Math.max(...xs(poly)) - Math.min(...xs(poly));
/** Najvyšší a najnižší bod obrysu nad staničením `s` (zvislica cez polygón). */
function verticalAt(poly: Polygon2D, s: number): { top: number; bottom: number } {
  const ys: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] as Vec2;
    const b = poly[(i + 1) % poly.length] as Vec2;
    if ((a.x - s) * (b.x - s) > 0 || a.x === b.x) continue;
    ys.push(a.y + ((b.y - a.y) * (s - a.x)) / (b.x - a.x));
  }
  return { top: Math.max(...ys), bottom: Math.min(...ys) };
}

describe('deckLongitudinal', () => {
  const cut = deckLongitudinal(samples);

  it('cuts the 212-00 deck in the bridge axis: 56.00 m long, top on the axis, 1.20 m deep', () => {
    expect(cut.outer).toHaveLength(1);
    expect(cut.voids).toEqual([]);
    const deck = cut.outer[0] as Polygon2D;
    expect(Math.min(...xs(deck))).toBeCloseTo(ref.sFrom, 9);
    expect(length(deck)).toBeCloseTo(56, 9);
    for (const sec of samples.sections.filter((_, k) => k % 7 === 3)) {
      const v = verticalAt(deck, sec.s);
      expect(v.top).toBeCloseTo(sec.axis?.point.z ?? Number.NaN, 6);
      expect(Math.abs(v.top - v.bottom - 1.2)).toBeLessThan(0.001);
    }
  });

  it('gives a separate outline for each void crossed by the axis', () => {
    const box: ProfileDefinition = {
      id: 'box',
      name: 'Komora',
      parameters: [],
      points: [
        { name: 'T', x: '0', y: '0' },
        { name: 'TL', x: '-3', y: '0' },
        { name: 'BL', x: '-3', y: '-2' },
        { name: 'BR', x: '3', y: '-2' },
        { name: 'TR', x: '3', y: '0' },
        { name: 'V1', x: '-2', y: '-0.3' },
        { name: 'V2', x: '-2', y: '-1.75' },
        { name: 'V3', x: '2', y: '-1.75' },
        { name: 'V4', x: '2', y: '-0.3' },
      ],
      loops: [
        { name: 'obrys', role: 'outer', points: ['TL', 'BL', 'BR', 'TR'] },
        { name: 'dutina', role: 'void', points: ['V1', 'V4', 'V3', 'V2'] },
      ],
      referencePoint: 'T',
    };
    const deck = { ...ref.deck, profile: 'box', parameterLaws: {} };
    const s = sampleSuperstructure({ ...ref.ctx, profiles: [box] }, deck, []) as DeckSamples;
    const c = deckLongitudinal(s);
    expect(c.outer).toHaveLength(1);
    expect(c.voids).toHaveLength(1);
    const mid = (ref.sFrom + ref.sTo) / 2;
    const top = s.sections[Math.floor(s.sections.length / 2)]?.axis?.point.z ?? 0;
    const v = verticalAt(c.voids[0] as Polygon2D, mid);
    expect(v.top - top).toBeCloseTo(-0.3, 2);
    expect(v.bottom - top).toBeCloseTo(-1.75, 2);
  });
});

describe('cutAlongAxis', () => {
  const pier = ref.results[1] as (typeof ref.results)[number];
  const abutments = [ref.results[0], ref.results[3]] as (typeof ref.results)[number][];

  it('cuts a skewed pier wall and its footing over thickness / sin α', () => {
    const cut = cutAlongAxis(supportParts(pier), line).map((c) => c.outline);
    expect(cut).toHaveLength(2);
    const [footing, wall] = [...cut].sort((a, b) => length(b) - length(a)) as [
      Polygon2D,
      Polygon2D,
    ];
    expect(length(wall)).toBeCloseTo(1.2 / SIN, 6);
    expect(length(footing)).toBeCloseTo(6.5 / SIN, 6);
    const v = verticalAt(wall, pier.s);
    expect(v.top).toBeCloseTo(seatAt(pier, 0), 6);
    expect(v.bottom + z0).toBeCloseTo(311.07, 6);
    expect(verticalAt(footing, pier.s).bottom + z0).toBeCloseTo(311.07 - 1.5, 6);
  });

  it('reaches the seat elevations of the drawing on the abutments within 5 mm', () => {
    [316.772, 316.417].forEach((seat, i) => {
      const r = abutments[i] as (typeof ref.results)[number];
      const cut = cutAlongAxis(supportParts(r), line).map((c) => c.outline);
      // prah, múrik a krídla neležia v osi (krídla sú pod okrajmi NK)
      expect(cut.length).toBeGreaterThanOrEqual(2);
      const atAxis = cut.map((poly) => verticalAt(poly, r.s)).filter((v) => Number.isFinite(v.top));
      expect(atAxis).toHaveLength(1);
      expect(Math.abs((atAxis[0]?.top ?? 0) + z0 - seat)).toBeLessThan(0.005);
    });
  });

  it('returns nothing for a support away from the bridge axis', () => {
    const away = evaluateSupport(ref.ctx, {
      ...(ref.p.supports[1] as (typeof ref.p.supports)[number]),
      offset: '20',
      geometry: { type: 'wall', thickness: '1.2', length: '4' },
    });
    expect(cutAlongAxis(supportParts(away), line)).toEqual([]);
  });
});

describe('deckCutAlong', () => {
  it('gives the same cut as deckLongitudinal along the bridge axis', () => {
    const along = deckCutAlong(
      samples,
      line.map((p) => ({ u: p.s, point: p.point })),
    );
    const exact = deckLongitudinal(samples).outer[0] as Polygon2D;
    expect(along.outer).toHaveLength(1);
    const deck = along.outer[0] as Polygon2D;
    expect(Math.min(...xs(deck))).toBeCloseTo(ref.sFrom, 6);
    expect(Math.max(...xs(deck))).toBeCloseTo(ref.sTo, 6);
    const mid = (ref.sFrom + ref.sTo) / 2;
    expect(verticalAt(deck, mid).top).toBeCloseTo(verticalAt(exact, mid).top, 6);
    expect(verticalAt(deck, mid).bottom).toBeCloseTo(verticalAt(exact, mid).bottom, 6);
  });

  it('cuts the deck edge 1 mm inside, showing the cantilever end face', () => {
    const edge = polylineProfileLine('deckEdge', deckOutline(samples).right, ref.alignment);
    const cut = deckCutAlong(samples, edge.points);
    expect(cut.outer).toHaveLength(1);
    const deck = cut.outer[0] as Polygon2D;
    // šikmé konce sú rovnobežné → okraj má dĺžku NK
    expect(length(deck)).toBeCloseTo(56, 3);
    const sec = samples.sections[Math.floor(samples.sections.length / 2)];
    const outer = sec?.loops.filter((l) => l.role === 'outer').flatMap((l) => l.polygon) ?? [];
    const xMax = Math.max(...outer.map((p) => p.x));
    const face = outer.filter((p) => Math.abs(p.x - xMax) < 1e-9).map((p) => p.y);
    const v = verticalAt(deck, edge.uTo / 2);
    expect(v.top - v.bottom).toBeCloseTo(Math.max(...face) - Math.min(...face), 2);
  });

  it('follows the skewed deck ends on a line parallel to the bridge axis', () => {
    // čiara 5 m vpravo od osi mosta, u = staničenie (priama os)
    const a = ref.alignment.evaluateHorizontal(0);
    const b = ref.alignment.evaluateHorizontal(ref.alignment.length);
    const shift = (p: Vec2, az: number) => vec2(p.x + 5 * Math.cos(az), p.y - 5 * Math.sin(az));
    const parallel = [
      { u: 0, point: shift(a.point, a.azimuth) },
      { u: ref.alignment.length, point: shift(b.point, b.azimuth) },
    ];
    const cut = deckCutAlong(samples, parallel).outer[0] as Polygon2D;
    const cot = (x: number) => Math.cos(x) / Math.sin(x);
    expect(Math.min(...xs(cut))).toBeCloseTo(ref.sFrom - 5 * cot(samples.endAngles.start), 6);
    expect(Math.max(...xs(cut))).toBeCloseTo(ref.sTo - 5 * cot(samples.endAngles.end), 6);
  });
});
