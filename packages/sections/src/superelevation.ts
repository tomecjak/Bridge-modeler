import type { SuperelevationSegment } from '@bridge/alignment';
import type { ModelIssue, Superstructure } from '@bridge/model';
import { evaluateSuperstructure, type SectionContext } from './superstructure.ts';

/** Tolerancia zhody priečneho sklonu NK s plným klopením [m/m] (0,1 %, ADR 0022). */
export const CROSS_SLOPE_TOLERANCE = 0.001;

/** Najkratší prekryv NK s úsekom klopenia, ktorý sa ešte hlási [m]. */
const MIN_OVERLAP = 1e-6;

/**
 * Priečny sklon NK voči klopeniu osi cesty z LandXML (ADR 0022): NK v nábehu → upozornenie
 * `DeckInSuperelevationTransition`; v úseku plného klopenia sa parameter `q` hlavného prierezu porovná na začiatku,
 * v strede a na konci prekryvu a pri |q − e| > `tolerance` → `CrossSlopeMismatch` (raz za úsek). Bez klopenia
 * (os ho nemá alebo je nekonzistentné) alebo bez parametra `q` sa nič nehlási.
 */
export function crossSlopeIssues(
  ctx: SectionContext,
  sup: Superstructure,
  tolerance: number,
): ModelIssue[] {
  const axis = ctx.bridgeAxes.find((a) => a.id === sup.bridgeAxis);
  const road = axis && ctx.alignments.get(axis.alignment);
  const segments: readonly SuperelevationSegment[] | undefined = road?.superelevation;
  const profile = ctx.profiles.find((p) => p.id === sup.profile);
  const sFrom = road?.stationing.fromDisplay(sup.from);
  const sTo = road?.stationing.fromDisplay(sup.to);
  if (!road || !segments || !profile || sFrom === undefined || sTo === undefined) return [];
  const [a, b] = sFrom <= sTo ? [sFrom, sTo] : [sTo, sFrom];
  const station = (s: number) => road.stationing.toDisplay(s).station;
  const issues: ModelIssue[] = [];
  for (const seg of segments) {
    const from = Math.max(a, seg.from);
    const to = Math.min(b, seg.to);
    if (to - from < MIN_OVERLAP) continue;
    if (seg.kind === 'transition') {
      issues.push({
        code: 'DeckInSuperelevationTransition',
        from: station(from),
        to: station(to),
        severity: 'warning',
      });
      continue;
    }
    for (const s of [from, (from + to) / 2, to]) {
      const q = evaluateSuperstructure(ctx, sup, s, profile).parameters.get('q');
      if (q === undefined || Math.abs(q - seg.q) <= tolerance) continue;
      issues.push({
        code: 'CrossSlopeMismatch',
        station: station(s),
        q,
        superelevation: seg.q,
        severity: 'warning',
      });
      break;
    }
  }
  return issues;
}
