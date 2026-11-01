import { type AlignmentData, createAlignment } from '@bridge/alignment';
import { vec2 } from '@bridge/geom';
import { buildParameterSet, defaultClearance, type Obstacle } from '@bridge/model';
import { CLEARANCE_REACH, evaluateObstacle } from '@bridge/sections';
import { describe, expect, it } from 'vitest';
import { clearanceMesh } from './clearance.ts';
import { MeshKernel } from './kernel.ts';
import { meshBounds, meshVolume } from './mesh.ts';

const road: AlignmentData = {
  name: 'cesta',
  staStart: 1000,
  length: 300,
  horizontal: [{ kind: 'line', length: 300, start: vec2(0, 0), end: vec2(0, 300) }],
  stationEquations: [],
  profiles: [
    {
      name: 'n',
      pvis: [
        { station: 1000, elevation: 300 },
        { station: 1300, elevation: 300 },
      ],
    },
  ],
};

describe('clearanceMesh', () => {
  it('sweeps the clearance outline along the obstacle around the crossing', () => {
    const alignment = createAlignment(road, { x: 0, y: 0, z: 0 }).alignment;
    const obstacle: Obstacle = {
      id: 'o',
      name: 'Železnica',
      kind: 'railway',
      reference: { type: 'station', alignment: 'cesta', station: 1150, angle: '90' },
      level: { kind: 'constant', value: '290' },
      clearance: defaultClearance('railway'),
    };
    const r = evaluateObstacle(
      {
        alignments: new Map([['cesta', alignment]]),
        parameters: buildParameterSet([]),
        bridgeAxes: [
          {
            id: 'ax',
            name: 'Os mosta',
            alignment: 'cesta',
            horizontalOffset: { kind: 'constant', value: '0' },
            verticalOffset: { kind: 'constant', value: '0' },
          },
        ],
        superstructures: [
          {
            id: 'nk',
            name: 'NK',
            bridgeAxis: 'ax',
            from: 1100,
            to: 1200,
            profile: 'p',
            parameterLaws: {},
            orientation: 'vertical',
          },
        ],
        planLines: [],
      },
      obstacle,
    );
    const mesh = clearanceMesh(new MeshKernel(), r);
    // plocha obrysu 5 × 6,5 bez dvoch skosení 0,5 × 0,5 / 2, dĺžka 2 × dosah
    const area = 5 * 6.5 - (2 * (0.5 * 0.5)) / 2;
    expect(meshVolume(mesh)).toBeCloseTo(area * 2 * CLEARANCE_REACH, 6);
    const b = meshBounds(mesh);
    expect(b?.min.z).toBeCloseTo(290, 9);
    expect(b?.max.z).toBeCloseTo(296.5, 9);
  });
});
