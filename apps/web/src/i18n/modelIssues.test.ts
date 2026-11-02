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

  it('describes a free width below the required one with its source', () => {
    expect(
      formatModelIssue({
        code: 'FreeWidthBelowRequired',
        station: 1250,
        width: 12.5,
        required: 12.75,
        source: 'brief',
        owner: { kind: 'superstructure', name: 'NK' },
      }),
    ).toBe(
      'NK „NK“ › voľná šírka medzi rímsami 12 500 mm na km 1,250 000 je menšia ako požadovaná 12 750 mm (zo zadania).',
    );
  });

  it('hints at decimal commas', () => {
    expect(
      formatExprError({ code: 'UnexpectedToken', token: ',', span: { start: 1, end: 2 } }),
    ).toContain('bodkou');
  });
});
