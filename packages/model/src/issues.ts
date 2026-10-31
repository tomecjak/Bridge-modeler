import type { ExprError } from '@bridge/expr';

export type ExpressionField =
  | 'value'
  | 'expr'
  | 'v0'
  | 'v1'
  | 'x'
  | 'y'
  | 'default'
  | 'crossingAngle'
  | 'offset'
  | 'bearingHeight'
  | 'foundationTop'
  | 'bearing'
  | 'dimension';

/** Prvok modelu, ktorého sa problém týka (prierez, NK, os mosta). */
export interface IssueOwner {
  kind: 'profile' | 'superstructure' | 'bridgeAxis' | 'support';
  name: string;
}

/**
 * Typované problémy modelu (parametre, staničné funkcie, projektový súbor). Bez textov — hlášky skladá UI.
 * `parameter` je názov parametra, ak sa problém týka konkrétneho parametra.
 */
export type ModelIssue = {
  parameter?: string;
  owner?: IssueOwner;
  point?: string;
  /** chýba = chyba; 'warning' = upozornenie, výsledok je použiteľný */
  severity?: 'warning';
} & (
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
  | { code: 'StationNotOnAlignment'; station: number }
  | { code: 'DuplicatePointName'; name: string }
  | { code: 'ForwardPointReference'; reference: string }
  | { code: 'UnknownPoint'; loop: string; name: string }
  | { code: 'UnknownReferencePoint'; name: string }
  | { code: 'MissingOuterLoop' }
  | { code: 'OpenLoop'; loop: string }
  | { code: 'DuplicateVertex'; loop: string; name: string }
  | { code: 'SelfIntersection'; loop: string; edges: [string, string] }
  | { code: 'LoopReversed'; loop: string }
  | { code: 'VoidOutsideOuter'; loop: string }
  | { code: 'UnknownAlignment'; name: string }
  | { code: 'UnknownBridgeAxis'; id: string }
  | { code: 'UnknownProfile'; id: string }
  | { code: 'UnknownProfileParameter'; name: string }
  /** krivka okraja (os z LandXML alebo čiara v pôdoryse) v projekte nie je */
  | { code: 'EdgeCurveNotFound'; curve: string }
  /** kolmica na os mosta na danej strane krivku nepretne */
  | { code: 'EdgeCurveNotReached'; curve: string; station: number }
  | { code: 'StationOutsideSuperstructure'; station: number; from: number; to: number }
  | { code: 'UnknownSuperstructure'; id: string }
  | { code: 'InvalidCrossingAngle'; angle: number }
  | { code: 'BearingOutsideDeck'; index: number; x: number }
  | { code: 'NonPositiveSupportHeight'; height: number }
  | { code: 'InvalidDimension'; name: string; value: number }
  | { code: 'SupportOrder'; support: string; expected: 'abutment' | 'pier' }
  | { code: 'DuplicateSupportStation'; station: number }
  | { code: 'SpanTooShort'; length: number; minimum: number }
  | { code: 'SpanAboveEconomic'; length: number; economic: number; typology: string }
  | { code: 'MissingSupports' }
  | { code: 'AmbiguousStation'; station: number }
  | { code: 'InvalidJson'; detail: string }
  /** súbor nie je knižnica prierezov (chýba značka formátu) */
  | { code: 'NotAProfileLibrary' }
  | { code: 'UnsupportedSchemaVersion'; version: string }
  | { code: 'SchemaViolation'; path: string; message: string }
);

export type ModelIssueCode = ModelIssue['code'];
