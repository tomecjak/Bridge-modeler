import type { BearingLine, IssueOwner, ModelIssue, Superstructure, Support } from '@bridge/model';
import type { BearingLineResult, SupportResult } from './supports.ts';

/**
 * Ekonomické rozpätie medziľahlých polí spojitých betónových mostov v ČR [m] (VŠB-TU Ostrava, PLAN.md §7).
 * Kľúč = štítok `typology` profilu. Slúži len na informatívne upozornenie.
 */
export const ECONOMIC_SPANS: Readonly<Record<string, number>> = {
  slab: 21,
  voidedSlab: 30,
  slabBeam: 30,
  singleBeam: 35,
  singleBeamHaunched: 45,
  twinBeam: 45,
  urbanViaduct: 45,
  precast: 40,
  box: 70,
  boxHaunched: 150,
};

/** Osi uloženia NK pre `evaluateSpans` z vyhodnotených osí a podpier (podpera patrí osi podľa `bearingLine`). */
export function spanLines(
  lines: readonly BearingLineResult[],
  supports: readonly SupportResult[],
): SpanLine[] {
  return lines.map((l) => ({
    line: l.line,
    supports: supports.filter((r) => r.support.bearingLine === l.line.id).map((r) => r.support),
    s: l.s,
    station: l.station,
  }));
}

/** Predvolená minimálna dĺžka poľa [m], ak projekt nemá globálny parameter `minSpan` (ADR 0008). */
export const DEFAULT_MIN_SPAN = 5;

/** Os uloženia NK pre polia (ADR 0017) s podperami, ktoré na nej stoja (správne najviac jedna). */
export interface SpanLine {
  line: Pick<BearingLine, 'id' | 'name'>;
  supports: readonly Pick<Support, 'id' | 'name' | 'kind'>[];
  /** spojité staničenie osi uloženia na osi mosta */
  s: number;
  station: number;
}

export interface Span {
  index: number;
  from: SpanLine;
  to: SpanLine;
  /** dĺžka poľa vodorovne po osi mosta [m] (bez prevodu rozdiel spojitého staničenia) */
  length: number;
}

export interface SpanResult {
  lines: SpanLine[];
  spans: Span[];
  issues: ModelIssue[];
}

/**
 * Polia NK z jej osí uloženia zoradených podľa staničenia s kontrolou poradia podpier a dĺžok (ADR 0008, 0017).
 * Os bez podpery je upozornenie, viac podpier na osi chyba. `measure` prevedie spojité staničenie na dĺžku po osi
 * mosta (Fáza 10b); bez neho sa dĺžka poľa berie ako rozdiel staničení.
 */
export function evaluateSpans(
  sup: Pick<Superstructure, 'name'>,
  lines: readonly SpanLine[],
  options: {
    minSpan?: number;
    typology?: string | undefined;
    measure?: ((s: number) => number) | undefined;
  } = {},
): SpanResult {
  const owner: IssueOwner = { kind: 'superstructure', name: sup.name };
  const issues: ModelIssue[] = [];
  const sorted = lines.filter((x) => Number.isFinite(x.s)).sort((a, b) => a.s - b.s);
  sorted.forEach((x, i) => {
    const expected = i === 0 || i === sorted.length - 1 ? 'abutment' : 'pier';
    if (x.supports.length === 0)
      issues.push({ code: 'BearingLineWithoutSupport', line: x.line.name, severity: 'warning' });
    if (x.supports.length > 1)
      issues.push({
        code: 'BearingLineOccupied',
        line: x.line.name,
        supports: x.supports.map((s) => s.name),
      });
    if (sorted.length < 2) return;
    for (const support of x.supports)
      if (support.kind !== expected)
        issues.push({ code: 'SupportOrder', support: support.name, expected });
  });
  if (sorted.length < 2) {
    issues.push({ code: 'MissingBearingLines' });
    return { lines: sorted, spans: [], issues: issues.map((i) => ({ owner, ...i })) };
  }
  const minSpan = options.minSpan ?? DEFAULT_MIN_SPAN;
  const measure = options.measure ?? ((s: number) => s);
  const economic = options.typology ? ECONOMIC_SPANS[options.typology] : undefined;
  const spans: Span[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const from = sorted[i - 1] as SpanLine;
    const to = sorted[i] as SpanLine;
    const length = measure(to.s) - measure(from.s);
    if (to.s - from.s < 1e-6) {
      issues.push({ code: 'DuplicateBearingLineStation', station: to.station });
      continue;
    }
    spans.push({ index: spans.length, from, to, length });
    if (length < minSpan) issues.push({ code: 'SpanTooShort', length, minimum: minSpan });
    if (economic !== undefined && options.typology && length > economic) {
      issues.push({
        code: 'SpanAboveEconomic',
        length,
        economic,
        typology: options.typology,
        severity: 'warning',
      });
    }
  }
  return { lines: sorted, spans, issues: issues.map((i) => ({ owner, ...i })) };
}
