import type { Parameter, ParameterSet } from '@bridge/model';
import { toDisplayUnits } from '../format/displayValue.ts';

export interface ChartSample {
  sta: number;
  /** hodnota v zobrazovaných jednotkách; undefined = funkcia tu nie je definovaná (prerušenie čiary) */
  value: number | undefined;
}

/** Rozsah grafu: úseková funkcia podľa úsekov, inak rozsah osi, inak okolie referenčného staničenia. */
export function chartRange(
  parameter: Parameter,
  alignmentRange: { from: number; to: number } | undefined,
  reference: number,
): { from: number; to: number } {
  const law = parameter.law;
  if (law.kind === 'piecewise' && law.segments.length > 0) {
    const from = Math.min(...law.segments.map((s) => s.from));
    const to = Math.max(...law.segments.map((s) => s.to));
    if (to > from) return { from, to };
  }
  return alignmentRange ?? { from: reference - 50, to: reference + 50 };
}

/** Vzorky priebehu parametra: rovnomerne + presne na hraniciach úsekov (aj tesne pred nimi kvôli skokom). */
export function sampleParameter(
  set: ParameterSet,
  parameter: Parameter,
  range: { from: number; to: number },
  count = 300,
): ChartSample[] {
  const stations = new Set<number>();
  for (let i = 0; i <= count; i++) stations.add(range.from + ((range.to - range.from) * i) / count);
  if (parameter.law.kind === 'piecewise') {
    for (const s of parameter.law.segments) {
      stations.add(s.from);
      stations.add(s.to);
      stations.add(s.to - 1e-6);
    }
  }
  return [...stations]
    .filter((sta) => sta >= range.from && sta <= range.to)
    .sort((a, b) => a - b)
    .map((sta) => {
      const v = set.evaluateAt(sta).values.get(parameter.name);
      return { sta, value: v === undefined ? undefined : toDisplayUnits(parameter.unit, v) };
    });
}
