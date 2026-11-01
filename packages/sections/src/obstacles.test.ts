import { type AlignmentData, createAlignment } from '@bridge/alignment';
import { type Vec2, vec2 } from '@bridge/geom';
import {
  type BridgeAxis,
  buildParameterSet,
  defaultClearance,
  type Obstacle,
  type Superstructure,
} from '@bridge/model';
import { describe, expect, it } from 'vitest';
import { evaluateObstacle, type ObstacleContext } from './obstacles.ts';

const ORIGIN = { x: 0, y: 0, z: 200 };
const deg = (a: number) => (a * Math.PI) / 180;

/** priama os so začiatkom `start`, smerníkom `azimuth` [rad] a vodorovnou niveletou `z` */
function line(name: string, start: Vec2, azimuth: number, length: number, z: number, staStart = 0) {
  const end = vec2(start.x + length * Math.sin(azimuth), start.y + length * Math.cos(azimuth));
  const data: AlignmentData = {
    name,
    staStart,
    length,
    horizontal: [{ kind: 'line', length, start, end }],
    stationEquations: [],
    profiles: [
      {
        name: 'n',
        pvis: [
          { station: staStart, elevation: z },
          { station: staStart + length, elevation: z },
        ],
      },
    ],
  };
  return createAlignment(data, ORIGIN).alignment;
}

/** most na osi „cesta“ (na sever, km 1,000 v počiatku) s NK km 1,100 – 1,200 */
function context(extra: ObstacleContext['alignments'] = new Map(), offset = '0'): ObstacleContext {
  const road = line('cesta', vec2(0, 0), 0, 300, 300, 1000);
  const axis: BridgeAxis = {
    id: 'ax',
    name: 'Os mosta',
    alignment: 'cesta',
    horizontalOffset: { kind: 'constant', value: offset },
    verticalOffset: { kind: 'constant', value: '0' },
  };
  const deck: Superstructure = {
    id: 'nk',
    name: 'NK',
    bridgeAxis: 'ax',
    from: 1100,
    to: 1200,
    profile: 'p',
    parameterLaws: {},
    orientation: 'vertical',
  };
  return {
    alignments: new Map([['cesta', road], ...extra]),
    parameters: buildParameterSet([]),
    bridgeAxes: [axis],
    superstructures: [deck],
    planLines: [],
  };
}

const obstacle = (reference: Obstacle['reference'], level: Obstacle['level']): Obstacle => ({
  id: 'o',
  name: 'III/1234',
  kind: 'road',
  reference,
  level,
  clearance: defaultClearance('road'),
});

/** os prekážky cez bod (0, 150) otočená o 60° proti smeru hodín od osi cesty (na sever) */
const crossing60 = () => {
  const d = deg(-60);
  const start = vec2(-100 * Math.sin(d), 150 - 100 * Math.cos(d));
  return line('vetva', start, d, 200, 290);
};

describe('evaluateObstacle — kríženie s osou mosta', () => {
  it('gives the station, crossing angle and grade of a crossing LandXML alignment', () => {
    const ctx = context(new Map([['vetva', crossing60()]]));
    const r = evaluateObstacle(
      ctx,
      obstacle({ type: 'curve', curve: { type: 'alignment', name: 'vetva' } }, { kind: 'grade' }),
    );
    expect(r.issues).toEqual([]);
    expect(r.crossings).toHaveLength(1);
    const c = r.crossings[0];
    expect(c?.bridgeAxis).toBe('ax');
    expect(c?.station).toBeCloseTo(1150, 6);
    expect(c?.angle).toBeCloseTo(60, 6);
    expect(c?.t).toBeCloseTo(100, 6);
    expect(c?.point.x).toBeCloseTo(0, 6);
    expect(c?.level).toBeCloseTo(90, 9);
    expect(r.levelAt(50)).toBeCloseTo(90, 9);
  });

  it('measures the angle counter-clockwise from the bridge axis whatever the obstacle direction', () => {
    const reversed = crossing60();
    const end = reversed.evaluateHorizontal(reversed.length).point;
    const back = line('späť', end, deg(120), 200, 290);
    const ctx = context(new Map([['späť', back]]));
    const r = evaluateObstacle(
      ctx,
      obstacle({ type: 'curve', curve: { type: 'alignment', name: 'späť' } }, { kind: 'grade' }),
    );
    expect(r.crossings[0]?.angle).toBeCloseTo(60, 6);
  });

  it('crosses a bridge axis offset from the road axis', () => {
    const ctx = context(new Map([['vetva', crossing60()]]), '3');
    const r = evaluateObstacle(
      ctx,
      obstacle({ type: 'curve', curve: { type: 'alignment', name: 'vetva' } }, { kind: 'grade' }),
    );
    // os mosta 3 m vpravo (na východ): priesečník sa posunie po osi prekážky o 3 / sin 60°
    expect(r.crossings[0]?.point.x).toBeCloseTo(3, 6);
    expect(r.crossings[0]?.station).toBeCloseTo(1150 - 3 / Math.tan(deg(60)), 6);
  });

  it('builds a manual crossing on a road station with the crossing angle and a constant level', () => {
    const r = evaluateObstacle(
      context(),
      obstacle(
        { type: 'station', alignment: 'cesta', station: 1130, angle: '75' },
        { kind: 'constant', value: '296.5' },
      ),
    );
    expect(r.issues).toEqual([]);
    expect(r.crossings[0]?.station).toBeCloseTo(1130, 6);
    expect(r.crossings[0]?.angle).toBeCloseTo(75, 6);
    expect(r.crossings[0]?.level).toBeCloseTo(96.5, 9);
  });

  it('uses a plan line and reports a missing curve, no crossing and an unavailable level', () => {
    const ctx: ObstacleContext = {
      ...context(),
      planLines: [
        {
          id: 'pl',
          name: 'Potok',
          points: [
            { x: -20, y: 160 },
            { x: 20, y: 180 },
          ],
        },
        {
          id: 'daleko',
          name: 'Ďaleko',
          points: [
            { x: 500, y: 0 },
            { x: 600, y: 10 },
          ],
        },
      ],
    };
    const potok = evaluateObstacle(
      ctx,
      obstacle({ type: 'curve', curve: { type: 'planLine', id: 'pl' } }, { kind: 'grade' }),
    );
    expect(potok.crossings[0]?.station).toBeCloseTo(1170, 6);
    expect(potok.crossings[0]?.angle).toBeCloseTo(90 + (Math.atan2(20, 40) * 180) / Math.PI, 6);
    expect(potok.crossings[0]?.level).toBeUndefined();
    expect(potok.issues.map((i) => i.code)).toEqual(['ObstacleLevelUnavailable']);
    const far = evaluateObstacle(
      ctx,
      obstacle(
        { type: 'curve', curve: { type: 'planLine', id: 'daleko' } },
        { kind: 'constant', value: '290' },
      ),
    );
    expect(far.crossings).toEqual([]);
    expect(far.issues).toMatchObject([{ code: 'ObstacleWithoutCrossing', severity: 'warning' }]);
    const missing = evaluateObstacle(
      ctx,
      obstacle({ type: 'curve', curve: { type: 'alignment', name: 'nie je' } }, { kind: 'grade' }),
    );
    expect(missing.issues).toMatchObject([
      { code: 'ObstacleCurveNotFound', owner: { kind: 'obstacle', name: 'III/1234' } },
    ]);
  });

  it('evaluates the clearance dimensions', () => {
    const r = evaluateObstacle(
      context(),
      obstacle(
        { type: 'station', alignment: 'cesta', station: 1130, angle: '90' },
        { kind: 'constant', value: '296.5' },
      ),
    );
    expect(r.clearance).toEqual({
      left: 5.5,
      right: 5.5,
      height: 4.8,
      slopeLeft: 0.025,
      slopeRight: 0.025,
      chamfer: 0,
    });
  });
});
