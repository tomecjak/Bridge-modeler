import type { Span } from './errors.ts';

export type UnaryOp = '-' | '+';
export type BinaryOp = '+' | '-' | '*' | '/' | '^' | '<' | '>' | '=' | '<=' | '>=' | '<>';

export type Node = { span: Span } & (
  | { type: 'num'; value: number }
  | { type: 'ident'; name: string }
  | { type: 'unary'; op: UnaryOp; operand: Node }
  | { type: 'binary'; op: BinaryOp; left: Node; right: Node }
  | { type: 'call'; name: string; args: Node[] }
);
