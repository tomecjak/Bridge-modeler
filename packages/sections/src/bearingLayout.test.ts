import { describe, expect, it } from 'vitest';
import { bottomFaces, deckBearings } from './bearingLayout.ts';
import { evaluateProfileDefinition, profileParameterValues } from './profile.ts';
import { profileTemplate } from './templates/catalog.ts';
import { reference212Project } from './testing/index.ts';

const globals = () => undefined;

/** Šablóna s predvolenými hodnotami a so zmenenými parametrami; vráti obrysy a hodnoty parametrov. */
function evaluate(typology: string, overrides: Record<string, number> = {}) {
  const def = profileTemplate(typology, 'p');
  if (!def) throw new Error(`chýba šablóna ${typology}`);
  const params = profileParameterValues(def, {}, globals, 0);
  for (const [k, v] of Object.entries(overrides)) params.values.set(k, v);
  const r = evaluateProfileDefinition(def, params.values, globals, 0);
  expect(r.issues).toEqual([]);
  return { section: r, value: (name: string) => params.values.get(name) as number };
}

describe('bottomFaces', () => {
  it('finds the soffit of a single beam and leaves out the cantilevers and webs', () => {
    const { section, value } = evaluate('singleBeam', { bw: 4 });
    const faces = bottomFaces(section);
    expect(faces).toHaveLength(1);
    expect(faces[0]?.x0).toBeCloseTo(-value('bw') / 2, 9);
    expect(faces[0]?.x1).toBeCloseTo(value('bw') / 2, 9);
  });

  it('finds both beams of a twin beam on the same line with and without cross fall', () => {
    for (const q of [0.025, 0, -0.04]) {
      const { section, value } = evaluate('twinBeam', { q });
      const faces = bottomFaces(section);
      const a = value('a');
      const b = value('bwB');
      expect(faces.map((f) => [f.x0, f.x1])).toEqual([
        [expect.closeTo(-a / 2 - b / 2, 9), expect.closeTo(-a / 2 + b / 2, 9)],
        [expect.closeTo(a / 2 - b / 2, 9), expect.closeTo(a / 2 + b / 2, 9)],
      ]);
    }
  });

  it('keeps the bottom of a single beam with a horizontal soffit', () => {
    const { section, value } = evaluate('singleBeamHaunched', { spodokRovnobezny: 0, q: 0.04 });
    const faces = bottomFaces(section);
    expect(faces).toHaveLength(1);
    expect((faces[0]?.x1 ?? 0) - (faces[0]?.x0 ?? 0)).toBeCloseTo(value('bw'), 9);
  });
});

describe('deckBearings', () => {
  it('puts two bearings a quarter of the soffit width from its edges (4 m → ±1,00 m)', () => {
    const { section } = evaluate('singleBeam', { bw: 4 });
    expect(deckBearings(bottomFaces(section))).toEqual([-1, 1]);
  });

  it('gives ±1,25 m for the 212-00 deck as on the drawing', () => {
    const p = reference212Project();
    const def = p.profiles[0];
    if (!def) throw new Error('chýba prierez 212-00');
    const laws = p.superstructures[0]?.parameterLaws ?? {};
    const params = profileParameterValues(def, laws, globals, 0);
    const section = evaluateProfileDefinition(def, params.values, globals, 0);
    expect(deckBearings(bottomFaces(section))).toEqual([-1.25, 1.25]);
    expect(p.supports[1]?.bearings).toEqual(['-1.25', '1.25']);
  });

  it('puts one bearing under the middle of each beam', () => {
    for (const typology of ['twinBeam', 'slabBeam']) {
      const { section, value } = evaluate(typology);
      expect(deckBearings(bottomFaces(section))).toEqual([-value('a') / 2, value('a') / 2]);
    }
  });

  it('uses the bottom slab of a box and of a slab', () => {
    for (const [typology, width] of [
      ['box', 'bB'],
      ['boxHaunched', 'bB'],
      ['slab', 'bS'],
    ] as const) {
      const { section, value } = evaluate(typology);
      const w = value(width);
      expect(deckBearings(bottomFaces(section))).toEqual([
        Math.round((-w / 4) * 1000) / 1000,
        Math.round((w / 4) * 1000) / 1000,
      ]);
    }
  });

  it('works for a voided slab and rounds to millimetres', () => {
    const { section } = evaluate('voidedSlab');
    const bearings = deckBearings(bottomFaces(section));
    expect(bearings).toHaveLength(2);
    expect(bearings[0]).toBeCloseTo(-(bearings[1] ?? 0), 9);
    for (const x of bearings) expect(Math.round(x * 1000) / 1000).toBe(x);
    expect(deckBearings([])).toEqual([]);
  });
});
