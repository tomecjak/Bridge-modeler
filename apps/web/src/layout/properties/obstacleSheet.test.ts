import { defaultClearance, type Obstacle } from '@bridge/model';
import type { ObstacleResult } from '@bridge/sections';
import { describe, expect, it } from 'vitest';
import type { Command } from '../../store/commands.ts';
import { obstacleSheet, presetOf, referenceKey } from './obstacleSheet.ts';

const obstacle: Obstacle = {
  id: 'o',
  name: 'Cesta 1',
  kind: 'road',
  reference: { type: 'curve', curve: { type: 'alignment', name: 'vetva' } },
  level: { kind: 'grade' },
  clearance: defaultClearance('road'),
};

const result = {
  obstacle,
  points: [],
  crossings: [
    { bridgeAxis: 'ax', s: 150, station: 1150, angle: 60, point: { x: 0, y: 150 }, t: 100 },
  ],
  clearance: undefined,
  levelAt: () => undefined,
  issues: [],
} as ObstacleResult;

function sheet(o: Obstacle, commands: Command[] = []) {
  return obstacleSheet({
    obstacle: o,
    result,
    alignments: [{ name: 'cesta' }, { name: 'vetva' }],
    planLines: [{ id: 'pl', name: 'Potok' }],
    bridgeAxes: [{ id: 'ax', name: 'Os mosta NK' }],
    onDelete: () => {},
    dispatch: (c) => commands.push(c),
  });
}

describe('obstacleSheet', () => {
  it('shows the reference, level, clearance with its preset and the crossing', () => {
    const s = sheet(obstacle);
    expect(s.type?.value).toBe('road');
    expect(s.groups.map((g) => g.id)).toEqual([
      'obstacle-identity',
      'obstacle-reference',
      'obstacle-level',
      'obstacle-clearance',
      'obstacle-crossings',
    ]);
    const clearance = s.groups.find((g) => g.id === 'obstacle-clearance')?.rows ?? [];
    expect(clearance[0]).toMatchObject({ kind: 'select', value: 'road' });
    expect(clearance.some((r) => r.kind === 'note' && r.tone === 'warning')).toBe(true);
    const crossing = s.groups.find((g) => g.id === 'obstacle-crossings')?.rows?.[0];
    expect(crossing).toMatchObject({ label: 'Os mosta NK', value: 'km 1,150 000 · 60,00°' });
  });

  it('switches to a manual crossing at the computed station and applies the preset of a new kind', () => {
    const commands: Command[] = [];
    const s = sheet(obstacle, commands);
    const axis = s.groups.find((g) => g.id === 'obstacle-reference')?.rows?.[0];
    if (axis?.kind === 'select') axis.onChange('station');
    s.type?.onChange('railway');
    expect(commands[0]).toMatchObject({
      changes: { reference: { type: 'station', alignment: 'cesta', station: 1150, angle: '60' } },
    });
    expect(commands[1]).toMatchObject({
      changes: { kind: 'railway', clearance: { height: '6.5', chamfer: '0.5' } },
    });
  });

  it('recognises the reference and the preset', () => {
    expect(referenceKey({ type: 'curve', curve: { type: 'planLine', id: 'pl' } })).toBe(
      'planLine:pl',
    );
    expect(presetOf({ ...defaultClearance('road'), height: '5' })).toBe('');
    expect(presetOf(defaultClearance('water'))).toBe('water');
  });
});
