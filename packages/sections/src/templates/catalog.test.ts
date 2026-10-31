import { describe, expect, it } from 'vitest';
import { evaluateProfileDefinition, profileParameterValues } from '../profile.ts';
import { ECONOMIC_SPANS } from '../spans.ts';
import { PROFILE_TEMPLATES, profileTemplate } from './catalog.ts';

const globals = () => undefined;

/** Vyhodnotí šablónu s predvolenými hodnotami a so zmenenými parametrami. */
function evaluate(typology: string, overrides: Record<string, number> = {}) {
  const def = profileTemplate(typology, 'p');
  if (!def) throw new Error(`chýba šablóna ${typology}`);
  const params = profileParameterValues(def, {}, globals, 0);
  expect(params.issues).toEqual([]);
  for (const [k, v] of Object.entries(overrides)) params.values.set(k, v);
  // parametre závislé od zmenených (žiadne v šablónach) sa neprepočítavajú
  return evaluateProfileDefinition(def, params.values, globals, 0);
}

const xs = (r: ReturnType<typeof evaluate>) =>
  r.loops.filter((l) => l.role === 'outer').flatMap((l) => l.polygon.map((p) => p.x));
const width = (r: ReturnType<typeof evaluate>) => Math.max(...xs(r)) - Math.min(...xs(r));
/** Najnižší bod obrysu (pri q = 0 = −výška NK). */
const bottom = (r: ReturnType<typeof evaluate>) =>
  Math.min(...r.loops.flatMap((l) => l.polygon.map((p) => p.y)));

describe('profile templates', () => {
  it('offers every VŠB typology with an economic span, including the existing haunched beam', () => {
    expect(PROFILE_TEMPLATES.map((t) => t.typology).sort()).toEqual(
      [
        'slab',
        'voidedSlab',
        'slabBeam',
        'singleBeam',
        'singleBeamHaunched',
        'twinBeam',
        'box',
        'boxHaunched',
      ].sort(),
    );
    for (const t of PROFILE_TEMPLATES) {
      expect(ECONOMIC_SPANS[t.typology]).toBeGreaterThan(0);
      const def = t.create('x');
      expect(def.typology).toBe(t.typology);
      expect(def.id).toBe('x');
      expect(def.name).toBe(t.name);
    }
  });

  it.each(PROFILE_TEMPLATES.map((t) => t.typology))(
    '%s evaluates without issues, its voids lie inside and width / depth follow the parameters',
    (typology) => {
      const r = evaluate(typology);
      expect(r.issues).toEqual([]);
      expect(r.loops.filter((l) => l.role === 'outer')).toHaveLength(1);
      expect(r.area).toBeGreaterThan(0);
      const flat = evaluate(typology, { q: 0 });
      const def = profileTemplate(typology, 'p');
      const value = (n: string) => Number(def?.parameters.find((p) => p.name === n)?.default);
      expect(width(flat)).toBeCloseTo(value('bL') + value('bR'), 9);
      expect(bottom(flat)).toBeCloseTo(-value('h'), 9);
      const wider = evaluate(typology, { q: 0, bL: value('bL') + 1, h: value('h') + 0.2 });
      expect(width(wider)).toBeCloseTo(value('bL') + value('bR') + 1, 9);
      expect(bottom(wider)).toBeCloseTo(-value('h') - 0.2, 9);
    },
  );

  it('matches hand-computed areas for the slab, the voided slab, the beams and the box (q = 0)', () => {
    // doska: pás konzoly 12 × 0,30 + lichobežník (12 + 7) / 2 × 0,70
    expect(evaluate('slab', { q: 0 }).area).toBeCloseTo(12 * 0.3 + ((12 + 7) / 2) * 0.7, 9);
    // vyľahčená doska: doska − 6 pravidelných 16-uholníkov (r = 0,40)
    const polygon16 = 8 * 0.4 ** 2 * Math.sin(Math.PI / 8);
    expect(evaluate('voidedSlab', { q: 0 }).area).toBeCloseTo(
      13 * 0.3 + ((13 + 9) / 2) * 0.9 - 6 * polygon16,
      9,
    );
    // jednotrám: pás 12 × 0,25, klinové konzoly, pás nad trámom, lichobežník trámu so stenami 5 : 1
    const webTop = 4 + (2 * (2 - 0.45)) / 5;
    expect(evaluate('singleBeam', { q: 0 }).area).toBeCloseTo(
      12 * 0.25 + (12 - webTop) * 0.2 * 0.5 + webTop * 0.2 + ((webTop + 4) / 2) * (2 - 0.45),
      9,
    );
    // doskotrám: pás 13 × 0,25, klinové konzoly, dve rebrá 2,4 × 0,95, doska medzi rebrami
    expect(evaluate('slabBeam', { q: 0 }).area).toBeCloseTo(
      13 * 0.25 + 2.5 * 0.1 + 2 * 2.4 * 0.95 + 3.2 * 0.05,
      9,
    );
    // komora: vonkajší obrys − lichobežníková dutina (vnútorné líca stien posunuté o tw vodorovne)
    const [h, bT, bB, tw, ts, tb, tRoot] = [3.5, 7, 5, 0.45, 0.28, 0.25, 0.5];
    const xOut = (d: number) => -bT / 2 + ((bT - bB) / 2) * ((d - tRoot) / (h - tRoot));
    const voidTop = -2 * (xOut(ts) + tw);
    const voidBottom = -2 * (xOut(h - tb) + tw);
    const outer = 13 * 0.25 + (13 - bT) * 0.25 * 0.5 + bT * 0.25 + ((bT + bB) / 2) * (h - tRoot);
    expect(evaluate('box', { q: 0 }).area).toBeCloseTo(
      outer - ((voidTop + voidBottom) / 2) * (h - ts - tb),
      9,
    );
  });

  it('chamfers the void corners of the haunched box by the haunch sizes', () => {
    const plain = evaluate('box', { q: 0 });
    const haunched = evaluate('boxHaunched', { q: 0 });
    const v = haunched.loops.find((l) => l.role === 'void');
    expect(v?.polygon).toHaveLength(8);
    expect(plain.loops.find((l) => l.role === 'void')?.polygon).toHaveLength(4);
  });

  it('returns undefined for an unknown typology', () => {
    expect(profileTemplate('arch', 'p')).toBeUndefined();
  });
});
