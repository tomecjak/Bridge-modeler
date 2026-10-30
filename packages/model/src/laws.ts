import type { Scope } from '@bridge/expr';
import type { ModelIssue } from './issues.ts';
import {
  type CompiledStationFunction,
  compileStationFunction,
  type ValueResult,
} from './stationFunction.ts';
import type { ParameterUnit, StationFunction } from './types.ts';

type Compiled = { ok: true; fn: CompiledStationFunction } | { ok: false; issues: ModelIssue[] };

// staničná funkcia je nemenný objekt z projektu (immer) → kompilácia sa dá cachovať podľa identity
const cache = new WeakMap<StationFunction, Map<ParameterUnit, Compiled>>();

function compiled(law: StationFunction, unit: ParameterUnit): Compiled {
  let byUnit = cache.get(law);
  if (!byUnit) {
    byUnit = new Map();
    cache.set(law, byUnit);
  }
  let c = byUnit.get(unit);
  if (!c) {
    c = compileStationFunction(law, unit);
    byUnit.set(unit, c);
  }
  return c;
}

/**
 * Vyhodnotí staničnú funkciu (napr. posun osi mosta, parameter prierezu) na zobrazovanom staničení `sta`.
 * `scope` dodáva hodnoty globálnych parametrov (a prípadne ďalších mien). Výsledok v jednotkách výrazu.
 */
export function evaluateLaw(
  law: StationFunction,
  unit: ParameterUnit,
  scope: Scope,
  sta: number,
): ValueResult {
  const c = compiled(law, unit);
  if (!c.ok) return { ok: false, issue: c.issues[0] as ModelIssue };
  return c.fn.at(sta, scope);
}

/** Všetky statické problémy staničnej funkcie (syntax, úseky). */
export function lawIssues(law: StationFunction, unit: ParameterUnit): ModelIssue[] {
  const c = compiled(law, unit);
  return c.ok ? [] : c.issues;
}
