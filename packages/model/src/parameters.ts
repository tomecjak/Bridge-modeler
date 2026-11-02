import type { Stationing } from '@bridge/alignment';
import { FUNCTION_NAMES } from '@bridge/expr';
import type { ModelIssue } from './issues.ts';
import {
  type CompiledStationFunction,
  compileStationFunction,
  type ValueResult,
} from './stationFunction.ts';
import {
  FREE_WIDTH_VARIABLE,
  type Parameter,
  type ParameterUnit,
  STATION_VARIABLE,
} from './types.ts';

export interface ParameterEvaluation {
  /** hodnoty platných parametrov v jednotkách výrazov (m, °, m/m) */
  values: Map<string, number>;
  /** problémy vzniknuté pri vyhodnotení na danom staničení */
  issues: ModelIssue[];
}

export interface ParameterSet {
  /** statické problémy: názvy, syntax, úseky, neznáme odkazy, cykly */
  readonly issues: readonly ModelIssue[];
  /** platné parametre v topologickom poradí (závislosti skôr) */
  readonly order: readonly string[];
  readonly stationDependent: ReadonlySet<string>;
  /** všetky platné parametre na zobrazovanom staničení `sta` */
  evaluateAt(sta: number): ParameterEvaluation;
  value(name: string, sta: number): ValueResult;
}

const NAME = /^[\p{L}_][\p{L}\p{N}_]*$/u;
const RESERVED = new Set([STATION_VARIABLE, FREE_WIDTH_VARIABLE.toLowerCase(), ...FUNCTION_NAMES]);

/** Hodnota výrazu → jednotky modelu (ADR 0006): uhly ° → rad, ostatné bez zmeny. */
export const toModelValue = (unit: ParameterUnit, value: number): number =>
  unit === 'angle' ? (value * Math.PI) / 180 : value;

/**
 * Zostaví množinu parametrov: overí názvy, skompiluje staničné funkcie, nájde neznáme odkazy a cykly
 * a určí poradie vyhodnotenia. `onEvaluate` slúži len na meranie v testoch.
 */
export function buildParameterSet(
  parameters: readonly Parameter[],
  onEvaluate?: (name: string) => void,
): ParameterSet {
  const issues: ModelIssue[] = [];
  const compiled = new Map<string, CompiledStationFunction>();
  const invalid = new Set<string>();
  const seen = new Set<string>();

  for (const p of parameters) {
    if (seen.has(p.name)) {
      issues.push({ code: 'DuplicateParameterName', name: p.name });
      invalid.add(p.name);
      continue;
    }
    seen.add(p.name);
    if (!NAME.test(p.name) || RESERVED.has(p.name.toLowerCase())) {
      issues.push({ code: 'InvalidParameterName', name: p.name });
      invalid.add(p.name);
      continue;
    }
    const r = compileStationFunction(p.law, p.unit);
    if (r.ok) compiled.set(p.name, r.fn);
    else {
      issues.push(...r.issues.map((i) => ({ ...i, parameter: p.name })));
      invalid.add(p.name);
    }
  }

  for (const [name, fn] of compiled) {
    for (const ref of fn.references) {
      if (!seen.has(ref)) {
        issues.push({ code: 'UnknownReference', parameter: name, name: ref });
        invalid.add(name);
      }
    }
  }

  const order = topologicalOrder(compiled, issues, invalid);
  // neplatnosť sa šíri na závislé parametre (v topologickom poradí stačí jeden prechod)
  const valid: string[] = [];
  for (const name of order) {
    const fn = compiled.get(name) as CompiledStationFunction;
    const bad = [...fn.references].find((r) => invalid.has(r));
    if (invalid.has(name)) continue;
    if (bad !== undefined) {
      issues.push({ code: 'DependsOnInvalid', parameter: name, dependency: bad });
      invalid.add(name);
    } else valid.push(name);
  }

  const stationDependent = new Set<string>();
  for (const name of valid) {
    const fn = compiled.get(name) as CompiledStationFunction;
    if (fn.usesStation || [...fn.references].some((r) => stationDependent.has(r))) {
      stationDependent.add(name);
    }
  }

  let constants: ParameterEvaluation | undefined;
  const evaluateNames = (
    names: readonly string[],
    sta: number,
    base: ParameterEvaluation,
  ): ParameterEvaluation => {
    const values = new Map(base.values);
    const runtime = [...base.issues];
    const failed = new Set(runtime.map((i) => i.parameter));
    for (const name of names) {
      const fn = compiled.get(name) as CompiledStationFunction;
      const bad = [...fn.references].find((r) => failed.has(r));
      if (bad !== undefined) {
        runtime.push({ code: 'DependsOnInvalid', parameter: name, dependency: bad });
        failed.add(name);
        continue;
      }
      onEvaluate?.(name);
      const r = fn.at(sta, (n) => values.get(n));
      if (r.ok) values.set(name, r.value);
      else {
        runtime.push({ ...r.issue, parameter: name });
        failed.add(name);
      }
    }
    return { values, issues: runtime };
  };

  const set: ParameterSet = {
    issues,
    order: valid,
    stationDependent,
    evaluateAt(sta) {
      constants ??= evaluateNames(
        valid.filter((n) => !stationDependent.has(n)),
        Number.NaN,
        { values: new Map(), issues: [] },
      );
      return evaluateNames(
        valid.filter((n) => stationDependent.has(n)),
        sta,
        constants,
      );
    },
    value(name, sta) {
      const staticIssue = issues.find(
        (i) => i.parameter === name || (i.code === 'Cycle' && i.path.includes(name)),
      );
      if (staticIssue) return { ok: false, issue: staticIssue };
      const r = set.evaluateAt(sta);
      const v = r.values.get(name);
      if (v !== undefined) return { ok: true, value: v };
      const issue = r.issues.find((i) => i.parameter === name);
      return { ok: false, issue: issue ?? { code: 'UnknownReference', name } };
    },
  };
  return set;
}

/** Topologické poradie (DFS); cykly zapíše ako problém s cestou a ich parametre označí za neplatné. */
function topologicalOrder(
  compiled: ReadonlyMap<string, CompiledStationFunction>,
  issues: ModelIssue[],
  invalid: Set<string>,
): string[] {
  const order: string[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];

  const visit = (name: string) => {
    const s = state.get(name);
    if (s === 'done') return;
    if (s === 'visiting') {
      const path = [...stack.slice(stack.indexOf(name)), name];
      issues.push({ code: 'Cycle', path });
      for (const n of path) invalid.add(n);
      return;
    }
    state.set(name, 'visiting');
    stack.push(name);
    for (const ref of compiled.get(name)?.references ?? []) {
      if (compiled.has(ref)) visit(ref);
    }
    stack.pop();
    state.set(name, 'done');
    order.push(name);
  };

  for (const name of compiled.keys()) visit(name);
  return order;
}

/**
 * Overí, že hranice úsekov (zobrazované staničenia) ležia na osi jednoznačne (ADR 0006):
 * v medzere skoku → `StationNotOnAlignment`, v prekryve → `AmbiguousStation`.
 */
export function validateStations(
  parameters: readonly Parameter[],
  stationing: Stationing,
): ModelIssue[] {
  const issues: ModelIssue[] = [];
  for (const p of parameters) {
    if (p.law.kind !== 'piecewise') continue;
    const checked = new Set<number>();
    for (const station of p.law.segments.flatMap((s) => [s.from, s.to])) {
      if (checked.has(station)) continue;
      checked.add(station);
      const candidates = stationing.fromDisplayAll(station);
      if (candidates.length === 0)
        issues.push({ code: 'StationNotOnAlignment', parameter: p.name, station });
      else if (candidates.length > 1)
        issues.push({ code: 'AmbiguousStation', parameter: p.name, station });
    }
  }
  return issues;
}
