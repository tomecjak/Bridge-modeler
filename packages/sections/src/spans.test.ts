import { describe, expect, it } from 'vitest';
import { evaluateSpans, type SpanLine } from './spans.ts';

const at = (name: string, kind: 'abutment' | 'pier' | undefined, s: number): SpanLine => ({
  line: { id: `l-${name}`, name },
  supports: kind ? [{ id: name, name, kind }] : [],
  s,
  station: 1000 + s,
});

describe('evaluateSpans', () => {
  it('derives spans from bearing line order regardless of input order', () => {
    const r = evaluateSpans({ name: 'NK' }, [
      at('P1', 'pier', 32),
      at('O2', 'abutment', 100),
      at('O1', 'abutment', 0),
    ]);
    expect(r.issues).toEqual([]);
    expect(r.spans.map((s) => [s.from.line.name, s.to.line.name, s.length])).toEqual([
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

  it('reports short spans, duplicate stations and missing bearing lines', () => {
    const r = evaluateSpans(
      { name: 'NK' },
      [at('O1', 'abutment', 0), at('P1', 'pier', 3), at('P2', 'pier', 3), at('O2', 'abutment', 40)],
      { minSpan: 5 },
    );
    expect(r.issues.map((i) => i.code)).toEqual(['SpanTooShort', 'DuplicateBearingLineStation']);
    expect(evaluateSpans({ name: 'NK' }, [at('O1', 'abutment', 0)]).issues).toMatchObject([
      { code: 'MissingBearingLines', owner: { kind: 'superstructure', name: 'NK' } },
    ]);
  });

  it('computes spans from bearing lines without supports and only warns about them', () => {
    const r = evaluateSpans({ name: 'NK' }, [at('1', undefined, 0), at('2', undefined, 16)]);
    expect(r.spans.map((s) => s.length)).toEqual([16]);
    expect(r.issues).toMatchObject([
      { code: 'BearingLineWithoutSupport', line: '1', severity: 'warning' },
      { code: 'BearingLineWithoutSupport', line: '2', severity: 'warning' },
    ]);
  });

  it('rejects two supports on one bearing line', () => {
    const line = at('1', 'abutment', 0);
    const r = evaluateSpans({ name: 'NK' }, [
      { ...line, supports: [...line.supports, { id: 'x', name: 'X', kind: 'abutment' }] },
      at('2', 'abutment', 20),
    ]);
    expect(r.issues).toMatchObject([
      { code: 'BearingLineOccupied', line: '1', supports: ['1', 'X'] },
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
