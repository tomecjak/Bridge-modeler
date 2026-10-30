import { renameIdentifier } from '@bridge/expr';
import type { ProfileDefinition } from '@bridge/model';

/**
 * Premenuje parameter profilu a prepíše naň odkazy vo výrazoch profilu (predvolené hodnoty, body).
 * Rovnako ako pri globálnych parametroch (rozhodnuté 2026-10-30).
 */
export function renameProfileParameter(
  def: ProfileDefinition,
  from: string,
  to: string,
): ProfileDefinition {
  const r = (text: string) => renameIdentifier(text, from, to);
  return {
    ...def,
    parameters: def.parameters.map((p) => ({
      ...p,
      name: p.name === from ? to : p.name,
      default: r(p.default),
    })),
    points: def.points.map((p) => ({ ...p, x: r(p.x), y: r(p.y) })),
  };
}

/** Premenuje bod a prepíše odkazy `Bod_x`, `Bod_y`, obrysy a referenčný bod. */
export function renameProfilePoint(
  def: ProfileDefinition,
  from: string,
  to: string,
): ProfileDefinition {
  const r = (text: string) =>
    renameIdentifier(renameIdentifier(text, `${from}_x`, `${to}_x`), `${from}_y`, `${to}_y`);
  return {
    ...def,
    points: def.points.map((p) => ({ name: p.name === from ? to : p.name, x: r(p.x), y: r(p.y) })),
    loops: def.loops.map((l) => ({ ...l, points: l.points.map((n) => (n === from ? to : n)) })),
    referencePoint: def.referencePoint === from ? to : def.referencePoint,
  };
}

/** Zoznam bodov obrysu zo zadaného textu (oddelené medzerou alebo čiarkou). */
export const parsePointList = (text: string): string[] =>
  text.split(/[\s,;]+/).filter((s) => s !== '');
