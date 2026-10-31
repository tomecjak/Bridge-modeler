import { createEmptyProject, type Support } from '@bridge/model';
import { deckFromProfile, profileTemplate } from '@bridge/sections';
import { describe, expect, it } from 'vitest';
import { copyName, duplicateElement } from './duplicate.ts';

function project() {
  const p = createEmptyProject('Most');
  const profile = profileTemplate('slab', 'pr');
  if (!profile) throw new Error('chýba šablóna');
  p.profiles.push(profile);
  const { bridgeAxis, superstructure } = deckFromProfile('Trasa', 1100, 1150, 'pr', {
    deck: 'nk',
    axis: 'ax',
  });
  p.bridgeAxes.push(bridgeAxis);
  p.superstructures.push(superstructure);
  const pier: Support = {
    id: 'p1',
    name: 'P1',
    kind: 'pier',
    superstructure: 'nk',
    station: 1120,
    crossingAngle: '90',
    offset: '0',
    geometry: { type: 'wall', thickness: '1.2', length: '4' },
    footing: { length: '8', width: '4', thickness: '1.2' },
    connection: 'bearing',
    bearingHeight: '0.35',
    bearings: ['-1.8', '1.8'],
    foundationTop: '240',
  };
  p.supports.push(pier, { ...pier, id: 'p2', name: 'P2', station: 1148 });
  p.planLines.push({
    id: 'l1',
    name: 'Okraj',
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 2 },
    ],
  });
  return p;
}

let counter = 0;
const newId = (prefix: string) => `${prefix}-${++counter}`;

describe('duplicateElement', () => {
  it('numbers a copied support and shifts it along the deck', () => {
    const r = duplicateElement(project(), 'supports', 'p1', newId);
    expect(r?.command).toMatchObject({
      type: 'addElements',
      supports: [{ name: 'P3', station: 1125, geometry: { type: 'wall' } }],
    });
    // pri konci NK sa kópia posunie späť, aby ostala v rozsahu NK
    const end = duplicateElement(project(), 'supports', 'p2', newId);
    expect(end?.command).toMatchObject({ supports: [{ station: 1143 }] });
  });

  it('copies a deck with its own bridge axis so it can be offset', () => {
    const r = duplicateElement(project(), 'superstructures', 'nk', newId);
    if (r?.command.type !== 'addElements') throw new Error('očakáva sa addElements');
    const axis = r.command.bridgeAxes?.[0];
    const deck = r.command.superstructures?.[0];
    expect(axis?.name).toBe('Os mosta (kópia)');
    expect(deck).toMatchObject({ name: 'NK (kópia)', bridgeAxis: axis?.id, profile: 'pr' });
    expect(r.selected).toEqual({ collection: 'superstructures', id: deck?.id });
  });

  it('shifts a copied plan line east and does not copy terrain', () => {
    const r = duplicateElement(project(), 'planLines', 'l1', newId);
    expect(r?.command).toMatchObject({
      planLines: [
        {
          name: 'Okraj (kópia)',
          points: [
            { x: 5, y: 0 },
            { x: 15, y: 2 },
          ],
        },
      ],
    });
    expect(duplicateElement(project(), 'terrains', 'x', newId)).toBeUndefined();
  });

  it('finds a free copy name', () => {
    expect(copyName('NK', ['NK', 'NK (kópia)'])).toBe('NK (kópia 2)');
  });
});
