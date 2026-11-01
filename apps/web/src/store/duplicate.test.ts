import { createEmptyProject, levelFoundation, type Support } from '@bridge/model';
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
  p.bearingLines.push(
    { id: 'b1', name: '1', superstructure: 'nk', station: 1120, crossingAngle: '80' },
    { id: 'b2', name: '2', superstructure: 'nk', station: 1148, crossingAngle: '80' },
  );
  const pier: Support = {
    id: 'p1',
    name: 'P1',
    kind: 'pier',
    bearingLine: 'b1',
    offset: '0',
    geometry: { type: 'wall', thickness: '1.2', length: '4' },
    footing: { length: '8', width: '4', thickness: '1.2' },
    connection: 'bearing',
    bearingHeight: '0.35',
    bearings: ['-1.8', '1.8'],
    foundation: levelFoundation('240 - 1.2'),
  };
  p.supports.push(pier, { ...pier, id: 'p2', name: 'P2', bearingLine: 'b2' });
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
  it('numbers a copied support and puts it on a new bearing line shifted along the deck', () => {
    const r = duplicateElement(project(), 'supports', 'p1', newId);
    if (r?.command.type !== 'addElements') throw new Error('očakáva sa addElements');
    const line = r.command.bearingLines?.[0];
    expect(line).toMatchObject({
      name: '3',
      station: 1125,
      crossingAngle: '80',
      superstructure: 'nk',
    });
    expect(r.command.supports).toMatchObject([
      { name: 'P3', bearingLine: line?.id, geometry: { type: 'wall' } },
    ]);
    // pri konci NK sa kópia posunie späť, aby ostala v rozsahu NK
    const end = duplicateElement(project(), 'supports', 'p2', newId);
    expect(end?.command).toMatchObject({ bearingLines: [{ station: 1143 }] });
  });

  it('copies a bearing line with the support standing on it', () => {
    const r = duplicateElement(project(), 'bearingLines', 'b1', newId);
    if (r?.command.type !== 'addElements') throw new Error('očakáva sa addElements');
    expect(r.command.bearingLines).toMatchObject([{ name: '3', station: 1125 }]);
    expect(r.command.supports).toMatchObject([{ name: 'P3' }]);
    expect(r.selected).toEqual({ collection: 'bearingLines', id: r.command.bearingLines?.[0]?.id });
  });

  it('copies a deck with its own bridge axis so it can be offset', () => {
    const r = duplicateElement(project(), 'superstructures', 'nk', newId);
    if (r?.command.type !== 'addElements') throw new Error('očakáva sa addElements');
    const axis = r.command.bridgeAxes?.[0];
    const deck = r.command.superstructures?.[0];
    expect(axis?.name).toBe('Os mosta (kópia)');
    expect(deck).toMatchObject({ name: 'NK (kópia)', bridgeAxis: axis?.id, profile: 'pr' });
    // osi uloženia a podpery idú s NK
    expect(r.command.bearingLines?.map((l) => [l.name, l.superstructure])).toEqual([
      ['1', deck?.id],
      ['2', deck?.id],
    ]);
    expect(r.command.supports?.map((s) => s.bearingLine)).toEqual(
      r.command.bearingLines?.map((l) => l.id),
    );
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
