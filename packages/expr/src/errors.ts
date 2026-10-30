/** Rozsah znakov vo výraze ⟨start, end), na podčiarknutie chyby v UI. */
export interface Span {
  start: number;
  end: number;
}

export type ValueType = 'number' | 'boolean';

/** Typované chyby výrazu; texty pre projektanta skladá UI. */
export type ExprError = { span: Span } & (
  | { code: 'EmptyExpression' }
  | { code: 'UnexpectedChar'; char: string }
  | { code: 'UnexpectedToken'; token: string }
  | { code: 'UnexpectedEnd' }
  | { code: 'UnknownFunction'; name: string }
  | { code: 'WrongArgCount'; name: string; min: number; max: number; actual: number }
  | { code: 'UnknownIdentifier'; name: string }
  | { code: 'TypeMismatch'; expected: ValueType; actual: ValueType }
  | { code: 'DivisionByZero' }
  | { code: 'DomainError'; name: string }
  | { code: 'NotFinite' }
);

export type ExprErrorCode = ExprError['code'];
