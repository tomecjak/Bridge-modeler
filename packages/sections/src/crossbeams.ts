import type { Alignment } from '@bridge/alignment';
import type {
  BearingLine,
  IssueOwner,
  ModelIssue,
  ParameterSet,
  ProfileDefinition,
  Superstructure,
} from '@bridge/model';
import { type AxisLength, bridgeAxisLength } from './axisLength.ts';
import { evaluateNumber } from './expressions.ts';
import { globalScope } from './superstructure.ts';
import type { BearingLineResult, SupportContext } from './supports.ts';

/** Pás priečnika na osi uloženia (ADR 0018): v ňom má NK prierez priečnika. */
export interface CrossbeamBand {
  line: BearingLine;
  profile: ProfileDefinition;
  /** spojité staničenie osi cesty začiatku a konca pásu v osi mosta */
  sFrom: number;
  sTo: number;
  /** uhol kríženia osi uloženia [rad]; hranice pásu sú s ňou rovnobežné */
  angle: number;
  /** koncový priečnik (od čela NK) */
  end?: 'start' | 'end';
}

/**
 * Pásy priečnikov NK (ADR 0018): šírka v osi mosta, vnútorný priečnik symetricky okolo osi uloženia, koncový
 * (na prvej a poslednej z aspoň dvoch osí) od čela NK. Kontroly: neznámy prierez, neplatná šírka, pás mimo NK,
 * prekryv pásov (neskorší sa vynechá). Pásy sú zoradené podľa staničenia.
 */
export function crossbeamBands(input: {
  deck: Superstructure;
  lines: readonly BearingLineResult[];
  profiles: readonly ProfileDefinition[];
  parameters: ParameterSet;
  alignment: Alignment;
  measure: AxisLength;
}): { bands: CrossbeamBand[]; issues: ModelIssue[] } {
  const { deck, measure } = input;
  const owner: IssueOwner = { kind: 'superstructure', name: deck.name };
  const issues: ModelIssue[] = [];
  const sFrom = input.alignment.stationing.fromDisplay(deck.from);
  const sTo = input.alignment.stationing.fromDisplay(deck.to);
  if (sFrom === undefined || sTo === undefined) return { bands: [], issues };
  const own = input.lines
    .filter((l) => l.line.superstructure === deck.id && Number.isFinite(l.s))
    .sort((a, b) => a.s - b.s);
  const lFrom = measure.lengthAt(sFrom);
  const lTo = measure.lengthAt(sTo);
  const candidates: CrossbeamBand[] = [];
  own.forEach((l, i) => {
    const cb = l.line.crossbeam;
    if (!cb) return;
    const name = l.line.name;
    const profile = input.profiles.find((p) => p.id === cb.profile);
    if (!profile) {
      issues.push({ code: 'UnknownCrossbeamProfile', line: name, id: cb.profile });
      return;
    }
    const width = evaluateNumber(cb.width, globalScope(input.parameters, l.station), 'dimension');
    if (!width.ok) {
      issues.push(width.issue);
      return;
    }
    if (!(width.value > 0)) {
      issues.push({ code: 'InvalidDimension', name: 'crossbeam.width', value: width.value });
      return;
    }
    const end =
      own.length >= 2 ? (i === 0 ? 'start' : i === own.length - 1 ? 'end' : undefined) : undefined;
    const l0 = measure.lengthAt(l.s);
    const [a, b] =
      end === 'start'
        ? [lFrom, lFrom + width.value]
        : end === 'end'
          ? [lTo - width.value, lTo]
          : [l0 - width.value / 2, l0 + width.value / 2];
    if (a < lFrom - 1e-9 || b > lTo + 1e-9) {
      issues.push({ code: 'CrossbeamOutsideDeck', line: name });
      return;
    }
    candidates.push({
      line: l.line,
      profile,
      sFrom: end === 'start' ? sFrom : measure.stationAt(a),
      sTo: end === 'end' ? sTo : measure.stationAt(b),
      angle: l.crossingAngle,
      ...(end ? { end } : {}),
    });
  });
  const bands: CrossbeamBand[] = [];
  for (const band of candidates) {
    const previous = bands.at(-1);
    if (previous && band.sFrom < previous.sTo - 1e-9) {
      issues.push({ code: 'CrossbeamOverlap', lines: [previous.line.name, band.line.name] });
      continue;
    }
    bands.push(band);
  }
  return { bands, issues: issues.map((i) => ({ owner, ...i })) };
}

/**
 * Pásy priečnikov všetkých NK projektu (pre `SectionContext.crossbeams`); NK bez priečnikov chýba. `measureOf`
 * môže dĺžku po osi mosta brať z cache.
 */
export function deckCrossbeams(
  ctx: SupportContext,
  lines: readonly BearingLineResult[],
  measureOf: (axis: SupportContext['bridgeAxes'][number], alignment: Alignment) => AxisLength = (
    axis,
    alignment,
  ) => bridgeAxisLength(axis, alignment, ctx.parameters),
): Map<string, CrossbeamBand[]> {
  const map = new Map<string, CrossbeamBand[]>();
  for (const deck of ctx.superstructures) {
    if (!lines.some((l) => l.line.superstructure === deck.id && l.line.crossbeam)) continue;
    const axis = ctx.bridgeAxes.find((a) => a.id === deck.bridgeAxis);
    const alignment = axis && ctx.alignments.get(axis.alignment);
    if (!axis || !alignment) continue;
    const { bands } = crossbeamBands({
      deck,
      lines,
      profiles: ctx.profiles,
      parameters: ctx.parameters,
      alignment,
      measure: measureOf(axis, alignment),
    });
    if (bands.length > 0) map.set(deck.id, bands);
  }
  return map;
}
