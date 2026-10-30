/**
 * Typované problémy pri importe a výpočte osi. Neobsahujú texty — hlášky pre projektanta skladá UI.
 * `severity: 'error'` znamená, že os sa nedá použiť; `'warning'` je upozornenie.
 */
export type AlignmentIssue = { severity: 'error' | 'warning'; alignment?: string } & (
  | { code: 'InvalidXml'; detail: string }
  | { code: 'NoAlignments' }
  | { code: 'MissingUnits' }
  | { code: 'UnsupportedUnit'; quantity: 'linear' | 'angular' | 'direction'; unit: string }
  | { code: 'UnsupportedElement'; element: string }
  | { code: 'UnsupportedSpiralType'; spiralType: string; index: number }
  | { code: 'UnsupportedVerticalCurve'; curveType: string }
  | { code: 'InvalidValue'; element: string; field: string; value: string }
  | { code: 'CoordinateSystemMismatch'; x: number; y: number }
  | { code: 'GeometryMismatch'; index: number; deviation: number }
  | { code: 'DirectionMismatch'; index: number; deviation: number }
  | { code: 'LengthMismatch'; declared: number; computed: number }
);

export type AlignmentIssueCode = AlignmentIssue['code'];
