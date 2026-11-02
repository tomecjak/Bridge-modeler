import type { AlignmentIssue, AlignmentIssueCode } from '@bridge/alignment';
import type { ModelIssue, ModelIssueCode } from '@bridge/model';
import { formatIssue } from '../i18n/issues.ts';
import { formatModelIssue } from '../i18n/modelIssues.ts';
import type { BrowserTarget } from './browserTree.ts';

/** Skupina kontroly v paneli Kontroly (ADR 0022), v poradí zobrazenia. */
export const CHECK_GROUPS = [
  'geometry',
  'spans',
  'slenderness',
  'clearance',
  'superelevation',
  'foundation',
  'other',
] as const;
export type CheckGroup = (typeof CHECK_GROUPS)[number];

/** Skupina každého kódu problému modelu; nový kód bez skupiny je chyba typu. */
const MODEL_GROUPS = {
  ExpressionError: 'other',
  NotANumber: 'other',
  EmptyPiecewise: 'other',
  SegmentOrder: 'other',
  SegmentGap: 'other',
  SegmentOverlap: 'other',
  MissingVertex: 'other',
  CircularShapeNotAllowed: 'other',
  StationOutsideFunction: 'other',
  InvalidParameterName: 'other',
  DuplicateParameterName: 'other',
  UnknownReference: 'other',
  Cycle: 'other',
  DependsOnInvalid: 'other',
  StationNotOnAlignment: 'geometry',
  DuplicatePointName: 'geometry',
  ForwardPointReference: 'geometry',
  UnknownPoint: 'geometry',
  UnknownReferencePoint: 'geometry',
  MissingOuterLoop: 'geometry',
  OpenLoop: 'geometry',
  DuplicateVertex: 'geometry',
  SelfIntersection: 'geometry',
  LoopReversed: 'geometry',
  VoidOutsideOuter: 'geometry',
  UnknownAlignment: 'geometry',
  UnknownBridgeAxis: 'geometry',
  UnknownProfile: 'geometry',
  UnknownProfileParameter: 'geometry',
  EdgeCurveNotFound: 'geometry',
  EdgeCurveNotReached: 'geometry',
  StationOutsideSuperstructure: 'geometry',
  UnknownSuperstructure: 'geometry',
  UnknownBearingLine: 'geometry',
  BearingLineWithoutSupport: 'spans',
  BearingLineOccupied: 'spans',
  UnknownCrossbeamProfile: 'geometry',
  CrossbeamOutsideDeck: 'geometry',
  CrossbeamOverlap: 'geometry',
  InvalidCrossingAngle: 'geometry',
  ObstacleCurveNotFound: 'clearance',
  ClearanceViolated: 'clearance',
  SupportInClearance: 'clearance',
  ObstacleWithoutCrossing: 'clearance',
  ObstacleLevelUnavailable: 'clearance',
  BearingOutsideDeck: 'geometry',
  NonPositiveSupportHeight: 'foundation',
  FoundationWithoutTerrain: 'foundation',
  FoundationAboveTerrain: 'foundation',
  SupportHeightWithoutBearings: 'foundation',
  InvalidDimension: 'geometry',
  SupportOrder: 'spans',
  DuplicateBearingLineStation: 'spans',
  SpanTooShort: 'spans',
  SpanAboveEconomic: 'spans',
  MissingBearingLines: 'spans',
  AmbiguousStation: 'geometry',
  InvalidJson: 'other',
  NotAProfileLibrary: 'other',
  NotASupportLibrary: 'other',
  UnsupportedSchemaVersion: 'other',
  SchemaViolation: 'other',
} as const satisfies Record<ModelIssueCode, CheckGroup>;

/** Skupina každého kódu problému osi z LandXML. */
const ALIGNMENT_GROUPS = {
  InvalidXml: 'other',
  NoAlignments: 'other',
  MissingUnits: 'other',
  UnsupportedUnit: 'other',
  UnsupportedElement: 'geometry',
  UnsupportedSpiralType: 'geometry',
  UnsupportedVerticalCurve: 'geometry',
  InvalidValue: 'geometry',
  CoordinateSystemMismatch: 'geometry',
  GeometryMismatch: 'geometry',
  DirectionMismatch: 'geometry',
  LengthMismatch: 'geometry',
  VerticalCurvesOverlap: 'geometry',
  InvalidProfile: 'geometry',
} as const satisfies Record<AlignmentIssueCode, CheckGroup>;

export const modelIssueGroup = (code: ModelIssueCode): CheckGroup => MODEL_GROUPS[code];
export const alignmentIssueGroup = (code: AlignmentIssueCode): CheckGroup => ALIGNMENT_GROUPS[code];

/** Prvok s problémami: popis (stĺpec Prvok), cieľ prekliku a problémy modelu alebo osi. */
export interface CheckSource {
  owner: string;
  target?: BrowserTarget | undefined;
  model?: readonly ModelIssue[];
  alignment?: readonly AlignmentIssue[];
}

export interface CheckItem {
  key: string;
  group: CheckGroup;
  severity: 'error' | 'warning';
  owner: string;
  text: string;
  target: BrowserTarget | undefined;
}

/** Problém bez vlastníka — prvok je v stĺpci Prvok, nie v predpone hlášky. */
function withoutOwner(issue: ModelIssue): ModelIssue {
  const { owner: _owner, ...rest } = issue;
  return rest as ModelIssue;
}

/**
 * Kontroly na jednom mieste (ADR 0022): problémy prvkov zoskupené, v skupine chyby pred upozorneniami, potom podľa
 * prvku a textu; rovnaký text pri tom istom prvku raz. Hláška je bez predpony prvku (ten je v stĺpci Prvok).
 */
export function collectChecks(sources: readonly CheckSource[]): CheckItem[] {
  const items: CheckItem[] = [];
  const seen = new Set<string>();
  const push = (
    source: CheckSource,
    group: CheckGroup,
    severity: CheckItem['severity'],
    text: string,
  ) => {
    const key = `${group}|${source.owner}|${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ key, group, severity, owner: source.owner, text, target: source.target });
  };
  for (const source of sources) {
    for (const issue of source.model ?? [])
      push(
        source,
        modelIssueGroup(issue.code),
        issue.severity === 'warning' ? 'warning' : 'error',
        formatModelIssue(withoutOwner(issue)),
      );
    for (const issue of source.alignment ?? [])
      push(source, alignmentIssueGroup(issue.code), issue.severity, formatIssue(issue));
  }
  const order = (g: CheckGroup) => CHECK_GROUPS.indexOf(g);
  return items.sort(
    (a, b) =>
      order(a.group) - order(b.group) ||
      (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1) ||
      a.owner.localeCompare(b.owner, 'sk') ||
      a.text.localeCompare(b.text, 'sk'),
  );
}

/** Počty chýb a upozornení (stavový riadok, súhrn skupín). */
export function checkCounts(items: readonly CheckItem[]): { errors: number; warnings: number } {
  const errors = items.filter((i) => i.severity === 'error').length;
  return { errors, warnings: items.length - errors };
}
