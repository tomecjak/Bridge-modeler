/**
 * Vzorové výkresy referenčného mosta 212-00 (pôdorys v S-JTSK, pozdĺžny rez, priečny rez na pilieri 2) ako DXF a SVG
 * do adresára (predvolene fixtures/local/drawings): `pnpm drawings:samples [adresár]`, potom
 * `tools/.venv/bin/python tools/validate_dxf.py <adresár>/*.dxf`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  type DeckDrawingData,
  type Drawing,
  deckDrawingData,
  planDrawing,
  profileCuts,
  profileDrawing,
  projectSection,
  projectSupport,
  sectionDrawing,
  toDxf,
  toSvg,
  translate,
} from '@bridge/drawing';
import { bridgeAxisLength, bridgeAxisProfileLine, evaluateSuperstructure } from '@bridge/sections';
import { evaluateReference212 } from '@bridge/sections/testing';

const dir = resolve(
  process.argv[2] ?? resolve(import.meta.dirname, '../../fixtures/local/drawings'),
);
mkdirSync(dir, { recursive: true });

const ref = evaluateReference212();
const origin = ref.p.crs.origin ?? { x: 0, y: 0, z: 0 };
const deck = deckDrawingData(ref.ctx, ref.deck, ref.results) as DeckDrawingData;
const pier = ref.results[1] as (typeof ref.results)[number];
const axis = ref.p.bridgeAxes[0];
if (!axis) throw new Error('chýba os mosta');
const measure = bridgeAxisLength(axis, ref.alignment, ref.ctx.parameters);
const line = bridgeAxisProfileLine(ref.alignment, measure);
const cuts = profileCuts(deck, line, measure);
const section = projectSection(
  evaluateSuperstructure(ref.ctx, ref.deck, pier.s),
  ref.alignment,
  pier.s,
  deck.id,
  deck.name,
);

const drawings: Record<string, Drawing> = {
  'podorys-sjtsk': translate(
    planDrawing({
      alignment: ref.alignment,
      decks: [deck],
      supports: ref.results,
      stationing: { step: 20, labelStep: 100 },
    }),
    origin.x,
    origin.y,
  ),
  'pozdlzny-rez': profileDrawing({
    line,
    decks: [{ id: deck.id, cut: cuts.deck }],
    supports: cuts.supports,
    terrain: [],
  }),
  'priecny-rez': sectionDrawing({
    decks: section ? [section] : [],
    supports: [projectSupport(pier, ref.alignment.origin.z) ?? []].flat(),
    terrain: [],
  }),
};

for (const [name, drawing] of Object.entries(drawings)) {
  writeFileSync(join(dir, `212-00 ${name}.dxf`), toDxf(drawing));
  writeFileSync(join(dir, `212-00 ${name}.svg`), toSvg(drawing));
}
console.log(`Výkresy 212-00 zapísané do ${dir}`);
