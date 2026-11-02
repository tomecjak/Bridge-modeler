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
  | 'foundationCover'
  | 'supportHeight'
  | 'foundationLevel'
  | 'bearing'
  | 'dimension';

/** Prvok modelu, ktorého sa problém týka (prierez, NK, os mosta). */
export interface IssueOwner {
  kind:
    | 'profile'
    | 'superstructure'
    | 'bridgeAxis'
    | 'support'
    | 'bearingLine'
    | 'obstacle'
    | 'edgeBeam';
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
  | { code: 'UnknownBearingLine'; id: string }
  /** os uloženia bez podpery (ADR 0017) — polia sa počítajú, 3D a výkresy ju nemajú */
  | { code: 'BearingLineWithoutSupport'; line: string }
  /** na jednej osi uloženia stojí viac podpier */
  | { code: 'BearingLineOccupied'; line: string; supports: string[] }
  /** priečnik na osi uloženia odkazuje na prierez, ktorý v projekte nie je (ADR 0018) */
  | { code: 'UnknownCrossbeamProfile'; line: string; id: string }
  /** pás priečnika siaha mimo NK */
  | { code: 'CrossbeamOutsideDeck'; line: string }
  /** pásy priečnikov susedných osí sa prekrývajú */
  | { code: 'CrossbeamOverlap'; lines: [string, string] }
  | { code: 'InvalidCrossingAngle'; angle: number }
  /** os prekážky (krivka) v projekte nie je (ADR 0020) */
  | { code: 'ObstacleCurveNotFound'; curve: string }
  /** spodok NK zasahuje do voľného prierezu: potrebná a skutočná voľná výška [m] (ADR 0020) */
  | { code: 'ClearanceViolated'; required: number; actual: number; station: number }
  /** pôdorys podpery zasahuje do pásu voľného prierezu */
  | { code: 'SupportInClearance'; support: string }
  /** prekážka nekríži os mosta v okolí NK */
  | { code: 'ObstacleWithoutCrossing' }
  /** úroveň podľa nivelety potrebuje os z LandXML s niveletou, podľa čiary čiaru meračky */
  | { code: 'ObstacleLevelUnavailable'; level: 'grade' | 'line' }
  | { code: 'BearingOutsideDeck'; index: number; x: number }
  | { code: 'NonPositiveSupportHeight'; height: number }
  /** založenie podľa terénu bez terénu v strede podpery — základ je odhadnutý pod spodkom NK (ADR 0019) */
  | { code: 'FoundationWithoutTerrain'; estimate: number }
  /** horná hrana základu je nad terénom v strede podpery */
  | { code: 'FoundationAboveTerrain'; by: number }
  /** výška podpery sa meria od ložiska, podpera nemá žiadne */
  | { code: 'SupportHeightWithoutBearings' }
  | { code: 'InvalidDimension'; name: string; value: number }
  | { code: 'SupportOrder'; support: string; expected: 'abutment' | 'pier' }
  | { code: 'DuplicateBearingLineStation'; station: number }
  | { code: 'SpanTooShort'; length: number; minimum: number }
  | { code: 'SpanAboveEconomic'; length: number; economic: number; typology: string }
  /**
   * štíhlosť NK L/h mimo orientačného rozsahu typológie (ADR 0022): v strede poľa (`label` = číslo poľa) alebo nad
   * podperou (`label` = os uloženia)
   */
  | {
      code: 'Slenderness';
      where: 'field' | 'support';
      label: string;
      depth: number;
      length: number;
      ratio: number;
      min: number;
      max: number;
      typology: string;
    }
  /** NK zasahuje do nábehu klopenia osi cesty z LandXML (zobrazované staničenia, ADR 0022) */
  | { code: 'DeckInSuperelevationTransition'; from: number; to: number }
  /** priečny sklon NK `q` sa líši od plného klopenia z LandXML [m/m] */
  | { code: 'CrossSlopeMismatch'; station: number; q: number; superelevation: number }
  /** krajné pole mimo orientačného pomeru k susednému vnútornému poľu (ADR 0022) */
  | { code: 'EndSpanRatio'; span: 'first' | 'last'; ratio: number; min: number; max: number }
  | { code: 'MissingBearingLines' }
  | { code: 'AmbiguousStation'; station: number }
  | { code: 'InvalidJson'; detail: string }
  /** súbor nie je knižnica prierezov (chýba značka formátu) */
  | { code: 'NotAProfileLibrary' }
  /** súbor nie je knižnica podpier (ADR 0019) */
  | { code: 'NotASupportLibrary' }
  | { code: 'UnsupportedSchemaVersion'; version: string }
  | { code: 'SchemaViolation'; path: string; message: string }
);

export type ModelIssueCode = ModelIssue['code'];
