import { describe, expect, it } from 'vitest';
import { parseDxf } from './dxf.ts';
import { suggestSurveyLayers, summarizeLayers } from './layers.ts';
import { extractSurvey, parseHeight, SURVEY_TOLERANCES, type SurveyLayers } from './survey.ts';
import { dxfText, lwpolyline, point, text } from './testing.ts';

/** Bod meračky ako vo vzorke: kód (23) a výška (5, centrovaná) v bode, číslo (4) vľavo dole v bode. */
const surveyed = (n: number, x: number, y: number, z: string | undefined, code = 'asf') => [
  point('Vrstva 23', x, y),
  text('Vrstva 4', x, y, String(n)),
  text('Vrstva 23', x - 0.4, y - 0.3, code, { x, y, h: 2, v: 3 }),
  ...(z === undefined ? [] : [text('Vrstva 5', x - 0.39, y, z, { x, y, h: 1 })]),
];

const LAYERS: SurveyLayers = {
  points: ['Vrstva 23'],
  heights: ['Vrstva 5'],
  numbers: ['Vrstva 4'],
  codes: ['Vrstva 23'],
  lines: ['asfalt'],
};

function drawingOf(
  entities: readonly { type: string; groups: readonly (readonly [number, string | number])[] }[],
) {
  const { drawing } = parseDxf(dxfText({ header: { $INSUNITS: [[70, 6]] }, entities }));
  if (!drawing) throw new Error('DXF sa nenačítal');
  return drawing;
}

describe('survey heights from texts', () => {
  it('parses heights with a decimal point or comma', () => {
    expect(parseHeight(' 804.52 ')).toBe(804.52);
    expect(parseHeight('804,52')).toBe(804.52);
    expect(parseHeight('805')).toBe(805);
    expect(parseHeight('h=804.5')).toBeUndefined();
  });

  it('gives each point its height, number and code', () => {
    const d = drawingOf([
      ...surveyed(1, -302796.712, -1199001.555, '804.52', 'te'),
      ...surveyed(2, -302796.35, -1199004.538, '804.75'),
    ]);
    const s = extractSurvey(d, LAYERS, SURVEY_TOLERANCES);
    expect(s.issues).toEqual([]);
    expect(s.points).toEqual([
      { x: -302796.712, y: -1199001.555, z: 804.52, number: '1', code: 'te', layer: 'Vrstva 23' },
      { x: -302796.35, y: -1199004.538, z: 804.75, number: '2', code: 'asf', layer: 'Vrstva 23' },
    ]);
  });

  it('keeps heights of points 4 cm apart (top and foot of a wall) apart', () => {
    const d = drawingOf([
      ...surveyed(18, -302779.083, -1198998.929, '804.58'),
      ...surveyed(19, -302779.097, -1198998.893, '804.70'),
    ]);
    const s = extractSurvey(d, LAYERS, SURVEY_TOLERANCES);
    expect(s.issues).toEqual([]);
    expect(s.points.map((p) => [p.number, p.z])).toEqual([
      ['18', 804.58],
      ['19', 804.7],
    ]);
  });

  it('assigns a text moved towards another point by elimination and reports it as ambiguous', () => {
    const d = drawingOf([
      ...surveyed(1, 0, 0, undefined),
      ...surveyed(2, 1.1, 0, '805.10'),
      // výška bodu 1 posunutá k bodu 2: 0,8 m od bodu 1, 0,3 m od bodu 2
      text('Vrstva 5', 0.8, 0, '804.00', { x: 0.8, y: 0, h: 1 }),
    ]);
    const s = extractSurvey(d, LAYERS, SURVEY_TOLERANCES);
    expect(s.points.map((p) => p.z)).toEqual([804, 805.1]);
    expect(s.issues).toEqual([
      {
        severity: 'warning',
        code: 'AmbiguousHeight',
        x: 0,
        y: 0,
        number: '1',
        value: 804,
        distance: 0.8,
      },
    ]);
  });

  it('reports points without a height, heights without a point and non-numeric heights', () => {
    const d = drawingOf([
      ...surveyed(7, 0, 0, undefined),
      text('Vrstva 5', 5, 0, '806.20', { x: 5, y: 0, h: 1 }),
      text('Vrstva 5', 9, 0, 'Q100', { x: 9, y: 0, h: 1 }),
    ]);
    const s = extractSurvey(d, LAYERS, SURVEY_TOLERANCES);
    expect(s.points[0]?.z).toBeUndefined();
    expect(s.issues).toEqual([
      { severity: 'warning', code: 'NonNumericHeight', x: 9, y: 0, text: 'Q100' },
      { severity: 'warning', code: 'PointWithoutHeight', x: 0, y: 0, number: '7' },
      { severity: 'warning', code: 'HeightWithoutPoint', x: 5, y: 0, value: 806.2 },
    ]);
    // bez hladín výšok sa body bez výšky nehlásia
    expect(extractSurvey(d, { ...LAYERS, heights: [] }, SURVEY_TOLERANCES).issues).toEqual([]);
  });

  it('gives line vertices the height of a surveyed point within 5 cm', () => {
    const d = drawingOf([
      ...surveyed(1, 0, 0, '804.00'),
      ...surveyed(2, 10, 0, '804.50'),
      lwpolyline('asfalt', [
        [0.03, 0.03],
        [5, 0],
        [10, 0.06],
      ]),
      lwpolyline('kamen', [
        [0, 0],
        [1, 1],
      ]),
    ]);
    const s = extractSurvey(d, LAYERS, SURVEY_TOLERANCES);
    expect(s.lines).toEqual([
      {
        layer: 'asfalt',
        closed: false,
        points: [
          { x: 0.03, y: 0.03, z: 804 },
          { x: 5, y: 0, z: undefined },
          { x: 10, y: 0.06, z: undefined },
        ],
      },
    ]);
  });
});

describe('survey layers', () => {
  it('summarises entities per layer and suggests the survey layers', () => {
    const entities = [
      ...surveyed(1, 0, 0, '804.00', 'te'),
      ...surveyed(2, 3, 0, '804.10'),
      ...surveyed(3, 6, 0, '804.20', 'hs'),
      lwpolyline('asfalt', [
        [0, 0],
        [6, 0],
      ]),
      text('popis', 20, 20, 'Most ev. č. 12-34'),
    ];
    const d = drawingOf(entities);
    expect(summarizeLayers(d).find((l) => l.name === 'Vrstva 23')).toMatchObject({
      points: 3,
      texts: 3,
      lines: 0,
      inserts: 0,
    });
    expect(suggestSurveyLayers(d, SURVEY_TOLERANCES)).toEqual({
      points: ['Vrstva 23'],
      heights: ['Vrstva 5'],
      numbers: ['Vrstva 4'],
      codes: ['Vrstva 23'],
      lines: ['asfalt'],
    });
  });

  it('takes survey symbols inserted as blocks on a point layer as points', () => {
    const insert: { type: string; groups: readonly (readonly [number, string | number])[] } = {
      type: 'INSERT',
      groups: [
        [8, 'body'],
        [2, 'bod'],
        [10, 2],
        [20, 3],
        [30, 0],
      ],
    };
    const d = drawingOf([insert, text('vysky', 2, 3, '801.40', { x: 2, y: 3, h: 1 })]);
    const s = extractSurvey(
      d,
      { points: ['body'], heights: ['vysky'], numbers: [], codes: [], lines: [] },
      SURVEY_TOLERANCES,
    );
    expect(s.points).toEqual([
      { x: 2, y: 3, z: 801.4, number: undefined, code: undefined, layer: 'body' },
    ]);
  });
});
