import type { ExprError } from '@bridge/expr';

export type ExpressionField = 'value' | 'expr' | 'v0' | 'v1';

/**
 * Typované problémy modelu (parametre, staničné funkcie, projektový súbor). Bez textov — hlášky skladá UI.
 * `parameter` je názov parametra, ak sa problém týka konkrétneho parametra.
 */
export type ModelIssue = { parameter?: string } & (
  | {
      code: 'ExpressionError';
      field: ExpressionField;
      segment?: number;
      expression: string;
      error: ExprError;
    }
  | { code: 'NotANumber'; field: ExpressionField; segment?: number }
  | { code: 'EmptyPiecewise' }
  | { code: 'SegmentOrder'; segment: number }
  | { code: 'SegmentGap'; segment: number; from: number; previousTo: number }
  | { code: 'SegmentOverlap'; segment: number; from: number; previousTo: number }
  | { code: 'MissingVertex'; segment: number }
  | { code: 'CircularShapeNotAllowed'; segment: number }
  | { code: 'StationOutsideFunction'; sta: number; from: number; to: number }
  | { code: 'InvalidParameterName'; name: string }
  | { code: 'DuplicateParameterName'; name: string }
  | { code: 'UnknownReference'; name: string }
  | { code: 'Cycle'; path: string[] }
  | { code: 'DependsOnInvalid'; dependency: string }
  | { code: 'InvalidJson'; detail: string }
  | { code: 'UnsupportedSchemaVersion'; version: string }
  | { code: 'SchemaViolation'; path: string; message: string }
);

export type ModelIssueCode = ModelIssue['code'];
