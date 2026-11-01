import type { AxisLength } from './axisLength.ts';

/** Chyba zápisu rozloženia polí (napr. „16 + 23 + 16“, „3×20“). */
export type SpanLayoutError =
  | { code: 'Empty' }
  | { code: 'InvalidTerm'; term: string }
  | { code: 'NonPositiveSpan'; value: number };

/** Rozsah NK v spojitom staničení osi cesty. */
export interface DeckRange {
  sFrom: number;
  sTo: number;
}

/** Krok prichytávania dĺžky poľa po osi mosta [m] (rozhodnutie 2026-10-31). */
export const SPAN_SNAP = 0.5;

const NUMBER = String.raw`\d+(?:[.,]\d+)?`;
const TERM = new RegExp(String.raw`^(?:(\d+)\s*[×xX*]\s*)?(${NUMBER})$`);

/**
 * Rozloženie polí zo zápisu projektanta (ADR 0017): členy oddelené „+“, člen = dĺžka alebo počet × dĺžka
 * (×, x, *), desatinná čiarka aj bodka. Napr. „16 + 23 + 16“ → [16, 23, 16], „20 + 2×25 + 20“.
 */
export function parseSpanLayout(
  text: string,
): { ok: true; spans: number[] } | { ok: false; error: SpanLayoutError } {
  if (text.trim() === '') return { ok: false, error: { code: 'Empty' } };
  const spans: number[] = [];
  for (const raw of text.split('+')) {
    const term = raw.trim();
    const m = TERM.exec(term);
    if (!m) return { ok: false, error: { code: 'InvalidTerm', term } };
    const count = m[1] === undefined ? 1 : Number(m[1]);
    const value = Number((m[2] as string).replace(',', '.'));
    if (!(value > 0)) return { ok: false, error: { code: 'NonPositiveSpan', value } };
    if (!(count > 0)) return { ok: false, error: { code: 'InvalidTerm', term } };
    for (let i = 0; i < count; i++) spans.push(value);
  }
  return { ok: true, spans };
}

/**
 * Polohy osí uloženia pre dĺžky polí po osi mosta (ADR 0017) a rozsah NK s presahmi za krajné osi. Ukotvenie:
 * prvá os (`start`), posledná os (`end`) alebo stred súčtu polí (`center`) na spojitom staničení `s`.
 * Výsledok je v spojitom staničení osi cesty.
 */
export function layoutStations(input: {
  spans: readonly number[];
  anchor: { kind: 'start' | 'end' | 'center'; s: number };
  measure: AxisLength;
  /** presah konca NK za krajnú os po osi mosta [m] */
  overhang: { start: number; end: number };
}): { stations: number[]; deck: DeckRange } {
  const { spans, anchor, measure, overhang } = input;
  const total = spans.reduce((a, b) => a + b, 0);
  const l0 = measure.lengthAt(anchor.s);
  const first = anchor.kind === 'start' ? l0 : anchor.kind === 'end' ? l0 - total : l0 - total / 2;
  const lengths = [first];
  for (const span of spans) lengths.push((lengths.at(-1) as number) + span);
  const last = lengths.at(-1) as number;
  return {
    stations: lengths.map((l) => measure.stationAt(l)),
    deck: {
      sFrom: measure.stationAt(first - overhang.start),
      sTo: measure.stationAt(last + overhang.end),
    },
  };
}

/**
 * Posunie osi uloženia (zoradené podľa staničenia) o `shift(i)` po osi mosta [m]; nezmenené osi ostanú presne.
 * Koniec NK sa posunie s krajnou osou so zachovaným presahom (ADR 0017).
 */
function shiftLines(
  stations: readonly number[],
  deck: DeckRange,
  measure: AxisLength,
  shift: (index: number) => number,
): { stations: number[]; deck: DeckRange } {
  const move = (s: number, d: number) => (d === 0 ? s : measure.stationAt(measure.lengthAt(s) + d));
  const n = stations.length;
  return {
    stations: stations.map((s, i) => move(s, shift(i))),
    deck: n === 0 ? deck : { sFrom: move(deck.sFrom, shift(0)), sTo: move(deck.sTo, shift(n - 1)) },
  };
}

/**
 * Posun osi uloženia `index` na dĺžku po osi mosta `l` (ťahanie, ADR 0017): bez `following` sa posunie len táto os
 * (zmenia sa obe susedné polia), s `following` aj všetky nasledujúce (zmení sa jedno pole a celková dĺžka).
 */
export function moveLine(input: {
  stations: readonly number[];
  deck: DeckRange;
  measure: AxisLength;
  index: number;
  l: number;
  following: boolean;
}): { stations: number[]; deck: DeckRange } {
  const { stations, deck, measure, index, l, following } = input;
  const s = stations[index];
  if (s === undefined) return { stations: [...stations], deck };
  const delta = l - measure.lengthAt(s);
  return shiftLines(stations, deck, measure, (i) =>
    i === index || (following && i > index) ? delta : 0,
  );
}

/**
 * Nová dĺžka poľa `span` (medzi osami `span` a `span + 1`) po osi mosta (rozhodnutie 2026-10-31): zmení sa len toto
 * pole, osi za ním (`after`) alebo pred ním (`before`) sa posunú, celková dĺžka sa zmení.
 */
export function setSpanLength(input: {
  stations: readonly number[];
  deck: DeckRange;
  measure: AxisLength;
  span: number;
  length: number;
  side: 'after' | 'before';
}): { stations: number[]; deck: DeckRange } {
  const { stations, deck, measure, span, length, side } = input;
  const a = stations[span];
  const b = stations[span + 1];
  if (a === undefined || b === undefined) return { stations: [...stations], deck };
  const delta = length - (measure.lengthAt(b) - measure.lengthAt(a));
  return shiftLines(stations, deck, measure, (i) =>
    side === 'after' ? (i > span ? delta : 0) : i <= span ? -delta : 0,
  );
}

/** Dĺžka poľa zaokrúhlená na krok, najmenej jeden krok. */
export function snapSpan(length: number, step = SPAN_SNAP): number {
  return Math.max(step, Math.round(length / step) * step);
}

/**
 * Prichytenie polohy osi `l` (dĺžka po osi mosta) k ostatným osiam `others`: pole od predchádzajúcej osi sa zaokrúhli
 * na krok; prvá os sa prichytí k nasledujúcej. Bez ostatných osí bez zmeny.
 */
export function snapToPrevious(others: readonly number[], l: number, step = SPAN_SNAP): number {
  const before = others.filter((x) => x < l);
  if (before.length > 0) {
    const prev = Math.max(...before);
    return prev + snapSpan(l - prev, step);
  }
  const after = others.filter((x) => x > l);
  if (after.length > 0) {
    const next = Math.min(...after);
    return next - snapSpan(next - l, step);
  }
  return l;
}
