import { describe, expect, it } from 'vitest';
import type { Node } from './ast.ts';
import { parse } from './parser.ts';

/** AST → zátvorkový zápis pre čitateľné porovnanie. */
function show(n: Node): string {
  switch (n.type) {
    case 'num':
      return String(n.value);
    case 'ident':
      return n.name;
    case 'unary':
      return `(${n.op}${show(n.operand)})`;
    case 'binary':
      return `(${show(n.left)} ${n.op} ${show(n.right)})`;
    case 'call':
      return `${n.name}(${n.args.map(show).join(', ')})`;
  }
}

function ok(text: string): string {
  const r = parse(text);
  if (!r.ok) throw new Error(`parse failed: ${JSON.stringify(r.error)}`);
  return show(r.ast);
}

function err(text: string) {
  const r = parse(text);
  if (r.ok) throw new Error(`expected error for ${text}`);
  return r.error;
}

describe('parse — precedence and associativity', () => {
  it('respects arithmetic precedence', () => {
    expect(ok('1 + 2 * 3')).toBe('(1 + (2 * 3))');
    expect(ok('(1 + 2) * 3')).toBe('((1 + 2) * 3)');
    expect(ok('a - b - c')).toBe('((a - b) - c)');
    expect(ok('a / b * c')).toBe('((a / b) * c)');
  });

  it('makes ^ right-associative and binds tighter than unary minus', () => {
    expect(ok('2 ^ 3 ^ 2')).toBe('(2 ^ (3 ^ 2))');
    expect(ok('-2 ^ 2')).toBe('(-(2 ^ 2))');
    expect(ok('2 ^ -1')).toBe('(2 ^ (-1))');
  });

  it('puts comparisons below arithmetic', () => {
    expect(ok('a + 1 >= b * 2')).toBe('((a + 1) >= (b * 2))');
    expect(ok('a <> b')).toBe('(a <> b)');
    expect(ok('a = b')).toBe('(a = b)');
  });

  it('parses function calls with any number of arguments', () => {
    expect(ok('if(h > 1, h, 1)')).toBe('if((h > 1), h, 1)');
    expect(ok('max(a, b, c, 2)')).toBe('max(a, b, c, 2)');
    expect(ok('pi() / 2')).toBe('(pi() / 2)');
    expect(ok('SIN(30)')).toBe('sin(30)');
  });

  it('parses numbers and Unicode identifiers', () => {
    expect(ok('.5 + 2. + 1e-3 + 1.5E+2')).toBe('(((0.5 + 2) + 0.001) + 150)');
    expect(ok('výška_NK + šírka2')).toBe('(výška_NK + šírka2)');
  });

  it('records source spans', () => {
    const r = parse('h0 + 0.35');
    if (!r.ok || r.ast.type !== 'binary') throw new Error('expected binary');
    expect(r.ast.span).toEqual({ start: 0, end: 9 });
    expect(r.ast.right.span).toEqual({ start: 5, end: 9 });
  });
});

describe('parse — errors with position', () => {
  it('reports empty input and unexpected end', () => {
    expect(err('   ')).toMatchObject({ code: 'EmptyExpression' });
    expect(err('1 +')).toMatchObject({ code: 'UnexpectedEnd', span: { start: 3, end: 3 } });
    expect(err('(1 + 2')).toMatchObject({ code: 'UnexpectedEnd' });
  });

  it('reports unexpected characters and tokens', () => {
    expect(err('1 $ 2')).toMatchObject({
      code: 'UnexpectedChar',
      char: '$',
      span: { start: 2, end: 3 },
    });
    expect(err('1 2')).toMatchObject({
      code: 'UnexpectedToken',
      token: '2',
      span: { start: 2, end: 3 },
    });
    expect(err('a + * b')).toMatchObject({ code: 'UnexpectedToken', token: '*' });
    expect(err('1,5')).toMatchObject({ code: 'UnexpectedToken', token: ',' });
  });

  it('checks function names and argument counts', () => {
    expect(err('foo(1)')).toMatchObject({
      code: 'UnknownFunction',
      name: 'foo',
      span: { start: 0, end: 3 },
    });
    expect(err('sin(1, 2)')).toMatchObject({
      code: 'WrongArgCount',
      name: 'sin',
      min: 1,
      max: 1,
      actual: 2,
    });
    expect(err('if(a, b)')).toMatchObject({ code: 'WrongArgCount', name: 'if' });
    expect(err('max()')).toMatchObject({ code: 'WrongArgCount', name: 'max' });
  });
});
