import { describe, expect, it } from 'vitest';
import type { Command } from '../../store/commands.ts';
import type { PropertyRow } from './PropertyGrid.tsx';
import { bridgeAxisSheet, lawSummary, studyAreaSheet } from './simpleSheets.tsx';

const rows = (groups: readonly { rows?: readonly PropertyRow[] }[]) =>
  groups.flatMap((g) => g.rows ?? []);
const label = (r: PropertyRow) => (r.kind === 'note' ? `note:${r.text}` : r.label);

describe('property sheets', () => {
  it('summarises station functions for the edit rows', () => {
    expect(lawSummary({ kind: 'constant', value: '-0.09' })).toBe('-0.09 m');
    expect(
      lawSummary({
        kind: 'piecewise',
        segments: [
          { from: 0, to: 10, v0: '0', v1: '1', shape: 'linear' },
          { from: 10, to: 20, v0: '1', v1: '1', shape: 'linear' },
        ],
      }),
    ).toBe('po častiach (2 úseky)');
    expect(lawSummary({ kind: 'expression', expr: '0.5 * sta' })).toBe('výraz: 0.5 * sta');
  });

  it('edits the bridge axis name and road and opens the offsets in dialogs', () => {
    const commands: Command[] = [];
    const edits: string[] = [];
    const sheet = bridgeAxisSheet({
      axis: {
        id: 'ax',
        name: 'Os mosta',
        alignment: 'Trasa',
        horizontalOffset: { kind: 'constant', value: '0' },
        verticalOffset: { kind: 'constant', value: '-0.09' },
      },
      alignments: [{ name: 'Trasa' }, { name: 'Vetva' }],
      onEditOffset: (which) => edits.push(which),
      dispatch: (c) => commands.push(c),
    });
    const all = rows(sheet.groups);
    const road = all.find((r) => r.kind === 'select');
    expect(road?.kind === 'select' && road.options.map((o) => o.value)).toEqual(['Trasa', 'Vetva']);
    if (road?.kind === 'select') road.onChange('Vetva');
    expect(commands).toEqual([
      {
        type: 'updateElement',
        collection: 'bridgeAxes',
        id: 'ax',
        changes: { alignment: 'Vetva' },
      },
    ]);
    const offsets = all.filter((r) => r.kind === 'edit');
    expect(offsets.map((r) => (r.kind === 'edit' ? r.value : ''))).toEqual(['0 m', '-0.09 m']);
    for (const r of offsets) if (r.kind === 'edit') r.onEdit();
    expect(edits).toEqual(['horizontalOffset', 'verticalOffset']);
  });

  it('offers marking or entering a study area when there is none', () => {
    const sheet = studyAreaSheet({
      road: undefined,
      area: null,
      suggestion: undefined,
      onMark: () => {},
      dispatch: () => {},
    });
    expect(rows(sheet.groups).map(label)).toContain('note:Oblasť zatiaľ nie je vyznačená.');
    expect(sheet.actions?.map((a) => [a.label, a.disabled])).toEqual([
      ['Vyznačiť v profile', true],
    ]);
  });
});
