import { renameIdentifier } from '@bridge/expr';
import type { Parameter, StationFunction } from './types.ts';

/** Prepíše odkazy `from` → `to` vo všetkých výrazoch staničnej funkcie. */
export function renameInStationFunction(
  law: StationFunction,
  from: string,
  to: string,
): StationFunction {
  const r = (text: string) => renameIdentifier(text, from, to);
  switch (law.kind) {
    case 'constant':
      return { kind: 'constant', value: r(law.value) };
    case 'expression':
      return { kind: 'expression', expr: r(law.expr) };
    case 'piecewise':
      return {
        kind: 'piecewise',
        segments: law.segments.map((s) => ({ ...s, v0: r(s.v0), v1: r(s.v1) })),
      };
  }
}

/** Premenuje parameter a prepíše naň odkazy vo všetkých parametroch (ako Revit; rozhodnuté 2026-10-30). */
export function renameParameter(
  parameters: readonly Parameter[],
  id: string,
  newName: string,
): Parameter[] {
  const target = parameters.find((p) => p.id === id);
  if (!target || target.name === newName) return [...parameters];
  const from = target.name;
  return parameters.map((p) => ({
    ...p,
    name: p.id === id ? newName : p.name,
    law: renameInStationFunction(p.law, from, newName),
  }));
}
