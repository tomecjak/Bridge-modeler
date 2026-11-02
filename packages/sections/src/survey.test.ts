import { type AlignmentData, createAlignment } from '@bridge/alignment';
import { vec2 } from '@bridge/geom';
import {
  type BridgeAxis,
  buildParameterSet,
  defaultClearance,
  type Obstacle,
  type Superstructure,
  type Survey,
} from '@bridge/model';
import { describe, expect, it } from 'vitest';
import { edgeDistance } from './edge.ts';
import { evaluateObstacle, type ObstacleContext } from './obstacles.ts';
import { findSurveyLine, heightAlong, lineHeights, lineLengths, surveyCut } from './survey.ts';

const survey = (lines: Survey['lines'], points: Survey['points'] = []): Survey => ({
  id: 'm',
  name: 'Meračka',
  file: 'meracka.dxf',
  layers: { points: [], heights: [], numbers: [], codes: [], lines: [] },
  points,
  lines,
});

describe('survey line heights', () => {
  it('interpolates between surveyed vertices along the line and holds the nearest at the ends', () => {
    expect(
      lineHeights([
        { x: 0, y: 0, z: 10 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 3, y: 0, z: 16 },
      ]),
    ).toEqual([10, 12, 14, 16]);
    expect(
      lineHeights([
        { x: 0, y: 0 },
        { x: 0, y: 3, z: 5 },
        { x: 4, y: 3 },
      ]),
    ).toEqual([5, 5, 5]);
    expect(
      lineHeights([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]),
    ).toBeUndefined();
  });

  it('gives the height at a length along the line', () => {
    const pts = [
      { x: 0, y: 0, z: 100 },
      { x: 30, y: 0 },
      { x: 30, y: 40, z: 107 },
    ];
    const heights = lineHeights(pts) as number[];
    expect(lineLengths(pts)).toEqual([0, 30, 70]);
    expect(heightAlong(lineLengths(pts), heights, 35)).toBeCloseTo(103.5, 12);
    expect(heightAlong(lineLengths(pts), heights, -5)).toBe(100);
  });

  it('finds the line a survey curve refers to', () => {
    const s = survey([{ id: 'L1', layer: 'asfalt', points: [], closed: false }]);
    expect(findSurveyLine([s], { type: 'survey', survey: 'm', line: 'L1' })?.line.layer).toBe(
      'asfalt',
    );
    expect(findSurveyLine([s], { type: 'survey', survey: 'm', line: 'L2' })).toBeUndefined();
    expect(findSurveyLine([s], { type: 'planLine', id: 'L1' })).toBeUndefined();
  });
});

describe('survey in a cross section', () => {
  it('cuts lines with the section plane and keeps surveyed points within reach', () => {
    const s = survey(
      [
        {
          id: 'L1',
          layer: 'asfalt',
          points: [
            { x: -10, y: 5, z: 10 },
            { x: 10, y: -5, z: 20 },
          ],
          closed: false,
        },
      ],
      [
        { x: 3, y: 0.5, z: 7, number: '1' },
        { x: 3, y: 2, z: 8 },
        { x: 80, y: 0, z: 9 },
      ],
    );
    // rovina rezu y = 0 (normála vpravo +x), pol šírky 60 m, body do 1 m
    const cut = surveyCut([s], vec2(0, 0), vec2(1, 0), 60, 1);
    expect(cut.crossings).toHaveLength(1);
    expect(cut.crossings[0]?.x).toBeCloseTo(0, 12);
    expect(cut.crossings[0]?.z).toBeCloseTo(15, 12);
    expect(cut.points).toEqual([{ x: 3, z: 7 }]);
  });

  it('cuts the closing segment of a closed line once per vertex in the plane', () => {
    const ring = survey([
      {
        id: 'L1',
        layer: 'priepust',
        points: [
          { x: -1, y: -1, z: 1 },
          { x: 1, y: -1, z: 2 },
          { x: 1, y: 1, z: 3 },
          { x: -1, y: 1, z: 4 },
        ],
        closed: true,
      },
    ]);
    const cut = surveyCut([ring], vec2(0, 0), vec2(1, 0), 60, 1);
    expect(cut.crossings.map((c) => [c.x, c.z])).toEqual([
      [1, 2.5],
      [-1, 2.5],
    ]);
  });
});

/** most na osi „cesta“ (na sever, km 1,000 v počiatku) s NK km 1,100 – 1,200 (ako v obstacles.test.ts) */
function context(surveys: Survey[]): ObstacleContext {
  const data: AlignmentData = {
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
  const axis: BridgeAxis = {
    id: 'ax',
    name: 'Os mosta',
    alignment: 'cesta',
    horizontalOffset: { kind: 'constant', value: '0' },
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
    alignments: new Map([['cesta', createAlignment(data, { x: 0, y: 0, z: 0 }).alignment]]),
    parameters: buildParameterSet([]),
    bridgeAxes: [axis],
    superstructures: [deck],
    planLines: [],
    surveys,
  };
}

const fromSurvey = (line: string, level: Obstacle['level']): Obstacle => ({
  id: 'o',
  name: 'Cesta pod mostom',
  kind: 'road',
  reference: { type: 'curve', curve: { type: 'survey', survey: 'm', line } },
  level,
  clearance: defaultClearance('road'),
});

describe('survey line as an obstacle axis (ADR 0021)', () => {
  // okraj asfaltu kríži os mosta na km 1,150 pod uhlom 60°, výšky v krajných bodoch 800 a 806
  const d = vec2(Math.cos(Math.PI / 3), Math.sin(Math.PI / 3));
  const edge = survey([
    {
      id: 'L1',
      layer: 'asfalt',
      points: [
        { x: -20 * d.x, y: 150 - 20 * d.y, z: 800 },
        { x: 0, y: 150 },
        { x: 20 * d.x, y: 150 + 20 * d.y, z: 806 },
      ],
      closed: false,
    },
    {
      id: 'L2',
      layer: 'kamen',
      points: [
        { x: -20, y: 160 },
        { x: 20, y: 160 },
      ],
      closed: false,
    },
  ]);

  it('gives the crossing station, angle and the line height as the level', () => {
    const r = evaluateObstacle(context([edge]), fromSurvey('L1', { kind: 'line' }));
    expect(r.issues).toEqual([]);
    expect(r.crossings).toHaveLength(1);
    const c = r.crossings[0];
    expect(c?.station).toBeCloseTo(1150, 9);
    // od osi mosta (sever) proti smeru hodín k čiare smerujúcej 30° na východ od severu
    expect(c?.angle).toBeCloseTo(150, 9);
    expect(c?.level).toBeCloseTo(803, 9);
    expect(r.levelAt(0)).toBe(800);
  });

  it('reports a missing line and a line without heights for the line level', () => {
    expect(evaluateObstacle(context([edge]), fromSurvey('L9', { kind: 'line' })).issues).toEqual([
      expect.objectContaining({ code: 'ObstacleCurveNotFound', curve: 'L9' }),
    ]);
    expect(evaluateObstacle(context([]), fromSurvey('L1', { kind: 'line' })).issues).toEqual([
      expect.objectContaining({ code: 'ObstacleCurveNotFound', curve: 'L1' }),
    ]);
    expect(
      evaluateObstacle(context([edge]), fromSurvey('L2', { kind: 'line' })).issues,
    ).toContainEqual(expect.objectContaining({ code: 'ObstacleLevelUnavailable', level: 'line' }));
  });

  it('measures a deck edge to a survey line', () => {
    const ctx = context([edge]);
    const ref = { type: 'survey', survey: 'm', line: 'L2' } as const;
    // od bodu (0, 150) na sever ku čiare y = 160
    expect(edgeDistance(ctx, ref, vec2(0, 150), vec2(0, 1), 'right')).toEqual({
      ok: true,
      value: 10,
    });
    expect(edgeDistance({ ...ctx, surveys: [] }, ref, vec2(0, 150), vec2(0, 1), 'right')).toEqual({
      ok: false,
      issue: { code: 'EdgeCurveNotFound', curve: 'L2' },
    });
  });
});
