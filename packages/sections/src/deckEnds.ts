import type { Alignment } from '@bridge/alignment';
import type { BearingLine, BridgeAxis, ParameterSet, Superstructure, Support } from '@bridge/model';
import { type AxisLength, bridgeAxisLength } from './axisLength.ts';
import { evaluateNumber } from './expressions.ts';
import { globalScope } from './superstructure.ts';

/** Opora na krajnej osi uloženia NK, z ktorej sa odvodí koniec NK (ADR 0018). */
export interface DeckEndSource {
  line: BearingLine;
  support: Support;
}

/**
 * Opory na krajných osiach uloženia NK (aspoň dve osi): začiatok z prvej, koniec z poslednej osi podľa staničenia.
 * Koniec bez opory alebo v režime `manual` nemá zdroj.
 */
export function deckEndSources(
  sup: Superstructure,
  lines: readonly BearingLine[],
  supports: readonly Support[],
): { start?: DeckEndSource; end?: DeckEndSource } {
  const own = lines
    .filter((l) => l.superstructure === sup.id)
    .sort((a, b) => a.station - b.station);
  if (own.length < 2) return {};
  const source = (line: BearingLine | undefined, mode: 'abutment' | 'manual' | undefined) => {
    if (!line || mode === 'manual') return undefined;
    const support = supports.find(
      (s) => s.bearingLine === line.id && s.geometry.type === 'abutment',
    );
    return support ? { line, support } : undefined;
  };
  const start = source(own[0], sup.ends?.start);
  const end = source(own.at(-1), sup.ends?.end);
  return { ...(start ? { start } : {}), ...(end ? { end } : {}) };
}

export interface DeckEndsInput {
  superstructures: readonly Superstructure[];
  bearingLines: readonly BearingLine[];
  supports: readonly Support[];
  bridgeAxes: readonly BridgeAxis[];
  alignments: ReadonlyMap<string, Alignment>;
  parameters: ParameterSet;
  /** dĺžka po osi mosta (napr. z cache); predvolene `bridgeAxisLength` */
  measure?: (axis: BridgeAxis, alignment: Alignment) => AxisLength;
}

/** Odvodený rozsah NK (zobrazované staničenie), ktorý sa líši od uloženého. */
export interface DeckRangeChange {
  id: string;
  from: number;
  to: number;
}

/** Rozdiel staničení, pod ktorým sa uložená hodnota ponechá (šum z prevodu dĺžky po osi mosta) [m]. */
const SAME = 1e-7;

/**
 * Konce NK odvodené z opôr (ADR 0018): opora s prahom → os uloženia ∓ e, monolitická → os uloženia ∓ t_s/2, merané
 * vodorovne po osi mosta. Koniec v režime `manual`, bez opory na krajnej osi alebo s neplatným výrazom ostane podľa
 * uloženého od / do. Vráti len NK, ktorých odvodený rozsah sa líši od uloženého.
 */
export function resolveDeckEnds(input: DeckEndsInput): DeckRangeChange[] {
  const measureOf = input.measure ?? ((axis, a) => bridgeAxisLength(axis, a, input.parameters));
  const changes: DeckRangeChange[] = [];
  for (const sup of input.superstructures) {
    const sources = deckEndSources(sup, input.bearingLines, input.supports);
    if (!sources.start && !sources.end) continue;
    const axis = input.bridgeAxes.find((a) => a.id === sup.bridgeAxis);
    const alignment = axis && input.alignments.get(axis.alignment);
    if (!axis || !alignment) continue;
    const measure = measureOf(axis, alignment);
    const derive = (source: DeckEndSource | undefined, sign: -1 | 1, stored: number) => {
      const g = source?.support.geometry;
      if (!source || g?.type !== 'abutment') return stored;
      const scope = globalScope(input.parameters, source.line.station);
      const value = evaluateNumber(
        g.construction === 'monolithic' ? g.wallThickness : g.endOffset,
        scope,
        'dimension',
      );
      const s = alignment.stationing.fromDisplay(source.line.station);
      if (!value.ok || !(value.value >= 0) || s === undefined) return stored;
      const offset = g.construction === 'monolithic' ? value.value / 2 : value.value;
      const end = measure.stationAt(measure.lengthAt(s) + sign * offset);
      const station = alignment.stationing.toDisplay(end).station;
      return Math.abs(station - stored) <= SAME ? stored : station;
    };
    const from = derive(sources.start, -1, sup.from);
    const to = derive(sources.end, 1, sup.to);
    if (from !== sup.from || to !== sup.to) changes.push({ id: sup.id, from, to });
  }
  return changes;
}
