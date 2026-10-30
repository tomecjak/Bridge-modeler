import { describe, expect, it } from 'vitest';
import { evaluateSpans, type SpanSupport } from './spans.ts';

const at = (name: string, kind: 'abutment' | 'pier', s: number): SpanSupport => ({
  support: { id: name, name, kind },
  s,
  station: 1000 + s,
});

describe('evaluateSpans', () => {
  it('derives spans from support order regardless of input order', () => {
    const r = evaluateSpans({ name: 'NK' }, [
      at('P1', 'pier', 32),
      at('O2', 'abutment', 100),
      at('O1', 'abutment', 0),
    ]);
    expect(r.issues).toEqual([]);
    expect(r.spans.map((s) => [s.from.support.name, s.to.support.name, s.length])).toEqual([
      ['O1', 'P1', 32],
      ['P1', 'O2', 68],
    ]);
  });

  it('checks abutments at the ends and piers in between', () => {
    const r = evaluateSpans({ name: 'NK' }, [
      at('A', 'pier', 0),
      at('B', 'abutment', 30),
      at('C', 'abutment', 60),
    ]);
    expect(r.issues).toMatchObject([
      { code: 'SupportOrder', support: 'A', expected: 'abutment' },
      { code: 'SupportOrder', support: 'B', expected: 'pier' },
    ]);
  });

  it('reports short spans, duplicate stations and missing supports', () => {
    const r = evaluateSpans(
      { name: 'NK' },
      [at('O1', 'abutment', 0), at('P1', 'pier', 3), at('P2', 'pier', 3), at('O2', 'abutment', 40)],
      { minSpan: 5 },
    );
    expect(r.issues.map((i) => i.code)).toEqual(['SpanTooShort', 'DuplicateSupportStation']);
    expect(evaluateSpans({ name: 'NK' }, [at('O1', 'abutment', 0)]).issues).toMatchObject([
      { code: 'MissingSupports', owner: { kind: 'superstructure', name: 'NK' } },
    ]);
  });

  it('warns (informatively) about spans above the economic range of the deck type', () => {
    const r = evaluateSpans({ name: 'NK' }, [at('O1', 'abutment', 0), at('O2', 'abutment', 52)], {
      typology: 'singleBeamHaunched',
    });
    expect(r.issues).toMatchObject([
      { code: 'SpanAboveEconomic', economic: 45, severity: 'warning' },
    ]);
  });
});
