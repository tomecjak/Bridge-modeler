import type { IssueOwner, ModelIssue, Superstructure, Support } from '@bridge/model';

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

/** Predvolená minimálna dĺžka poľa [m], ak projekt nemá globálny parameter `minSpan` (ADR 0008). */
export const DEFAULT_MIN_SPAN = 5;

export interface SpanSupport {
  support: Pick<Support, 'id' | 'name' | 'kind'>;
  /** spojité staničenie podpery na osi mosta */
  s: number;
  station: number;
}

export interface Span {
  index: number;
  from: SpanSupport;
  to: SpanSupport;
  /** dĺžka poľa = rozdiel spojitého staničenia [m] */
  length: number;
}

export interface SpanResult {
  supports: SpanSupport[];
  spans: Span[];
  issues: ModelIssue[];
}

/** Polia NK z jej podpier zoradených podľa staničenia s kontrolou poradia a dĺžok (ADR 0008). */
export function evaluateSpans(
  sup: Pick<Superstructure, 'name'>,
  supports: readonly SpanSupport[],
  options: { minSpan?: number; typology?: string | undefined } = {},
): SpanResult {
  const owner: IssueOwner = { kind: 'superstructure', name: sup.name };
  const issues: ModelIssue[] = [];
  const sorted = supports.filter((x) => Number.isFinite(x.s)).sort((a, b) => a.s - b.s);
  if (sorted.length < 2) {
    issues.push({ code: 'MissingSupports' });
    return { supports: sorted, spans: [], issues: issues.map((i) => ({ owner, ...i })) };
  }
  sorted.forEach((x, i) => {
    const expected = i === 0 || i === sorted.length - 1 ? 'abutment' : 'pier';
    if (x.support.kind !== expected)
      issues.push({ code: 'SupportOrder', support: x.support.name, expected });
  });
  const minSpan = options.minSpan ?? DEFAULT_MIN_SPAN;
  const economic = options.typology ? ECONOMIC_SPANS[options.typology] : undefined;
  const spans: Span[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const from = sorted[i - 1] as SpanSupport;
    const to = sorted[i] as SpanSupport;
    const length = to.s - from.s;
    if (length < 1e-6) {
      issues.push({ code: 'DuplicateSupportStation', station: to.station });
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
  return { supports: sorted, spans, issues: issues.map((i) => ({ owner, ...i })) };
}
