import { describe, expect, it } from 'vitest';
import { placementTab } from './appRibbon.tsx';

describe('placementTab', () => {
  it('offers the pier and abutment types of the support tool and the library', () => {
    const changes: [string, string][] = [];
    let opened = false;
    const tab = placementTab({
      pier: { value: '', options: [{ value: '', label: 'predvolený' }] },
      abutment: {
        value: 'builtin:x',
        options: [
          { value: '', label: 'predvolená' },
          { value: 'builtin:x', label: 'X' },
        ],
      },
      onChange: (kind, value) => changes.push([kind, value]),
      onOpenLibrary: () => {
        opened = true;
      },
    });
    expect(tab).toMatchObject({ id: 'contextual', label: 'Umiestniť | Podpera', contextual: true });
    const [types, library] = tab.groups;
    expect(types?.items.map((i) => (i.kind === 'select' ? [i.label, i.value] : i.kind))).toEqual([
      ['Pilier', ''],
      ['Opora', 'builtin:x'],
    ]);
    const abutment = types?.items[1];
    if (abutment?.kind === 'select') abutment.onChange('');
    expect(changes).toEqual([['abutment', '']]);
    const button = library?.items[0];
    if (button?.kind === 'button') button.onClick();
    expect(opened).toBe(true);
  });
});
