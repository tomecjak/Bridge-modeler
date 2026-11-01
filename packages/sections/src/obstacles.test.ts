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
import {
  CLEARANCE_REACH,
  clearanceAlong,
  clearanceAt,
  clearanceFootprint,
  clearanceOutline,
  clearanceShape,
  evaluateObstacle,
  type ObstacleContext,
} from './obstacles.ts';

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

describe('voľný prierez', () => {
  const manual = (angle: string) =>
    evaluateObstacle(
      context(),
      obstacle(
        { type: 'station', alignment: 'cesta', station: 1130, angle },
        { kind: 'constant', value: '296.5' },
      ),
    );

  it('slopes the bottom from the axis and cuts the top corners', () => {
    const c = { left: 5, right: 4, height: 4.8, slopeLeft: 0.025, slopeRight: -0.02, chamfer: 0.5 };
    expect(clearanceShape(c, 0)?.bottom).toBeCloseTo(0, 12);
    expect(clearanceShape(c, 0)?.top).toBeCloseTo(4.8, 12);
    expect(clearanceShape(c, -5)?.bottom).toBeCloseTo(-0.125, 12);
    expect(clearanceShape(c, -5)?.top).toBeCloseTo(-0.125 + 4.3, 12);
    expect(clearanceShape(c, 3.75)?.top).toBeCloseTo(0.075 + 4.8 - 0.25, 12);
    expect(clearanceShape(c, 4.01)).toBeUndefined();
    expect(clearanceOutline(c)).toHaveLength(8);
    expect(clearanceOutline({ ...c, chamfer: 0 })).toHaveLength(6);
  });

  it('gives the bottom and top of the clearance at a plan point', () => {
    const r = manual('90');
    // bod osi mosta (cesta na sever) v krížení: os prekážky smeruje na západ, odsadenie 0
    const at = clearanceAt(r, vec2(0, 130));
    expect(at?.bottom).toBeCloseTo(96.5, 9);
    expect(at?.top).toBeCloseTo(96.5 + 4.8, 9);
    // 2 m na sever = 2 m vpravo od osi prekážky smerujúcej na západ
    expect(clearanceAt(r, vec2(0, 132))?.bottom).toBeCloseTo(96.5 - 0.05, 9);
    expect(clearanceAt(r, vec2(0, 136))).toBeUndefined();
  });

  it('cuts the clearance along the bridge axis to (l + r) / sin α wide', () => {
    const r = manual('60');
    const line = [0, 100, 200, 300].map((s) => ({ u: s, point: vec2(0, s) }));
    const cut = clearanceAlong(r, line);
    expect(cut.polygons).toHaveLength(1);
    const us = (cut.polygons[0] ?? []).map((p) => p.x);
    expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(11 / Math.sin(deg(60)), 9);
    expect(cut.axis).toHaveLength(1);
    expect(cut.axis[0]).toBeCloseTo(130, 9);
    const top = Math.max(...(cut.polygons[0] ?? []).map((p) => p.y));
    expect(top).toBeCloseTo(96.5 + 4.8, 9);
  });

  it('draws the plan footprint of the clearance around the crossing', () => {
    const r = manual('90');
    const [band] = clearanceFootprint(r);
    const xs = (band ?? []).map((p) => p.x);
    const ys = (band ?? []).map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(11, 9);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2 * CLEARANCE_REACH, 6);
  });
});
