import type { BinaryOp, Node } from './ast.ts';
import type { ExprError, Span } from './errors.ts';
import { SIGNATURES } from './functions.ts';
import { type Token, tokenize } from './tokenizer.ts';

export type ParseResult = { ok: true; ast: Node } | { ok: false; error: ExprError };

/** Väzbová sila binárnych operátorov (Pratt); ^ je pravo-asociatívny. */
const BINDING: Partial<Record<string, { left: number; right: number }>> = {
  '=': { left: 10, right: 11 },
  '<>': { left: 10, right: 11 },
  '<': { left: 10, right: 11 },
  '>': { left: 10, right: 11 },
  '<=': { left: 10, right: 11 },
  '>=': { left: 10, right: 11 },
  '+': { left: 20, right: 21 },
  '-': { left: 20, right: 21 },
  '*': { left: 30, right: 31 },
  '/': { left: 30, right: 31 },
  '^': { left: 50, right: 49 },
};
const UNARY_BINDING = 40;

class ParseError {
  readonly error: ExprError;
  constructor(error: ExprError) {
    this.error = error;
  }
}

const join = (a: Span, b: Span): Span => ({ start: a.start, end: b.end });

/** Rozparsuje výraz na AST. Nikdy nepoužíva `eval` ani `new Function` (CLAUDE.md). */
export function parse(text: string): ParseResult {
  const lexed = tokenize(text);
  if ('error' in lexed) return { ok: false, error: lexed.error };
  const tokens = lexed.tokens;
  if (tokens.length === 1) {
    return { ok: false, error: { code: 'EmptyExpression', span: { start: 0, end: text.length } } };
  }
  let pos = 0;
  const peek = () => tokens[pos] as Token;
  const next = () => tokens[pos++] as Token;

  const unexpected = (t: Token): never => {
    throw new ParseError(
      t.kind === 'eof'
        ? { code: 'UnexpectedEnd', span: t.span }
        : { code: 'UnexpectedToken', token: t.text, span: t.span },
    );
  };

  const expect = (op: string): Token => {
    const t = next();
    if (t.kind !== 'op' || t.text !== op) unexpected(t);
    return t;
  };

  function expression(minBinding: number): Node {
    let left = prefix();
    for (;;) {
      const t = peek();
      const bp = t.kind === 'op' ? BINDING[t.text] : undefined;
      if (!bp || bp.left < minBinding) return left;
      next();
      const right = expression(bp.right);
      left = {
        type: 'binary',
        op: t.text as BinaryOp,
        left,
        right,
        span: join(left.span, right.span),
      };
    }
  }

  function prefix(): Node {
    const t = next();
    if (t.kind === 'number') return { type: 'num', value: t.value, span: t.span };
    if (t.kind === 'op' && (t.text === '-' || t.text === '+')) {
      const operand = expression(UNARY_BINDING);
      return { type: 'unary', op: t.text, operand, span: join(t.span, operand.span) };
    }
    if (t.kind === 'op' && t.text === '(') {
      const inner = expression(0);
      const close = expect(')');
      return { ...inner, span: join(t.span, close.span) };
    }
    if (t.kind === 'ident') {
      const after = peek();
      if (after.kind === 'op' && after.text === '(') return call(t);
      return { type: 'ident', name: t.text, span: t.span };
    }
    return unexpected(t);
  }

  function call(nameToken: Token): Node {
    const name = nameToken.text.toLowerCase();
    const signature = SIGNATURES[name];
    if (!signature)
      throw new ParseError({ code: 'UnknownFunction', name: nameToken.text, span: nameToken.span });
    expect('(');
    const args: Node[] = [];
    if (!(peek().kind === 'op' && peek().text === ')')) {
      for (;;) {
        args.push(expression(0));
        const t = peek();
        if (t.kind === 'op' && t.text === ',') {
          next();
          continue;
        }
        break;
      }
    }
    const close = expect(')');
    const span = join(nameToken.span, close.span);
    if (args.length < signature.min || args.length > signature.max) {
      throw new ParseError({
        code: 'WrongArgCount',
        name,
        min: signature.min,
        max: signature.max,
        actual: args.length,
        span,
      });
    }
    return { type: 'call', name, args, span };
  }

  try {
    const ast = expression(0);
    const rest = peek();
    if (rest.kind !== 'eof') unexpected(rest);
    return { ok: true, ast };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.error };
    throw e;
  }
}
