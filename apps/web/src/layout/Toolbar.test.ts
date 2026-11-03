import { describe, expect, it } from 'vitest';
import type { RibbonGroup } from './ribbon/Ribbon.tsx';
import { visibleItems } from './Toolbar.tsx';

const button = (id: string) =>
  ({ kind: 'button', id, label: id, icon: 'fit', onClick: () => {} }) as const;

describe('visibleItems', () => {
  const group: RibbonGroup = {
    label: 'Pohľad',
    items: [
      button('fit'),
      button('goto'),
      button('dimensions'),
      button('cut'),
      button('window-2d'),
      button('window-parameters'),
    ],
  };

  it('shows plan and profile settings only in 2D', () => {
    expect(visibleItems(group, '2d').map((i) => i.id)).toEqual([
      'fit',
      'dimensions',
      'window-parameters',
    ]);
  });

  it('shows 3D scene switches only in 3D and never the moved items', () => {
    expect(visibleItems(group, '3d').map((i) => i.id)).toEqual(['fit', 'cut', 'window-parameters']);
  });
});
