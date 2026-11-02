/**
 * Typované problémy čítania DXF a priradenia výšok meračky. Neobsahujú texty — hlášky pre projektanta skladá UI.
 * `severity: 'error'` znamená, že súbor sa nedá použiť; `'warning'` je upozornenie. Súradnice sú v DXF (m).
 */
export type SurveyIssue = { severity: 'error' | 'warning' } & (
  | { code: 'BinaryDxf' }
  | { code: 'MalformedDxf'; line: number; detail: string }
  | { code: 'UnsupportedUnits'; units: number }
  | { code: 'UnitsAssumed' }
  | { code: 'NoEntities' }
  | { code: 'PointWithoutHeight'; x: number; y: number; number: string | undefined }
  | { code: 'HeightWithoutPoint'; x: number; y: number; value: number }
  | {
      code: 'AmbiguousHeight';
      x: number;
      y: number;
      number: string | undefined;
      value: number;
      distance: number;
    }
  | { code: 'NonNumericHeight'; x: number; y: number; text: string }
);

export type SurveyIssueCode = SurveyIssue['code'];
