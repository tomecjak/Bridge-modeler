import type { Alignment } from '@bridge/alignment';
import type { BridgeAxis, IssueOwner, ModelIssue, Superstructure } from '@bridge/model';
import { DEFAULT_SAMPLING, type LawRef, type SamplingOptions, sampleStations } from './sampling.ts';
import {
  evaluateSuperstructure,
  type SectionContext,
  type SuperstructureSection,
} from './superstructure.ts';
import type { SupportResult } from './supports.ts';

export interface DeckSamplingOptions {
  /** priebehy globálnych parametrov (ich zlomy sa vzorkujú presne) */
  globalLaws?: readonly LawRef[];
  sampling?: SamplingOptions;
}

export interface DeckSamples {
  alignment: Alignment;
  axis: BridgeAxis;
  /** rozsah NK v spojitom staničení osi cesty */
  sFrom: number;
  sTo: number;
  /** spojité staničenia vzoriek a prierezy v nich */
  stations: number[];
  sections: SuperstructureSection[];
  /** uhly kríženia koncov [rad] (π/2 = kolmý koniec) */
  endAngles: { start: number; end: number };
  issues: ModelIssue[];
}

/**
 * Prierezy NK vo vzorkách pozdĺž osi (spoločné pre 3D, pôdorys a pozdĺžny rez): staničenia podľa `sampleStations`
 * so zlomami pri podperách a ložiskách, uhly koncov podľa krajných opôr. Pri chybe vstupov len `issues`.
 */
export function sampleSuperstructure(
  ctx: SectionContext,
  sup: Superstructure,
  supports: readonly SupportResult[],
  options: DeckSamplingOptions = {},
): DeckSamples | { issues: ModelIssue[] } {
  const owner: IssueOwner = { kind: 'superstructure', name: sup.name };
  const fail = (issues: ModelIssue[]) => ({ issues: issues.map((i) => ({ owner, ...i })) });
  const axis = ctx.bridgeAxes.find((a) => a.id === sup.bridgeAxis);
  const alignment = axis ? ctx.alignments.get(axis.alignment) : undefined;
  const profile = ctx.profiles.find((p) => p.id === sup.profile);
  if (!axis || !alignment || !profile) return fail(evaluateSuperstructure(ctx, sup, 0).issues);
  const sFrom = alignment.stationing.fromDisplay(sup.from);
  const sTo = alignment.stationing.fromDisplay(sup.to);
  if (sFrom === undefined || sTo === undefined || !(sTo > sFrom)) {
    return fail([
      { code: 'StationNotOnAlignment', station: sFrom === undefined ? sup.from : sup.to },
    ]);
  }

  const units = new Map(profile.parameters.map((p) => [p.name, p.unit]));
  const laws: LawRef[] = [
    ...Object.entries(sup.parameterLaws).map(([name, law]) => ({
      law,
      unit: units.get(name) ?? 'none',
    })),
    { law: axis.horizontalOffset, unit: 'length' },
    { law: axis.verticalOffset, unit: 'length' },
    ...(options.globalLaws ?? []),
  ];
  const probes = [sFrom, (sFrom + sTo) / 2, sTo].map((s) => evaluateSuperstructure(ctx, sup, s));
  const reach = Math.max(
    0,
    ...probes.flatMap((p) =>
      [...p.loops.flatMap((l) => l.polygon.map((q) => Math.abs(q.x)))].map(
        (x) => x + Math.abs(p.axis?.horizontalOffset ?? 0),
      ),
    ),
  );
  const breaks = supports.flatMap((r) => [r.s, ...r.bearings.map((b) => b.s)]);
  const stations = sampleStations(
    {
      alignment,
      sFrom,
      sTo,
      laws,
      scope: (station) => {
        const values = ctx.parameters.evaluateAt(station).values;
        return (n) => values.get(n);
      },
      breaks: breaks.filter((s) => Number.isFinite(s)),
      reach,
    },
    options.sampling ?? DEFAULT_SAMPLING,
  );
  const sections = stations.map((s) => evaluateSuperstructure(ctx, sup, s));
  return {
    alignment,
    axis,
    sFrom,
    sTo,
    stations,
    sections,
    endAngles: endCrossingAngles(supports, sFrom, sTo),
    issues: unique(sections.flatMap((s) => s.issues)),
  };
}

/** Uhly kríženia koncov NK: krajná podpera, ak je to opora bližšie k danému koncu; inak kolmý koniec. */
export function endCrossingAngles(
  supports: readonly SupportResult[],
  sFrom: number,
  sTo: number,
): { start: number; end: number } {
  const sorted = supports.filter((r) => Number.isFinite(r.s)).sort((a, b) => a.s - b.s);
  const angle = (r: SupportResult | undefined, nearStart: boolean) =>
    r &&
    r.support.kind === 'abutment' &&
    r.s - sFrom < sTo - r.s === nearStart &&
    Math.sin(r.crossingAngle) > 1e-3
      ? r.crossingAngle
      : Math.PI / 2;
  return { start: angle(sorted[0], true), end: angle(sorted[sorted.length - 1], false) };
}

function unique(issues: readonly ModelIssue[]): ModelIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const k = JSON.stringify(i);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
