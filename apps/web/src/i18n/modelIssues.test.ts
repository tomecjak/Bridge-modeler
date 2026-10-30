import { describe, expect, it } from 'vitest';
import { formatExprError, formatModelIssue } from './modelIssues.ts';

describe('model issue messages', () => {
  it('describes cycles with the dependency path', () => {
    expect(formatModelIssue({ code: 'Cycle', path: ['h', 'b', 'h'] })).toBe(
      'Kruhová závislosť parametrov: h → b → h.',
    );
  });

  it('describes expression errors in a segment', () => {
    expect(
      formatModelIssue({
        code: 'ExpressionError',
        parameter: 'h',
        field: 'v0',
        segment: 0,
        expression: '1 +',
        error: { code: 'UnexpectedEnd', span: { start: 3, end: 3 } },
      }),
    ).toBe(
      'h: úsek 1, hodnota na začiatku úseku — Výraz je neúplný (chýba operand alebo zátvorka).',
    );
  });

  it('hints at decimal commas', () => {
    expect(
      formatExprError({ code: 'UnexpectedToken', token: ',', span: { start: 1, end: 2 } }),
    ).toContain('bodkou');
  });
});
