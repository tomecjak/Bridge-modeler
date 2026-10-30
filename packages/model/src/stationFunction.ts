import { evaluate, references as exprReferences, type Node, parse, type Scope } from '@bridge/expr';
import type { ExpressionField, ModelIssue } from './issues.ts';
import {
  type ParameterUnit,
  type Segment,
  STATION_VARIABLE,
  type StationFunction,
} from './types.ts';

export type ValueResult = { ok: true; value: number } | { ok: false; issue: ModelIssue };

export interface CompiledStationFunction {
  /** názvy parametrov, na ktoré funkcia odkazuje (bez `sta`) */
  readonly references: ReadonlySet<string>;
  /** funkcia závisí priamo od staničenia (nie je konštantná) */
  readonly usesStation: boolean;
  /** rozsah zobrazovaného staničenia pre úsekovú funkciu */
  readonly range: { from: number; to: number } | undefined;
  /** hodnota na zobrazovanom staničení `sta`; `scope` dodáva hodnoty ostatných parametrov */
  at(sta: number, scope: Scope): ValueResult;
}

const BOUNDARY_TOLERANCE = 1e-9;

interface CompiledExpr {
  ast: Node;
  text: string;
  field: ExpressionField;
  segment?: number;
}

/** Skompiluje staničnú funkciu: rozparsuje výrazy a overí úseky. Vráti všetky zistené problémy. */
export function compileStationFunction(
  fn: StationFunction,
  unit: ParameterUnit,
): { ok: true; fn: CompiledStationFunction } | { ok: false; issues: ModelIssue[] } {
  const issues: ModelIssue[] = [];
  const names = new Set<string>();
  let usesStation = fn.kind !== 'constant';

  const compile = (
    text: string,
    field: ExpressionField,
    segment?: number,
  ): CompiledExpr | undefined => {
    const parsed = parse(text);
    const where = segment === undefined ? {} : { segment };
    if (!parsed.ok) {
      issues.push({
        code: 'ExpressionError',
        field,
        ...where,
        expression: text,
        error: parsed.error,
      });
      return undefined;
    }
    for (const name of exprReferences(parsed.ast)) {
      if (name === STATION_VARIABLE) usesStation = true;
      else names.add(name);
    }
    return { ast: parsed.ast, text, field, ...where };
  };

  let at: CompiledStationFunction['at'] = () => {
    throw new Error('unreachable');
  };
  let range: CompiledStationFunction['range'];

  if (fn.kind === 'constant' || fn.kind === 'expression') {
    const field = fn.kind === 'constant' ? 'value' : 'expr';
    const expr = compile(fn.kind === 'constant' ? fn.value : fn.expr, field);
    if (expr) at = (sta, scope) => evalExpr(expr, withStation(scope, sta));
  } else {
    validateSegments(fn.segments, unit, issues);
    const compiled = fn.segments.map((s, i) => ({
      segment: s,
      v0: compile(s.v0, 'v0', i),
      v1: compile(s.v1, 'v1', i),
    }));
    const first = fn.segments[0];
    const last = fn.segments[fn.segments.length - 1];
    if (first && last) range = { from: first.from, to: last.to };
    at = (sta, scope) => {
      if (!range || sta < range.from - BOUNDARY_TOLERANCE || sta > range.to + BOUNDARY_TOLERANCE) {
        return {
          ok: false,
          issue: {
            code: 'StationOutsideFunction',
            sta,
            from: range?.from ?? Number.NaN,
            to: range?.to ?? Number.NaN,
          },
        };
      }
      // na spoločnej hranici platí nasledujúci úsek
      let index = 0;
      for (let i = compiled.length - 1; i >= 0; i--) {
        if (sta >= (compiled[i] as (typeof compiled)[number]).segment.from - BOUNDARY_TOLERANCE) {
          index = i;
          break;
        }
      }
      const c = compiled[index] as (typeof compiled)[number];
      if (!c.v0 || !c.v1) throw new Error('unreachable: compiled with issues');
      const s = withStation(scope, sta);
      const a = evalExpr(c.v0, s);
      if (!a.ok) return a;
      const b = evalExpr(c.v1, s);
      if (!b.ok) return b;
      return { ok: true, value: shapeValue(c.segment, sta, a.value, b.value) };
    };
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, fn: { references: names, usesStation, range, at } };
}

function validateSegments(segments: readonly Segment[], unit: ParameterUnit, issues: ModelIssue[]) {
  if (segments.length === 0) issues.push({ code: 'EmptyPiecewise' });
  segments.forEach((s, i) => {
    if (!(s.to > s.from)) issues.push({ code: 'SegmentOrder', segment: i });
    if (s.shape !== 'linear' && !s.vertexAt) issues.push({ code: 'MissingVertex', segment: i });
    if (s.shape === 'circular' && unit !== 'length') {
      issues.push({ code: 'CircularShapeNotAllowed', segment: i });
    }
    const prev = segments[i - 1];
    if (prev) {
      if (s.from > prev.to + BOUNDARY_TOLERANCE) {
        issues.push({ code: 'SegmentGap', segment: i, from: s.from, previousTo: prev.to });
      } else if (s.from < prev.to - BOUNDARY_TOLERANCE) {
        issues.push({ code: 'SegmentOverlap', segment: i, from: s.from, previousTo: prev.to });
      }
    }
  });
}

/**
 * Hodnota v úseku podľa tvaru (ADR 0006). `t ∈ ⟨0, 1⟩` od `from` po `to`.
 * Parabola a kružnica majú vodorovnú dotyčnicu v konci `vertexAt`.
 */
export function shapeValue(segment: Segment, sta: number, v0: number, v1: number): number {
  const length = segment.to - segment.from;
  const t = Math.min(1, Math.max(0, (sta - segment.from) / length));
  if (segment.shape === 'linear') return v0 + (v1 - v0) * t;
  const atStart = segment.vertexAt === 'start';
  const vertexValue = atStart ? v0 : v1;
  const otherValue = atStart ? v1 : v0;
  const u = atStart ? t : 1 - t; // vzdialenosť od vrcholu, pomerne
  const delta = otherValue - vertexValue;
  if (segment.shape === 'parabolic') return vertexValue + delta * u * u;
  if (delta === 0) return vertexValue;
  const d = u * length;
  const r = (length * length + delta * delta) / (2 * Math.abs(delta));
  return vertexValue + Math.sign(delta) * (r - Math.sqrt(Math.max(0, r * r - d * d)));
}

function withStation(scope: Scope, sta: number): Scope {
  return (name) => (name === STATION_VARIABLE ? sta : scope(name));
}

function evalExpr(c: CompiledExpr, scope: Scope): ValueResult {
  const where = c.segment === undefined ? {} : { segment: c.segment };
  const r = evaluate(c.ast, scope);
  if (!r.ok) {
    return {
      ok: false,
      issue: {
        code: 'ExpressionError',
        field: c.field,
        ...where,
        expression: c.text,
        error: r.error,
      },
    };
  }
  if (typeof r.value !== 'number')
    return { ok: false, issue: { code: 'NotANumber', field: c.field, ...where } };
  return { ok: true, value: r.value };
}
