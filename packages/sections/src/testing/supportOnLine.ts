import type { BearingLine, Support } from '@bridge/model';
import { evaluateSupport, type SupportContext, type SupportResult } from '../supports.ts';

/** Podpera so staničením, uhlom kríženia a NK pri sebe (tvar pred ADR 0017) — skratka pre testy. */
export type SupportOnLine = Omit<Support, 'bearingLine'> &
  Pick<BearingLine, 'superstructure' | 'station' | 'crossingAngle'>;

/** Rozdelí podperu na os uloženia `bl-<id>` (s menom podpery) a podperu na nej. */
export function splitSupport(s: SupportOnLine): { line: BearingLine; support: Support } {
  const { superstructure, station, crossingAngle, ...rest } = s;
  const id = `bl-${s.id}`;
  return {
    line: { id, name: s.name, superstructure, station, crossingAngle },
    support: { ...rest, bearingLine: id },
  };
}

/** Osi uloženia a podpery projektu z podpier v starom tvare. */
export function supportsOnLines(list: readonly SupportOnLine[]): {
  bearingLines: BearingLine[];
  supports: Support[];
} {
  const parts = list.map(splitSupport);
  return { bearingLines: parts.map((p) => p.line), supports: parts.map((p) => p.support) };
}

/** Vyhodnotí podperu v starom tvare na vlastnej osi uloženia. */
export function evaluateSupportOnLine(
  ctx: Omit<SupportContext, 'bearingLines'>,
  s: SupportOnLine,
): SupportResult {
  const { line, support } = splitSupport(s);
  return evaluateSupport({ ...ctx, bearingLines: [line] }, support);
}
