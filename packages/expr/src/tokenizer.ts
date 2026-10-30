import type { ExprError, Span } from './errors.ts';

export type Token = { span: Span; text: string } & (
  | { kind: 'number'; value: number }
  | { kind: 'ident' }
  | { kind: 'op' }
  | { kind: 'eof' }
);

const NUMBER = /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/y;
const IDENT = /[\p{L}_][\p{L}\p{N}_]*/uy;
const OPERATORS = ['<=', '>=', '<>', '+', '-', '*', '/', '^', '(', ')', ',', '<', '>', '='];

/** Rozdelí výraz na tokeny; pri neznámom znaku vráti chybu s jeho polohou. */
export function tokenize(text: string): { tokens: Token[] } | { error: ExprError } {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i] as string;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    NUMBER.lastIndex = i;
    const num = NUMBER.exec(text);
    if (num) {
      const end = i + num[0].length;
      tokens.push({ kind: 'number', value: Number(num[0]), text: num[0], span: { start: i, end } });
      i = end;
      continue;
    }
    IDENT.lastIndex = i;
    const ident = IDENT.exec(text);
    if (ident) {
      const end = i + ident[0].length;
      tokens.push({ kind: 'ident', text: ident[0], span: { start: i, end } });
      i = end;
      continue;
    }
    const op = OPERATORS.find((o) => text.startsWith(o, i));
    if (op) {
      tokens.push({ kind: 'op', text: op, span: { start: i, end: i + op.length } });
      i += op.length;
      continue;
    }
    const char = String.fromCodePoint(text.codePointAt(i) as number);
    return { error: { code: 'UnexpectedChar', char, span: { start: i, end: i + char.length } } };
  }
  tokens.push({ kind: 'eof', text: '', span: { start: text.length, end: text.length } });
  return { tokens };
}
