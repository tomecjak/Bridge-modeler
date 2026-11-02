import type { ModelIssue, Superstructure } from '@bridge/model';
import type { SpanResult } from './spans.ts';
import { evaluateSuperstructure, type SectionContext } from './superstructure.ts';

/**
 * Spojité staničenia osi cesty, na ktorých sa prierez NK vyhodnotí pre kontroly (ADR 0022): konce NK, osi uloženia
 * a stredy polí; zoradené, bez duplicít. Bez osi cesty prázdne.
 */
export function deckSampleStations(
  ctx: SectionContext,
  sup: Superstructure,
  spans: Pick<SpanResult, 'lines'> | undefined,
): number[] {
  const axis = ctx.bridgeAxes.find((a) => a.id === sup.bridgeAxis);
  const road = axis && ctx.alignments.get(axis.alignment);
  const sFrom = road?.stationing.fromDisplay(sup.from);
  const sTo = road?.stationing.fromDisplay(sup.to);
  if (sFrom === undefined || sTo === undefined) return [];
  const [a, b] = sFrom <= sTo ? [sFrom, sTo] : [sTo, sFrom];
  const lines = (spans?.lines ?? []).map((l) => l.s).filter((s) => s >= a && s <= b);
  const mids = lines.slice(1).map((s, i) => (s + (lines[i] as number)) / 2);
  const out: number[] = [];
  for (const s of [a, b, ...lines, ...mids].sort((p, q) => p - q))
    if (!out.some((x) => Math.abs(x - s) < 1e-6)) out.push(s);
  return out;
}

/** Kľúč problému bez staničenia (rovnaký problém na viacerých staničeniach sa hlási raz). */
function issueKey(issue: ModelIssue): string {
  const {
    station: _station,
    sta: _sta,
    ...rest
  } = issue as ModelIssue & {
    station?: unknown;
    sta?: unknown;
  };
  return JSON.stringify(rest);
}

/**
 * Kontroly NK nad celou jej dĺžkou (ADR 0022): problémy prierezu na vzorkách `deckSampleStations` (bez duplicít,
 * prvý výskyt so staničením). Problémy polí sú v `SpanResult`, tu sa neopakujú.
 */
export function deckChecks(
  ctx: SectionContext,
  sup: Superstructure,
  spans: Pick<SpanResult, 'lines'> | undefined,
): ModelIssue[] {
  const stations = deckSampleStations(ctx, sup, spans);
  if (stations.length === 0) {
    const axis = ctx.bridgeAxes.find((a) => a.id === sup.bridgeAxis);
    // bez osi mosta alebo osi cesty skončí výpočet prierezu skôr, než použije staničenie
    if (!axis || !ctx.alignments.has(axis.alignment))
      return evaluateSuperstructure(ctx, sup, 0).issues;
    return [
      {
        code: 'StationNotOnAlignment',
        station: sup.from,
        owner: { kind: 'superstructure', name: sup.name },
      },
    ];
  }
  const seen = new Set<string>();
  const issues: ModelIssue[] = [];
  for (const s of stations) {
    for (const issue of evaluateSuperstructure(ctx, sup, s).issues) {
      const key = issueKey(issue);
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push(issue);
    }
  }
  return issues;
}
