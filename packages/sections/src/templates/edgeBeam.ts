import type { Scope } from '@bridge/expr';
import type { ProfileDefinition } from '@bridge/model';

/** Typológia prierezov ríms (ADR 0023); vo výbere prierezu NK a priečnika sa neponúkajú. */
export const EDGE_BEAM_TYPOLOGY = 'edgeBeam';

/**
 * Vstavané meno vo výrazoch prierezu rímsy: sklon horného povrchu NK pri okraji [m/m], kladný = klesá von od NK
 * (na pravom okraji rovnaký ako `q` NK, na ľavom opačný).
 */
export const DECK_SLOPE_VARIABLE = 'qNK';

/**
 * Šablóna „Rímsa“ (ADR 0023). Rámec: referenčný bod A = okraj NK, x von od NK, y nahor [m]; prierez pravej rímsy,
 * ľavá sa zrkadlí.
 *
 *      IT ───────────────────────── OT      horná plocha stúpa von o p (sklon k vozovke)
 *      │ hI                           │
 *      IB ────────────── A            │ hN  spodok na hornom povrchu NK (sklon qNK)
 *                        │    nos     │
 *                        NI ───────── NO
 *      ◄──── b − c ─────►◄──── c ────►
 *
 * Rozmery sú zástupné, kým projektant nedodá firemný detail (PLAN.md, otázka 28).
 */
export function edgeBeamTemplate(id: string, name = 'Rímsa'): ProfileDefinition {
  return {
    id,
    name,
    parameters: [
      { name: 'b', unit: 'length', default: '0.9', description: 'celková šírka rímsy' },
      { name: 'c', unit: 'length', default: '0.35', description: 'presah za okraj NK' },
      { name: 'hI', unit: 'length', default: '0.25', description: 'výška vnútornej líca nad NK' },
      { name: 'hN', unit: 'length', default: '0.4', description: 'hĺbka nosa pod okrajom NK' },
      {
        name: 'p',
        unit: 'slope',
        default: '0.04',
        description: 'sklon hornej plochy k vozovke',
      },
    ],
    points: [
      { name: 'A', x: '0', y: '0' },
      { name: 'IB', x: '-(b - c)', y: `${DECK_SLOPE_VARIABLE} * (b - c)` },
      { name: 'IT', x: 'IB_x', y: 'IB_y + hI' },
      { name: 'OT', x: 'c', y: 'IT_y + p * b' },
      { name: 'NO', x: 'c', y: '-hN' },
      { name: 'NI', x: '0', y: '-hN' },
    ],
    loops: [{ name: 'obrys', role: 'outer', points: ['IB', 'A', 'NI', 'NO', 'OT', 'IT'] }],
    referencePoint: 'A',
    typology: EDGE_BEAM_TYPOLOGY,
  };
}

/**
 * Rozsah mien na náhľad prierezu mimo NK (miniatúra, editor prierezu): pri priereze rímsy `qNK` = 0, kým ho nedodá
 * okraj NK; ostatné prierezy bez zmeny.
 */
export function previewScope(profile: Pick<ProfileDefinition, 'typology'>, scope: Scope): Scope {
  return profile.typology === EDGE_BEAM_TYPOLOGY
    ? (n) => (n === DECK_SLOPE_VARIABLE ? 0 : scope(n))
    : scope;
}
