import { describe, expect, it } from 'vitest';
import { formatIssue } from './issues.ts';

describe('formatIssue', () => {
  it('formats direction kinks in arc seconds', () => {
    const text = formatIssue({
      code: 'DirectionMismatch',
      severity: 'warning',
      index: 4,
      deviation: 3.382558447251327e-5,
    });
    expect(text).toBe(
      'Na začiatku prvku č. 5 je zlom smeru 7,0″ (prvky na seba dotyčnicovo nenadväzujú).',
    );
  });

  it('formats geometry mismatches in millimeters', () => {
    expect(
      formatIssue({ code: 'GeometryMismatch', severity: 'warning', index: 0, deviation: 0.0123 }),
    ).toBe('Koniec prvku č. 1 sa od LandXML líši o 12,3 mm.');
  });
});
