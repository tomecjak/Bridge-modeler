import type { DxfDrawing } from '@bridge/survey';
import { describe, expect, it } from 'vitest';
import { buildSurvey, surveyHeightRange, surveyOrigin } from './importSurvey.ts';

const at = (x: number, y: number) => ({ x, y, z: 0 });
const text = (layer: string, x: number, y: number, value: string) => ({
  kind: 'text' as const,
  layer,
  at: at(x, y),
  text: value,
  height: 0.2,
  rotation: 0,
});

/** meračka v S-JTSK: dva body s výškou, jeden bez, čiara cez body a čiara ďaleko */
const drawing: DxfDrawing = {
  version: 'AC1018',
  encoding: 'windows-1250',
  unitScale: 1,
  layers: [],
  skipped: {},
  bulges: 0,
  entities: [
    { kind: 'point', layer: 'body', at: at(-302796.7124, -1199001.5551) },
    text('vysky', -302796.7124, -1199001.5551, '804.52'),
    text('cisla', -302796.7124, -1199001.5551, '1'),
    { kind: 'point', layer: 'body', at: at(-302790, -1199001.5) },
    text('vysky', -302790, -1199001.5, '805.10'),
    { kind: 'point', layer: 'body', at: at(-302500, -1199001.5) },
    {
      kind: 'line',
      layer: 'asfalt',
      entity: 'LWPOLYLINE',
      points: [at(-302796.7124, -1199001.5551), at(-302790, -1199001.5), at(-302780, -1199001)],
      closed: false,
    },
    {
      kind: 'line',
      layer: 'asfalt',
      entity: 'LINE',
      points: [at(-302500, -1199000), at(-302490, -1199000)],
      closed: false,
    },
  ],
};

const layers = {
  points: ['body'],
  heights: ['vysky'],
  numbers: ['cisla'],
  codes: [],
  lines: ['asfalt'],
};
const origin = { x: -302800, y: -1199000, z: 0 };

describe('survey import', () => {
  it('takes the origin from the first entity rounded to 100 m', () => {
    expect(surveyOrigin(drawing)).toEqual({ x: -302800, y: -1199000, z: 0 });
  });

  it('stores points and lines in local coordinates rounded to mm with ids in file order', () => {
    const r = buildSurvey({
      drawing,
      fileName: 'm.dxf',
      layers,
      id: 's',
      name: 'M',
      origin,
      clip: undefined,
    });
    expect(r.dropped).toEqual({ points: 0, lines: 0 });
    expect(r.survey?.points).toEqual([
      { x: 3.288, y: -1.555, z: 804.52, number: '1' },
      { x: 10, y: -1.5, z: 805.1 },
      { x: 300, y: -1.5 },
    ]);
    expect(r.survey?.lines.map((l) => l.id)).toEqual(['L1', 'L2']);
    expect(r.survey?.lines[0]?.points).toEqual([
      { x: 3.288, y: -1.555, z: 804.52 },
      { x: 10, y: -1.5, z: 805.1 },
      { x: 20, y: -1 },
    ]);
    expect(r.issues).toEqual([
      {
        severity: 'warning',
        code: 'PointWithoutHeight',
        x: -302500,
        y: -1199001.5,
        number: undefined,
      },
    ]);
    expect(r.survey && surveyHeightRange(r.survey)).toEqual({ min: 804.52, max: 805.1 });
  });

  it('clips to the area keeping whole lines that reach into it and their issues only', () => {
    const r = buildSurvey({
      drawing,
      fileName: 'm.dxf',
      layers,
      id: 's',
      name: 'M',
      origin,
      clip: { contains: (x) => x < 15 },
    });
    expect(r.survey?.points).toHaveLength(2);
    expect(r.survey?.lines).toHaveLength(1);
    expect(r.survey?.lines[0]?.points).toHaveLength(3);
    expect(r.dropped).toEqual({ points: 1, lines: 1 });
    expect(r.issues).toEqual([]);
  });

  it('gives no survey when nothing is left in the area', () => {
    const r = buildSurvey({
      drawing,
      fileName: 'm.dxf',
      layers,
      id: 's',
      name: 'M',
      origin,
      clip: { contains: () => false },
    });
    expect(r.survey).toBeUndefined();
  });
});
