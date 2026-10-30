import type { Node } from './ast.ts';
import type { ExprError, Span, ValueType } from './errors.ts';
import { parse } from './parser.ts';

export type Value = number | boolean;
export type Scope = (name: string) => Value | undefined;
export type EvalResult = { ok: true; value: Value } | { ok: false; error: ExprError };

/** Relatívna tolerancia rovnosti čísel (0,1 + 0,2 = 0,3 má platiť). */
const EQUALITY_TOLERANCE = 1e-9;
const DEG = Math.PI / 180;

class EvaluationFailure {
  constructor(readonly error: ExprError) {}
}

const fail = (error: ExprError): never => {
  throw new EvaluationFailure(error);
};

const typeOf = (v: Value): ValueType => (typeof v === 'boolean' ? 'boolean' : 'number');

function num(v: Value, span: Span): number {
  if (typeof v !== 'number')
    fail({ code: 'TypeMismatch', expected: 'number', actual: typeOf(v), span });
  return v as number;
}

function bool(v: Value, span: Span): boolean {
  if (typeof v !== 'boolean')
    fail({ code: 'TypeMismatch', expected: 'boolean', actual: typeOf(v), span });
  return v as boolean;
}

function finite(v: number, span: Span): number {
  if (!Number.isFinite(v)) fail({ code: 'NotFinite', span });
  return v;
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= EQUALITY_TOLERANCE * Math.max(1, Math.abs(a), Math.abs(b));
}

/** Zaokrúhlenie „od nuly“ ako v Revite: round(2,5) = 3, round(−2,5) = −3. */
const roundHalfAway = (x: number) => Math.sign(x) * Math.floor(Math.abs(x) + 0.5);

type MathFn = (x: number) => number;
const UNARY: Record<string, { fn: MathFn; domain?: (x: number) => boolean }> = {
  sin: { fn: (x) => Math.sin(x * DEG) },
  cos: { fn: (x) => Math.cos(x * DEG) },
  tan: { fn: (x) => Math.tan(x * DEG) },
  asin: { fn: (x) => Math.asin(x) / DEG, domain: (x) => x >= -1 && x <= 1 },
  acos: { fn: (x) => Math.acos(x) / DEG, domain: (x) => x >= -1 && x <= 1 },
  atan: { fn: (x) => Math.atan(x) / DEG },
  sqrt: { fn: Math.sqrt, domain: (x) => x >= 0 },
  abs: { fn: Math.abs },
  round: { fn: roundHalfAway },
  roundup: { fn: Math.ceil },
  rounddown: { fn: Math.floor },
  exp: { fn: Math.exp },
  ln: { fn: Math.log, domain: (x) => x > 0 },
  log: { fn: Math.log10, domain: (x) => x > 0 },
};

function evalNode(node: Node, scope: Scope): Value {
  switch (node.type) {
    case 'num':
      return node.value;
    case 'ident': {
      const v = scope(node.name);
      if (v === undefined)
        return fail({ code: 'UnknownIdentifier', name: node.name, span: node.span });
      return v;
    }
    case 'unary': {
      const v = num(evalNode(node.operand, scope), node.operand.span);
      return node.op === '-' ? -v : v;
    }
    case 'binary':
      return evalBinary(node as Extract<Node, { type: 'binary' }>, scope);
    case 'call':
      return evalCall(node as Extract<Node, { type: 'call' }>, scope);
  }
}

function evalBinary(node: Extract<Node, { type: 'binary' }>, scope: Scope): Value {
  const l = evalNode(node.left, scope);
  const r = evalNode(node.right, scope);
  if (node.op === '=' || node.op === '<>') {
    if (typeOf(l) !== typeOf(r)) {
      return fail({
        code: 'TypeMismatch',
        expected: typeOf(l),
        actual: typeOf(r),
        span: node.right.span,
      });
    }
    const equal = typeof l === 'number' ? nearlyEqual(l, r as number) : l === r;
    return node.op === '=' ? equal : !equal;
  }
  const a = num(l, node.left.span);
  const b = num(r, node.right.span);
  switch (node.op) {
    case '+':
      return finite(a + b, node.span);
    case '-':
      return finite(a - b, node.span);
    case '*':
      return finite(a * b, node.span);
    case '/':
      if (b === 0) return fail({ code: 'DivisionByZero', span: node.span });
      return finite(a / b, node.span);
    case '^':
      return finite(a ** b, node.span);
    case '<':
      return a < b;
    case '>':
      return a > b;
    case '<=':
      return a <= b;
    case '>=':
      return a >= b;
  }
}

function evalCall(node: Extract<Node, { type: 'call' }>, scope: Scope): Value {
  const args = node.args;
  const arg = (i: number) => args[i] as Node;
  switch (node.name) {
    case 'if':
      return bool(evalNode(arg(0), scope), arg(0).span)
        ? evalNode(arg(1), scope)
        : evalNode(arg(2), scope);
    case 'and':
      return args.every((a) => bool(evalNode(a, scope), a.span));
    case 'or':
      return args.some((a) => bool(evalNode(a, scope), a.span));
    case 'not':
      return !bool(evalNode(arg(0), scope), arg(0).span);
    case 'pi':
      return Math.PI;
    case 'min':
    case 'max': {
      const values = args.map((a) => num(evalNode(a, scope), a.span));
      return node.name === 'min' ? Math.min(...values) : Math.max(...values);
    }
  }
  const unary = UNARY[node.name];
  if (!unary) return fail({ code: 'UnknownFunction', name: node.name, span: node.span });
  const x = num(evalNode(arg(0), scope), arg(0).span);
  if (unary.domain && !unary.domain(x))
    return fail({ code: 'DomainError', name: node.name, span: node.span });
  return finite(unary.fn(x), node.span);
}

/** Vyhodnotí AST v danom rozsahu premenných. Chyby vracia ako hodnotu, nevyhadzuje. */
export function evaluate(ast: Node, scope: Scope): EvalResult {
  try {
    return { ok: true, value: evalNode(ast, scope) };
  } catch (e) {
    if (e instanceof EvaluationFailure) return { ok: false, error: e.error };
    throw e;
  }
}

/** Rozparsuje a vyhodnotí výraz. */
export function evaluateText(text: string, scope: Scope): EvalResult {
  const parsed = parse(text);
  return parsed.ok ? evaluate(parsed.ast, scope) : parsed;
}

/** Názvy premenných (parametrov), na ktoré výraz odkazuje. */
export function references(ast: Node): Set<string> {
  const names = new Set<string>();
  const walk = (n: Node) => {
    if (n.type === 'ident') names.add(n.name);
    else if (n.type === 'unary') walk(n.operand);
    else if (n.type === 'binary') {
      walk(n.left);
      walk(n.right);
    } else if (n.type === 'call') n.args.forEach(walk);
  };
  walk(ast);
  return names;
}
