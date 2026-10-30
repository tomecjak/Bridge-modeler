import { describe, expect, it } from 'vitest';
import { evaluate, evaluateText, references } from './evaluate.ts';
import { parse } from './parser.ts';

const scope = { h: 1.2, b: 14.35, alfa: 30, flag: true } as Record<string, number | boolean>;
const lookup = (name: string) => scope[name];

function value(text: string) {
  const r = evaluateText(text, lookup);
  if (!r.ok) throw new Error(`evaluation failed: ${JSON.stringify(r.error)}`);
  return r.value;
}

function error(text: string) {
  const r = evaluateText(text, lookup);
  if (r.ok) throw new Error(`expected error for ${text}`);
  return r.error;
}

describe('evaluate — arithmetic', () => {
  it('computes with parameters in SI units', () => {
    expect(value('h + 0.35')).toBeCloseTo(1.55, 15);
    expect(value('b / 2 - 0.2')).toBeCloseTo(6.975, 15);
    expect(value('-2 ^ 2')).toBe(-4);
    expect(value('2 ^ 3 ^ 2')).toBe(512);
  });

  it('reports division by zero and non-finite results', () => {
    expect(error('h / (b - b)')).toMatchObject({
      code: 'DivisionByZero',
      span: { start: 0, end: 11 },
    });
    expect(error('10 ^ 400')).toMatchObject({ code: 'NotFinite' });
  });
});

describe('evaluate — functions', () => {
  it('uses degrees in trigonometric functions', () => {
    expect(value('sin(alfa)')).toBeCloseTo(0.5, 15);
    expect(value('cos(60)')).toBeCloseTo(0.5, 15);
    expect(value('tan(45)')).toBeCloseTo(1, 15);
    expect(value('asin(0.5)')).toBeCloseTo(30, 12);
    expect(value('atan(1)')).toBeCloseTo(45, 12);
  });

  it('provides math helpers', () => {
    expect(value('sqrt(16) + abs(-2)')).toBe(6);
    expect(value('min(3, h, 2)')).toBe(1.2);
    expect(value('max(3, h, 2)')).toBe(3);
    expect(value('pi()')).toBe(Math.PI);
    expect(value('exp(0) + ln(1) + log(1000)')).toBeCloseTo(4, 15);
  });

  it('rounds like Revit', () => {
    expect(value('round(2.5)')).toBe(3);
    expect(value('round(-2.5)')).toBe(-3);
    expect(value('roundup(2.1)')).toBe(3);
    expect(value('rounddown(2.9)')).toBe(2);
  });

  it('reports domain errors', () => {
    expect(error('sqrt(-1)')).toMatchObject({ code: 'DomainError', name: 'sqrt' });
    expect(error('asin(2)')).toMatchObject({ code: 'DomainError', name: 'asin' });
    expect(error('ln(0)')).toMatchObject({ code: 'DomainError', name: 'ln' });
  });
});

describe('evaluate — logic', () => {
  it('evaluates comparisons and if() lazily', () => {
    expect(value('if(h > 1, h, 1)')).toBe(1.2);
    expect(value('if(h < 1, 1 / 0, 2)')).toBe(2);
    expect(value('0.1 + 0.2 = 0.3')).toBe(true);
    expect(value('h <> 1.2')).toBe(false);
    expect(value('and(h > 1, b > 10, flag)')).toBe(true);
    expect(value('or(h > 2, not(flag))')).toBe(false);
  });

  it('checks value types', () => {
    expect(error('if(h, 1, 2)')).toMatchObject({
      code: 'TypeMismatch',
      expected: 'boolean',
      actual: 'number',
    });
    expect(error('flag + 1')).toMatchObject({
      code: 'TypeMismatch',
      expected: 'number',
      actual: 'boolean',
    });
    expect(error('flag > 1')).toMatchObject({ code: 'TypeMismatch' });
  });

  it('reports unknown identifiers with position', () => {
    expect(error('h + hrubka')).toMatchObject({
      code: 'UnknownIdentifier',
      name: 'hrubka',
      span: { start: 4, end: 10 },
    });
  });
});

describe('references', () => {
  it('lists identifiers but not function names', () => {
    const r = parse('if(h > hmin, max(h, b), sin(alfa) * h)');
    if (!r.ok) throw new Error('parse failed');
    expect([...references(r.ast)].sort()).toEqual(['alfa', 'b', 'h', 'hmin']);
  });

  it('evaluates an already parsed AST repeatedly', () => {
    const r = parse('sta * 2');
    if (!r.ok) throw new Error('parse failed');
    expect(evaluate(r.ast, (n) => (n === 'sta' ? 10 : undefined))).toEqual({ ok: true, value: 20 });
    expect(evaluate(r.ast, (n) => (n === 'sta' ? 11 : undefined))).toEqual({ ok: true, value: 22 });
  });
});
