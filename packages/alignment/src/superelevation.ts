import type { SuperelevationData } from './data.ts';
import type { AlignmentIssue } from './issues.ts';

/** Úsek klopenia v spojitom staničení s [m] od začiatku osi (ADR 0022). */
export type SuperelevationSegment =
  /** plné klopenie: priečny sklon q [m/m], kladný = klesá doprava (ako parameter `q` prierezu) */
  | { kind: 'full'; from: number; to: number; q: number }
  /** nábeh klopenia (vzostupnica / zostupnica s vyrovnaním) */
  | { kind: 'transition'; from: number; to: number };

/** Tolerancia polohy plného klopenia voči rozsahu prvku `Superelevation` [m] (ADR 0022). */
export const SUPERELEVATION_TOLERANCE = 1;

/**
 * Diagram klopenia osi z LandXML (ADR 0022): plné klopenie od `FullSuperSta` po `RunoffSta` (inak rozsah prvku)
 * s q = e / 100, nábehy od `BeginRunoutSta` / `BeginRunoffSta` po začiatok plného klopenia a od jeho konca po
 * `StartofRunoutSta` / `EndofRunoutSta`. Prvok bez hodnôt sa vynechá. Nekonzistentný prvok (údaje bez plného
 * klopenia, zlé poradie staničení, plné klopenie mimo rozsahu prvku o viac ako `tolerance`) dá upozornenie
 * `SuperelevationInconsistent` a diagram sa nepoužije (undefined). Staničenia LandXML sú staStart + s.
 */
export function superelevationDiagram(
  data: readonly SuperelevationData[],
  staStart: number,
  tolerance: number,
): { segments: SuperelevationSegment[] | undefined; issues: AlignmentIssue[] } {
  const segments: SuperelevationSegment[] = [];
  const issues: AlignmentIssue[] = [];
  const s = (sta: number) => sta - staStart;
  data.forEach((e, i) => {
    const inconsistent = () =>
      issues.push({
        code: 'SuperelevationInconsistent',
        index: i + 1,
        staStart: e.staStart,
        staEnd: e.staEnd,
        severity: 'warning',
      });
    const stations = [
      e.beginRunout,
      e.beginRunoff,
      e.fullSuper,
      e.runoff,
      e.startOfRunout,
      e.endOfRunout,
    ];
    if (e.fullSuperelev === undefined) {
      if (stations.some((x) => x !== undefined)) inconsistent();
      return;
    }
    const from = e.fullSuper ?? e.staStart;
    const to = e.runoff ?? e.staEnd;
    const within = (x: number) => x >= e.staStart - tolerance && x <= e.staEnd + tolerance;
    const ordered = [e.beginRunout, e.beginRunoff, from, to, e.startOfRunout, e.endOfRunout]
      .filter((x): x is number => x !== undefined)
      .every((x, k, all) => k === 0 || x >= (all[k - 1] as number));
    if (!(to > from) || !within(from) || !within(to) || !ordered) {
      inconsistent();
      return;
    }
    const before = e.beginRunout ?? e.beginRunoff;
    const after = e.endOfRunout ?? e.startOfRunout;
    if (before !== undefined && before < from)
      segments.push({ kind: 'transition', from: s(before), to: s(from) });
    segments.push({ kind: 'full', from: s(from), to: s(to), q: e.fullSuperelev / 100 });
    if (after !== undefined && after > to)
      segments.push({ kind: 'transition', from: s(to), to: s(after) });
  });
  if (issues.length > 0) return { segments: undefined, issues };
  return { segments: segments.sort((a, b) => a.from - b.from), issues };
}
