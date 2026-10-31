import {
  memoryLibrary,
  type ProfileDefinition,
  type ProfileLibrary,
  type ProfileParameter,
  type ProfilePoint,
} from '@bridge/model';
import { singleBeamHaunched } from './singleBeamHaunched.ts';

/**
 * Knižnica šablón prierezov NK podľa typológie VŠB (Fáza 8b, `fixtures/inbox/*.png`, `Rozpätia mostov.pdf`).
 * Rámec: x vpravo, y nahor [m], referenčný bod R = horný povrch betónu v osi NK, vrch so sklonom q (kladný = klesá
 * doprava), spodok rovnobežný s vrchom. Tvary sú zo schém bez kót; predvolené rozmery sú typické pomery
 * (výška podľa ekonomického rozpätia: doska ≈ L/20, vyľahčená doska a doskotrám ≈ L/25, trámy ≈ L/18, komora ≈ L/20)
 * a projektant ich upraví (PLAN.md §7).
 */
export interface ProfileTemplate {
  /** kľúč typológie (`ECONOMIC_SPANS`) */
  typology: string;
  name: string;
  create: (id: string) => ProfileDefinition;
}

const length = (name: string, value: string, description: string): ProfileParameter => ({
  name,
  unit: 'length',
  default: value,
  description,
});

/** Spoločné parametre: šírky od osi, priečny sklon, hrúbka konca konzoly. */
const common = (bL: string, bR: string, tEnd: string): ProfileParameter[] => [
  length('bL', bL, 'os NK → ľavý okraj betónu'),
  length('bR', bR, 'os NK → pravý okraj betónu'),
  length('tEnd', tEnd, 'hrúbka konca konzoly'),
  {
    name: 'q',
    unit: 'slope',
    default: '0.025',
    description: 'priečny sklon, kladný = klesá doprava',
  },
];

/** Vrch so sklonom q a konce konzol hrúbky tEnd. */
const topPoints: ProfilePoint[] = [
  { name: 'R', x: '0', y: '0' },
  { name: 'TL', x: '-bL', y: 'q * bL' },
  { name: 'TR', x: 'bR', y: '-q * bR' },
  { name: 'EL', x: 'TL_x', y: 'TL_y - tEnd' },
  { name: 'ER', x: 'TR_x', y: 'TR_y - tEnd' },
];

/** Bod v hĺbke `depth` pod vrchom so sklonom (spodok rovnobežný s vrchom). */
const at = (name: string, x: string, depth: string): ProfilePoint => ({
  name,
  x,
  // výraz bodu nesmie odkazovať na vlastné x → dosadí sa celý výraz
  y: `-q * ${paren(x)} - ${paren(depth)}`,
});

/** Zátvorky okolo zloženého výrazu (jednoduché meno alebo číslo ostane bez nich). */
const paren = (e: string) => (/^[\w.]+$/.test(e) ? e : `(${e})`);

function profile(
  id: string,
  name: string,
  typology: string,
  parameters: ProfileParameter[],
  points: ProfilePoint[],
  loops: ProfileDefinition['loops'],
): ProfileDefinition {
  return { id, name, parameters, points, loops, referencePoint: 'R', typology };
}

/** Doska so šikmými bokmi: hrúbka tEnd na konci, plná výška h na spodnej šírke bS. */
export function slab(id: string): ProfileDefinition {
  return profile(
    id,
    'Doska',
    'slab',
    [
      ...common('6', '6', '0.3'),
      length('h', '1', 'výška NK v osi (zvislo)'),
      length('bS', '7', 'spodná šírka dosky'),
    ],
    [...topPoints, at('BL', '-bS / 2', 'h'), at('BR', 'bS / 2', 'h')],
    [{ name: 'obrys', role: 'outer', points: ['TL', 'EL', 'BL', 'BR', 'ER', 'TR'] }],
  );
}

const VOIDS = 6;
const VOID_SIDES = 16;

/** Vyľahčená doska: doska so šikmými bokmi a 6 kruhovými dutinami (16-uholníky) v strede výšky. */
export function voidedSlab(id: string): ProfileDefinition {
  const centers: ProfilePoint[] = [];
  const voids: ProfilePoint[] = [];
  const loops: ProfileDefinition['loops'] = [
    { name: 'obrys', role: 'outer', points: ['TL', 'EL', 'BL', 'BR', 'ER', 'TR'] },
  ];
  for (let i = 1; i <= VOIDS; i++) {
    const c = `C${i}`;
    centers.push(at(c, `(${i} - ${(VOIDS + 1) / 2}) * a`, 'h / 2'));
    const names: string[] = [];
    for (let k = 0; k < VOID_SIDES; k++) {
      const n = `V${i}_${k + 1}`;
      // v smere hodinových ručičiek (dutina)
      const angle = (-360 * k) / VOID_SIDES;
      voids.push({
        name: n,
        x: `${c}_x + d / 2 * cos(${angle})`,
        y: `${c}_y + d / 2 * sin(${angle})`,
      });
      names.push(n);
    }
    loops.push({ name: `dutina ${i}`, role: 'void', points: names });
  }
  return profile(
    id,
    'Vyľahčená doska',
    'voidedSlab',
    [
      ...common('6.5', '6.5', '0.3'),
      length('h', '1.2', 'výška NK v osi (zvislo)'),
      length('bS', '9', 'spodná šírka dosky'),
      length('d', '0.8', 'priemer dutín'),
      length('a', '1.3', 'osová vzdialenosť dutín (6 dutín)'),
    ],
    [...topPoints, at('BL', '-bS / 2', 'h'), at('BR', 'bS / 2', 'h'), ...centers, ...voids],
    loops,
  );
}

/** Jednotrám bez nábehov: priamkový podhľad konzoly tEnd → tRoot, steny trámu 5 : 1, spodná šírka bw. */
export function singleBeam(id: string): ProfileDefinition {
  return profile(
    id,
    'Jednotrám',
    'singleBeam',
    [
      ...common('6', '6', '0.25'),
      length('h', '2', 'výška NK v osi (zvislo)'),
      length('bw', '4', 'spodná šírka trámu'),
      length('tRoot', '0.45', 'hrúbka konzoly pri stene trámu'),
    ],
    [
      ...topPoints,
      at('BL', '-bw / 2', 'h'),
      at('BR', 'bw / 2', 'h'),
      at('NL', 'BL_x - (h - tRoot) / 5', 'tRoot'),
      at('NR', 'BR_x + (h - tRoot) / 5', 'tRoot'),
    ],
    [{ name: 'obrys', role: 'outer', points: ['TL', 'EL', 'NL', 'BL', 'BR', 'NR', 'ER', 'TR'] }],
  );
}

/** Rebrá dvoch trámov (doskotrám, dvojtrám) — body od ľavej konzoly po pravú. */
function twoRibs(outerTop: string, innerTop: string, bottom: string): ProfilePoint[] {
  return [
    at('O1', `-a / 2 - ${outerTop} / 2`, 'tRoot'),
    at('B1L', `-a / 2 - ${bottom} / 2`, 'h'),
    at('B1R', `-a / 2 + ${bottom} / 2`, 'h'),
    at('I1', `-a / 2 + ${innerTop} / 2`, 'ts'),
    at('I2', `a / 2 - ${innerTop} / 2`, 'ts'),
    at('B2L', `a / 2 - ${bottom} / 2`, 'h'),
    at('B2R', `a / 2 + ${bottom} / 2`, 'h'),
    at('O2', `a / 2 + ${outerTop} / 2`, 'tRoot'),
  ];
}

const twoRibLoop: ProfileDefinition['loops'] = [
  {
    name: 'obrys',
    role: 'outer',
    points: ['TL', 'EL', 'O1', 'B1L', 'B1R', 'I1', 'I2', 'B2L', 'B2R', 'O2', 'ER', 'TR'],
  },
];

/** Doskotrám: doska hrúbky ts s dvoma širokými rebrami so zvislými bokmi. */
export function slabBeam(id: string): ProfileDefinition {
  return profile(
    id,
    'Doskotrám',
    'slabBeam',
    [
      ...common('6.5', '6.5', '0.25'),
      length('h', '1.2', 'výška NK v osi rebra (zvislo)'),
      length('ts', '0.3', 'hrúbka dosky medzi rebrami'),
      length('tRoot', '0.35', 'hrúbka konzoly pri rebre'),
      length('bRib', '2.4', 'šírka rebra'),
      length('a', '5.6', 'osová vzdialenosť rebier'),
    ],
    [...topPoints, ...twoRibs('bRib', 'bRib', 'bRib')],
    twoRibLoop,
  );
}

/** Dvojtrám: dva trámy zúžené smerom dole (bwT → bwB) so spoločnou doskou hrúbky ts. */
export function twinBeam(id: string): ProfileDefinition {
  return profile(
    id,
    'Dvojtrám',
    'twinBeam',
    [
      ...common('7', '7', '0.25'),
      length('h', '2.5', 'výška NK v osi trámu (zvislo)'),
      length('ts', '0.3', 'hrúbka dosky medzi trámami'),
      length('tRoot', '0.45', 'hrúbka konzoly pri tráme'),
      length('bwT', '1.1', 'šírka trámu hore'),
      length('bwB', '0.8', 'šírka trámu dole'),
      length('a', '6', 'osová vzdialenosť trámov'),
    ],
    [...topPoints, ...twoRibs('bwT', 'bwT', 'bwB')],
    twoRibLoop,
  );
}

const boxParameters = (
  bLR: string,
  values: { h: string; bT: string; bB: string; tw: string; ts: string; tb: string; tRoot: string },
): ProfileParameter[] => [
  ...common(bLR, bLR, '0.25'),
  length('h', values.h, 'výška NK v osi (zvislo)'),
  length('bT', values.bT, 'šírka komory hore (vonkajšie líca stien pri konzole)'),
  length('bB', values.bB, 'šírka spodnej dosky'),
  length('tw', values.tw, 'hrúbka stien (vodorovne)'),
  length('ts', values.ts, 'hrúbka hornej dosky'),
  length('tb', values.tb, 'hrúbka spodnej dosky'),
  length('tRoot', values.tRoot, 'hrúbka konzoly pri stene'),
];

/** Vonkajší obrys komory a vnútorné líca stien v hĺbke `depth` (vonkajšie líce posunuté o tw vodorovne). */
function boxPoints(): ProfilePoint[] {
  // vonkajšie líce steny: z (−bT/2, hĺbka tRoot) do (−bB/2, hĺbka h)
  const inner = (depth: string, sign: 1 | -1) =>
    `${sign} * (bT / 2 - (bT - bB) / 2 * (${depth} - tRoot) / (h - tRoot) - tw)`;
  return [
    ...topPoints,
    at('WL', '-bT / 2', 'tRoot'),
    at('WR', 'bT / 2', 'tRoot'),
    at('BL', '-bB / 2', 'h'),
    at('BR', 'bB / 2', 'h'),
    at('VTL', inner('ts', -1), 'ts'),
    at('VTR', inner('ts', 1), 'ts'),
    at('VBL', inner('h - tb', -1), 'h - tb'),
    at('VBR', inner('h - tb', 1), 'h - tb'),
  ];
}

const boxOuter = {
  name: 'obrys',
  role: 'outer' as const,
  points: ['TL', 'EL', 'WL', 'BL', 'BR', 'WR', 'ER', 'TR'],
};

/** Jednokomorový prierez so šikmými stenami, bez nábehov. */
export function box(id: string): ProfileDefinition {
  return profile(
    id,
    'Komora',
    'box',
    boxParameters('6.5', {
      h: '3.5',
      bT: '7',
      bB: '5',
      tw: '0.45',
      ts: '0.28',
      tb: '0.25',
      tRoot: '0.5',
    }),
    boxPoints(),
    [boxOuter, { name: 'komora', role: 'void', points: ['VTL', 'VTR', 'VBR', 'VBL'] }],
  );
}

/** Komora s nábehmi: rohy dutiny zrezané priamkovými nábehmi (horné bnT × hnT, dolné bnB × hnB). */
export function boxHaunched(id: string): ProfileDefinition {
  // bod na vnútornom líci steny v hĺbke `depth` (rovnaká priamka ako VTL – VBL)
  const onWeb = (name: string, ref: 'L' | 'R', depth: string): ProfilePoint =>
    at(name, `VT${ref}_x + (VB${ref}_x - VT${ref}_x) * (${depth} - ts) / (h - tb - ts)`, depth);
  return profile(
    id,
    'Komora s nábehmi',
    'boxHaunched',
    [
      ...boxParameters('7', {
        h: '4',
        bT: '7.5',
        bB: '5.5',
        tw: '0.5',
        ts: '0.3',
        tb: '0.3',
        tRoot: '0.55',
      }),
      length('bnT', '1.2', 'šírka horného nábehu'),
      length('hnT', '0.3', 'výška horného nábehu'),
      length('bnB', '0.6', 'šírka dolného nábehu'),
      length('hnB', '0.2', 'výška dolného nábehu'),
    ],
    [
      ...boxPoints(),
      at('HTL', 'VTL_x + bnT', 'ts'),
      at('HTR', 'VTR_x - bnT', 'ts'),
      at('HBL', 'VBL_x + bnB', 'h - tb'),
      at('HBR', 'VBR_x - bnB', 'h - tb'),
      onWeb('KTL', 'L', 'ts + hnT'),
      onWeb('KTR', 'R', 'ts + hnT'),
      onWeb('KBL', 'L', 'h - tb - hnB'),
      onWeb('KBR', 'R', 'h - tb - hnB'),
    ],
    [
      boxOuter,
      {
        name: 'komora',
        role: 'void',
        points: ['HTL', 'HTR', 'KTR', 'KBR', 'HBR', 'HBL', 'KBL', 'KTL'],
      },
    ],
  );
}

/** Všetky šablóny v poradí podľa ekonomického rozpätia. */
export const PROFILE_TEMPLATES: readonly ProfileTemplate[] = [
  { typology: 'slab', name: 'Doska', create: slab },
  { typology: 'voidedSlab', name: 'Vyľahčená doska', create: voidedSlab },
  { typology: 'slabBeam', name: 'Doskotrám', create: slabBeam },
  { typology: 'singleBeam', name: 'Jednotrám', create: singleBeam },
  {
    typology: 'singleBeamHaunched',
    name: 'Jednotrám s nábehmi',
    create: (id) => singleBeamHaunched(id),
  },
  { typology: 'twinBeam', name: 'Dvojtrám', create: twinBeam },
  { typology: 'box', name: 'Komora', create: box },
  { typology: 'boxHaunched', name: 'Komora s nábehmi', create: boxHaunched },
];

/** Šablóna podľa typológie s daným id; neznáma typológia → undefined. */
export function profileTemplate(typology: string, id: string): ProfileDefinition | undefined {
  return PROFILE_TEMPLATES.find((t) => t.typology === typology)?.create(id);
}

/** Zabudované šablóny ako knižnica len na čítanie (id položky `sablona:<typológia>`). */
export function builtinProfileLibrary(name = 'Šablóny'): ProfileLibrary {
  return memoryLibrary(
    name,
    PROFILE_TEMPLATES.map((t) => ({
      id: `sablona:${t.typology}`,
      name: t.name,
      typology: t.typology,
      profile: t.create(`sablona-${t.typology}`),
    })),
    { readOnly: true },
  );
}
