import type {
  BridgeAxis,
  EdgeBeam,
  ProfileDefinition,
  StationFunction,
  Superstructure,
} from '@bridge/model';
import { deckFromProfile } from './deck.ts';
import { edgeBeamTemplate } from './edgeBeam.ts';

/**
 * Šablóna „Jednotrám s nábehmi“ (typológia VŠB, PLAN.md §7). Rámec: x vpravo, y nahor [m],
 * referenčný bod R = horný povrch betónu v osi NK (os NK = os spodnej šírky trámu).
 *
 *        TL ─────────────── R ──────────────── TR      vrch so sklonom q (kladný = klesá doprava)
 *        EL ─── NL                     NR ─── ER       konzola tEnd na konci → tRoot pri nábehu
 *                 ╲  WL           WR  ╱                 priamkový nábeh dĺžky bN
 *                    │ BL ───── BR │                    steny 5 : 1 výšky hW, spodok šírky bw
 *
 * Výška h je zvislá v osi NK (ADR 0007). Spodok je rovnobežný s vrchom (spodokRovnobezny = 1) alebo vodorovný (0).
 * Predvolené bN a hW nie sú na výkrese okótované — predpoklad (PLAN.md §7).
 */
export function singleBeamHaunched(id: string, name = 'Jednotrám s nábehmi'): ProfileDefinition {
  return {
    id,
    name,
    parameters: [
      { name: 'bL', unit: 'length', default: '7.35', description: 'os NK → ľavý okraj betónu' },
      { name: 'bR', unit: 'length', default: '7.3', description: 'os NK → pravý okraj betónu' },
      { name: 'bw', unit: 'length', default: '5', description: 'spodná šírka trámu' },
      { name: 'h', unit: 'length', default: '1.7', description: 'výška NK v osi (zvislo)' },
      { name: 'tEnd', unit: 'length', default: '0.2', description: 'hrúbka konca konzoly' },
      { name: 'tRoot', unit: 'length', default: '0.5', description: 'hrúbka konzoly pri nábehu' },
      { name: 'bN', unit: 'length', default: '1.45', description: 'vodorovná dĺžka nábehu' },
      {
        name: 'hW',
        unit: 'length',
        default: '0.3',
        description: 'výška steny trámu (sklon 5 : 1)',
      },
      {
        name: 'q',
        unit: 'slope',
        default: '0.045',
        description: 'priečny sklon, kladný = klesá doprava',
      },
      {
        name: 'spodokRovnobezny',
        unit: 'none',
        default: '1',
        description: '1 = spodok rovnobežný s vrchom, 0 = vodorovný',
      },
    ],
    points: [
      { name: 'R', x: '0', y: '0' },
      { name: 'TL', x: '-bL', y: 'q * bL' },
      { name: 'TR', x: 'bR', y: '-q * bR' },
      { name: 'EL', x: 'TL_x', y: 'TL_y - tEnd' },
      { name: 'ER', x: 'TR_x', y: 'TR_y - tEnd' },
      { name: 'BL', x: '-bw / 2', y: '-h + spodokRovnobezny * q * bw / 2' },
      { name: 'BR', x: 'bw / 2', y: '-h - spodokRovnobezny * q * bw / 2' },
      { name: 'WL', x: 'BL_x - hW / 5', y: 'BL_y + hW' },
      { name: 'WR', x: 'BR_x + hW / 5', y: 'BR_y + hW' },
      { name: 'NL', x: 'WL_x - bN', y: '-q * (WL_x - bN) - tRoot' },
      { name: 'NR', x: 'WR_x + bN', y: '-q * (WR_x + bN) - tRoot' },
    ],
    loops: [
      {
        name: 'obrys',
        role: 'outer',
        points: ['TL', 'EL', 'NL', 'WL', 'BL', 'BR', 'WR', 'NR', 'ER', 'TR'],
      },
    ],
    referencePoint: 'R',
    typology: 'singleBeamHaunched',
  };
}

const constant = (value: string): StationFunction => ({ kind: 'constant', value });

/**
 * Príklad dvojice NK podľa rezu E–E (R2, PLAN.md §7): dve osi mosta od osi cesty (ľavá −7,75 m,
 * pravá +7,00 m; os NK = os spodku trámu), vozovka 90 mm, jeden profil s rôznymi šírkami.
 */
export function twinDeckExample(
  alignment: string,
  from: number,
  to: number,
  ids: { left: string; right: string; profile: string; leftAxis: string; rightAxis: string },
): { bridgeAxes: BridgeAxis[]; profile: ProfileDefinition; superstructures: Superstructure[] } {
  const axis = (id: string, name: string, offset: string): BridgeAxis => ({
    id,
    name,
    alignment,
    horizontalOffset: constant(offset),
    verticalOffset: constant('-0.09'),
  });
  const deck = (
    id: string,
    name: string,
    axisId: string,
    laws: Record<string, string>,
  ): Superstructure => ({
    id,
    name,
    bridgeAxis: axisId,
    from,
    to,
    profile: ids.profile,
    parameterLaws: Object.fromEntries(Object.entries(laws).map(([k, v]) => [k, constant(v)])),
    orientation: 'vertical',
  });
  return {
    bridgeAxes: [
      axis(ids.leftAxis, 'Os ľavej NK', '-7.75'),
      axis(ids.rightAxis, 'Os pravej NK', '7'),
    ],
    profile: singleBeamHaunched(ids.profile),
    superstructures: [
      deck(ids.left, 'Ľavá NK', ids.leftAxis, { bL: '7.35', bR: '7.3', bw: '5' }),
      deck(ids.right, 'Pravá NK', ids.rightAxis, { bL: '6.55', bR: '6.5', bw: '4' }),
    ],
  };
}

/**
 * Rímsy dvojice NK podľa rezu E–E (ADR 0023): šírky ríms b a presahy za okraj betónu c z kót výkresu
 * (ľavá NK 1 750 / 400 a 900 / 350, pravá NK 900 / 350 a 1 650 / 400), jeden prierez „Rímsa“ so zástupnými výškami.
 * Poradie id ríms: ľavá NK vľavo, ľavá NK vpravo, pravá NK vľavo, pravá NK vpravo.
 */
export function twinDeckEdgeBeams(
  decks: { left: string; right: string },
  ids: { profile: string; beams: readonly [string, string, string, string] },
): { profile: ProfileDefinition; edgeBeams: EdgeBeam[] } {
  const beam = (
    id: string,
    superstructure: string,
    side: EdgeBeam['side'],
    b: string,
    c: string,
  ): EdgeBeam => ({
    id,
    name: side === 'left' ? 'Rímsa vľavo' : 'Rímsa vpravo',
    superstructure,
    side,
    profile: ids.profile,
    parameterLaws: { b: constant(b), c: constant(c) },
  });
  const [ll, lr, rl, rr] = ids.beams;
  return {
    profile: edgeBeamTemplate(ids.profile),
    edgeBeams: [
      beam(ll, decks.left, 'left', '1.75', '0.4'),
      beam(lr, decks.left, 'right', '0.9', '0.35'),
      beam(rl, decks.right, 'left', '0.9', '0.35'),
      beam(rr, decks.right, 'right', '1.65', '0.4'),
    ],
  };
}

/**
 * Jedna NK so šablónou „Jednotrám s nábehmi“ na osi mosta totožnej s osou cesty
 * (vodorovný posun 0, zvislý −0,09 m = hrúbka vozovky; rozhodnutie z 2026-10-29).
 */
export function singleDeckExample(
  alignment: string,
  from: number,
  to: number,
  ids: { deck: string; profile: string; axis: string },
): { bridgeAxes: BridgeAxis[]; profile: ProfileDefinition; superstructures: Superstructure[] } {
  const { bridgeAxis, superstructure } = deckFromProfile(alignment, from, to, ids.profile, ids);
  return {
    bridgeAxes: [bridgeAxis],
    profile: singleBeamHaunched(ids.profile),
    superstructures: [superstructure],
  };
}
