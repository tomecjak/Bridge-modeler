import { describe, expect, it } from 'vitest';
import { newObstacle, obstacleName } from './obstacles.ts';

describe('obstacles', () => {
  it('numbers new obstacles by their kind name', () => {
    expect(obstacleName('Cesta', ['Cesta 1', 'Potok'])).toBe('Cesta 2');
  });

  it('levels an obstacle on a graded alignment by its grade, others by an estimated elevation', () => {
    const reference = {
      type: 'curve' as const,
      curve: { type: 'alignment' as const, name: 'vetva' },
    };
    expect(
      newObstacle({ id: 'o', name: 'Cesta 1', kind: 'road', reference, graded: true, level: 0 }),
    ).toMatchObject({ level: { kind: 'grade' }, clearance: { height: '4.8', slopeLeft: '0.025' } });
    expect(
      newObstacle({
        id: 'o',
        name: 'Železnica 1',
        kind: 'railway',
        reference: { type: 'station', alignment: 'cesta', station: 1130, angle: '75' },
        graded: false,
        level: 293.456,
      }),
    ).toMatchObject({
      level: { kind: 'constant', value: '293.46' },
      clearance: { chamfer: '0.5' },
    });
  });
});
