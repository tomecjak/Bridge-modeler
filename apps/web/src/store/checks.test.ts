import { describe, expect, it } from 'vitest';
import { alignmentIssueGroup, checkCounts, collectChecks, modelIssueGroup } from './checks.ts';

describe('checks panel', () => {
  it('assigns issue codes to groups', () => {
    expect(modelIssueGroup('SpanTooShort')).toBe('spans');
    expect(modelIssueGroup('ClearanceViolated')).toBe('clearance');
    expect(modelIssueGroup('FoundationAboveTerrain')).toBe('foundation');
    expect(modelIssueGroup('SelfIntersection')).toBe('geometry');
    expect(modelIssueGroup('Cycle')).toBe('other');
    expect(modelIssueGroup('FreeWidthBelowRequired')).toBe('freeWidth');
    expect(alignmentIssueGroup('GeometryMismatch')).toBe('geometry');
    expect(alignmentIssueGroup('MissingUnits')).toBe('other');
  });

  it('groups, orders errors first, drops duplicates and keeps the element as owner', () => {
    const deck = { type: 'element', collection: 'superstructures', id: 'nk' } as const;
    const items = collectChecks([
      {
        owner: 'Nosná konštrukcia NK',
        target: deck,
        model: [
          {
            code: 'SpanAboveEconomic',
            length: 40,
            economic: 35,
            typology: 'singleBeam',
            severity: 'warning',
            owner: { kind: 'superstructure', name: 'NK' },
          },
          { code: 'SpanTooShort', length: 3, minimum: 5 },
          { code: 'SpanTooShort', length: 3, minimum: 5 },
          { code: 'EdgeCurveNotFound', curve: 'okraj' },
        ],
      },
      {
        owner: 'Os cesty 125-00',
        target: { type: 'alignment', index: 0 },
        alignment: [{ code: 'LengthMismatch', declared: 10, computed: 10.2, severity: 'warning' }],
      },
    ]);
    expect(items.map((i) => [i.group, i.severity, i.owner])).toEqual([
      ['geometry', 'error', 'Nosná konštrukcia NK'],
      ['geometry', 'warning', 'Os cesty 125-00'],
      ['spans', 'error', 'Nosná konštrukcia NK'],
      ['spans', 'warning', 'Nosná konštrukcia NK'],
    ]);
    // hláška bez predpony prvku (ten je v stĺpci Prvok)
    expect(items[3]?.text.startsWith('NK')).toBe(false);
    expect(items[0]?.target).toEqual(deck);
    expect(checkCounts(items)).toEqual({ errors: 2, warnings: 2 });
  });
});
