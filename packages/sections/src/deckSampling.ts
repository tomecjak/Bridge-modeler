import type { Alignment } from '@bridge/alignment';
import type {
  BridgeAxis,
  IssueOwner,
  ModelIssue,
  ProfileDefinition,
  Superstructure,
} from '@bridge/model';
import type { CrossbeamBand } from './crossbeams.ts';
import { edgeBreaks } from './edge.ts';
import { edgeBeamLaws } from './edgeBeam.ts';
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
  /**
   * úseky NK (ADR 0018): NK a priečniky so šikmými hranicami rovnobežnými s osou uloženia; bez priečnikov jeden úsek
   * = celá NK
   */
  segments: DeckSegment[];
  issues: ModelIssue[];
}

/** Úsek NK s jedným prierezom medzi hranicami pod uhlom kríženia (koniec NK, hranica pásu priečnika). */
export interface DeckSegment {
  /** priečnik úseku; bez neho prierez NK */
  crossbeam?: CrossbeamBand;
  /** spojité staničenie hraníc v osi mosta */
  sFrom: number;
  sTo: number;
  /** uhly kríženia hraníc [rad] */
  startAngle: number;
  endAngle: number;
  stations: number[];
  sections: SuperstructureSection[];
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
    ...Object.entries(sup.parameterLaws).map(([name, law]) =>
      law.kind === 'edge'
        ? { law: { kind: 'constant' as const, value: law.add }, unit: 'length' as const }
        : { law, unit: units.get(name) ?? 'none' },
    ),
    { law: axis.horizontalOffset, unit: 'length' },
    { law: axis.verticalOffset, unit: 'length' },
    // zlomy priebehov ríms (ADR 0023) — rímsy sa vyhodnocujú v hlavných vzorkách NK
    ...edgeBeamLaws(ctx, sup),
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
  const bands = ctx.crossbeams?.get(sup.id) ?? [];
  const breaks = [
    ...supports.flatMap((r) => [r.s, ...r.bearings.map((b) => b.s)]),
    ...bands.flatMap((b) => [b.sFrom, b.sTo]),
    ...Object.values(sup.parameterLaws).flatMap((law) =>
      law.kind === 'edge' ? edgeBreaks(ctx, law.curve, alignment) : [],
    ),
  ];
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
  // hlavné vzorky majú vždy prierez NK (obrys, okraje, rezy čiarami); priečniky sú v úsekoch
  const sections = stations.map((s) => evaluateSuperstructure(ctx, sup, s, profile));
  const endAngles = endCrossingAngles(supports, sFrom, sTo);
  const segments = deckSegments(
    ctx,
    sup,
    profile,
    { sFrom, sTo, endAngles, stations, sections },
    bands,
  );
  return {
    alignment,
    axis,
    sFrom,
    sTo,
    stations,
    sections,
    endAngles,
    segments,
    issues: unique(segments.flatMap((g) => g.sections.flatMap((s) => s.issues))),
  };
}

/**
 * Úseky NK medzi koncami NK a hranicami pásov priečnikov (ADR 0018). Úsek NK použije hlavné vzorky vnútri úseku
 * a doplní hranice; úsek priečnika vyhodnotí prierez priečnika vo vzorkách vnútri pásu (aspoň v strede).
 */
function deckSegments(
  ctx: SectionContext,
  sup: Superstructure,
  profile: ProfileDefinition,
  main: {
    sFrom: number;
    sTo: number;
    endAngles: { start: number; end: number };
    stations: readonly number[];
    sections: readonly SuperstructureSection[];
  },
  bands: readonly CrossbeamBand[],
): DeckSegment[] {
  const { sFrom, sTo, endAngles } = main;
  if (bands.length === 0)
    return [
      {
        sFrom,
        sTo,
        startAngle: endAngles.start,
        endAngle: endAngles.end,
        stations: [...main.stations],
        sections: [...main.sections],
      },
    ];
  const segment = (
    a: number,
    b: number,
    startAngle: number,
    endAngle: number,
    crossbeam?: CrossbeamBand,
  ): DeckSegment => {
    const inside = main.stations
      .map((s, k) => ({ s, k }))
      .filter((x) => x.s > a + 1e-6 && x.s < b - 1e-6);
    const stations = [a, ...inside.map((x) => x.s), b];
    if (crossbeam && inside.length === 0) stations.splice(1, 0, (a + b) / 2);
    const sections = stations.map((s, i) => {
      const k = inside[i - 1]?.k;
      return !crossbeam && k !== undefined && i > 0 && i <= inside.length
        ? (main.sections[k] as SuperstructureSection)
        : evaluateSuperstructure(ctx, sup, s, crossbeam?.profile ?? profile);
    });
    return {
      ...(crossbeam ? { crossbeam } : {}),
      sFrom: a,
      sTo: b,
      startAngle,
      endAngle,
      stations,
      sections,
    };
  };
  const out: DeckSegment[] = [];
  let cursor = sFrom;
  let angle = endAngles.start;
  for (const band of bands) {
    const a = Math.max(band.sFrom, cursor);
    if (a > cursor + 1e-6) out.push(segment(cursor, a, angle, band.angle));
    const startAngle = band.end === 'start' ? endAngles.start : band.angle;
    const endAngle = band.end === 'end' ? endAngles.end : band.angle;
    const b = Math.min(band.sTo, sTo);
    if (b > a + 1e-6) out.push(segment(a, b, startAngle, endAngle, band));
    cursor = b;
    angle = endAngle;
  }
  if (sTo > cursor + 1e-6) out.push(segment(cursor, sTo, angle, endAngles.end));
  return out;
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
