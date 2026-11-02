import { vec2 } from '@bridge/geom';
import { describe, expect, it } from 'vitest';
import type { EvaluatedLoop } from './profile.ts';
import { SLENDERNESS, sectionDepth, slendernessIssues } from './slenderness.ts';
import { evaluateSpans, spanLines } from './spans.ts';
import { evaluateReference212 } from './testing/reference212.ts';

const loop = (role: EvaluatedLoop['role'], pts: [number, number][]): EvaluatedLoop => ({
  name: role,
  role,
  polygon: pts.map(([x, y]) => vec2(x, y)),
  pointNames: [],
});

describe('section depth', () => {
  it('measures the vertical thickness of a sloped slab', () => {
    // vrch so sklonom 2,5 %, spodok rovnobežný 1,0 m pod ním
    const q = 0.025;
    const slab = loop('outer', [
      [-3, 3 * q],
      [-3, 3 * q - 1],
      [3, -3 * q - 1],
      [3, -3 * q],
    ]);
    expect(sectionDepth([slab], 1e-6)).toBeCloseTo(1, 6);
  });

  it('takes the beam depth of a twin beam and ignores voids', () => {
    // doska 10 × 0,3, trámy 1,0 m široké a 2,5 m vysoké pod okrajmi dosky
    const twin = loop('outer', [
      [-5, 0],
      [-5, -2.5],
      [-4, -2.5],
      [-4, -0.3],
      [4, -0.3],
      [4, -2.5],
      [5, -2.5],
      [5, 0],
    ]);
    const box = loop('outer', [
      [-3, 0],
      [-3, -3],
      [3, -3],
      [3, 0],
    ]);
    const hollow = loop('void', [
      [-2, -0.3],
      [2, -0.3],
      [2, -2.7],
      [-2, -2.7],
    ]);
    expect(sectionDepth([twin], 1e-6)).toBeCloseTo(2.5, 6);
    expect(sectionDepth([box, hollow], 1e-6)).toBeCloseTo(3, 6);
  });
});

describe('slenderness L/h', () => {
  const { ctx, lines, results, deck } = evaluateReference212();
  const spans = evaluateSpans(deck, spanLines(lines, results));

  it('has a table for the deck typologies (indicative until confirmed by a structural engineer)', () => {
    expect(SLENDERNESS.singleBeam?.field).toEqual([15, 20]);
    expect(SLENDERNESS.boxHaunched?.support).toEqual([16, 20]);
  });

  const withTypology = (typology: string) => ({
    ...ctx,
    profiles: ctx.profiles.map((p) => ({ ...p, typology })),
  });
  const labels = (issues: ReturnType<typeof slendernessIssues>) =>
    issues.map((i) => i.code === 'Slenderness' && `${i.where} ${i.label} ${i.min}–${i.max}`);

  it('warns about stocky spans of the haunched single beam 212-00 (h 1,2 m, spans 16 / 23 / 16 m)', () => {
    expect(ctx.profiles[0]?.typology).toBe('singleBeamHaunched');
    const issues = slendernessIssues(ctx, deck, spans, 1e-6);
    expect(labels(issues)).toEqual(['field 1 20–25', 'field 2 20–25', 'field 3 20–25']);
    const first = issues[0];
    expect(first?.severity).toBe('warning');
    if (first?.code !== 'Slenderness') throw new Error('čakám štíhlosť');
    expect(first.depth).toBeCloseTo(1.2, 9);
    expect(first.ratio).toBeCloseTo(16 / 1.2, 9);
  });

  it('accepts spans inside the range and uses the table of the typology', () => {
    const thin = {
      ...deck,
      parameterLaws: { ...deck.parameterLaws, h: { kind: 'constant' as const, value: '1.0' } },
    };
    // 23 / 1,0 = 23 je v rozsahu 20 – 25
    expect(labels(slendernessIssues(ctx, thin, spans, 1e-6))).toEqual([
      'field 1 20–25',
      'field 3 20–25',
    ]);
    // jednotrám bez nábehov 15 – 20: 23 / 1,2 = 19,2 v poriadku
    expect(labels(slendernessIssues(withTypology('singleBeam'), deck, spans, 1e-6))).toEqual([
      'field 1 15–20',
      'field 3 15–20',
    ]);
    // komora s nábehmi aj nad vnútornými podperami (L = dlhšie susedné pole 23 m)
    expect(labels(slendernessIssues(withTypology('boxHaunched'), thin, spans, 1e-6))).toEqual([
      'field 1 30–50',
      'field 2 30–50',
      'field 3 30–50',
      'support 2 16–20',
      'support 3 16–20',
    ]);
  });

  it('checks nothing for a typology without values', () => {
    expect(slendernessIssues(withTypology('arch'), deck, spans, 1e-6)).toEqual([]);
  });
});
