import { describe, expect, it } from 'vitest';
import { codepageEncoding, decodeDxfText, parseDxf } from './dxf.ts';
import { dxfText, lwpolyline, point, text } from './testing.ts';

const metres = { $INSUNITS: [[70, 6]] as const };

/** Bajty ANSI: znaky nad 0x7F zadané kódom stránky (napr. ľ = 0xBE vo windows-1250). */
const ansi = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

describe('DXF reader', () => {
  it('reads the header, layers and model space entities', () => {
    const { drawing, issues } = parseDxf(
      dxfText({
        header: { $ACADVER: [[1, 'AC1018']], ...metres },
        layers: [
          { name: 'body', color: 3 },
          { name: 'vypnutá', color: -7 },
          { name: 'zmrazená', flags: 1 },
        ],
        entities: [
          point('body', -302796.712, -1199001.555),
          {
            type: 'LINE',
            groups: [
              [8, 'čiary'],
              [10, 1],
              [20, 2],
              [30, 0],
              [11, 4],
              [21, 6],
              [31, 0],
            ],
          },
          { type: 'ELLIPSE', groups: [[8, 'body']] },
          { type: 'VIEWPORT', groups: [[67, 1]] },
          {
            type: 'INSERT',
            groups: [
              [8, 'značky'],
              [2, 'C108'],
              [10, 5],
              [20, 7],
              [30, 0],
            ],
          },
        ],
      }),
    );
    expect(issues).toEqual([]);
    expect(drawing?.version).toBe('AC1018');
    expect(drawing?.unitScale).toBe(1);
    expect(drawing?.layers).toEqual([
      { name: 'body', color: 3, hidden: false },
      { name: 'vypnutá', color: 7, hidden: true },
      { name: 'zmrazená', color: 7, hidden: true },
      { name: 'čiary', color: 7, hidden: false },
      { name: 'značky', color: 7, hidden: false },
    ]);
    expect(drawing?.entities).toEqual([
      { kind: 'point', layer: 'body', at: { x: -302796.712, y: -1199001.555, z: 0 } },
      {
        kind: 'line',
        layer: 'čiary',
        entity: 'LINE',
        points: [
          { x: 1, y: 2, z: 0 },
          { x: 4, y: 6, z: 0 },
        ],
        closed: false,
      },
      { kind: 'insert', layer: 'značky', at: { x: 5, y: 7, z: 0 }, block: 'C108' },
    ]);
    // výrez papierového priestoru (67 = 1) nie je v modelovom priestore
    expect(drawing?.skipped).toEqual({ ELLIPSE: 1 });
  });

  it('decodes texts with the code page from the header and as UTF-8 since AutoCAD 2007', () => {
    expect(codepageEncoding('ANSI_1250')).toBe('windows-1250');
    expect(codepageEncoding('ANSI_932')).toBe('windows-1252');
    expect(codepageEncoding(undefined)).toBe('windows-1252');
    const spec = (version: string, name: string) =>
      dxfText({
        header: { $ACADVER: [[1, version]], $DWGCODEPAGE: [[3, 'ANSI_1250']], ...metres },
        entities: [point(name, 0, 0)],
      });
    // š = 0x9A, ľ = 0xBE, č = 0xE8 vo windows-1250 (vo windows-1252 by to boli š, ¾, è)
    const byte = String.fromCharCode;
    const old = parseDxf(
      ansi(spec('AC1018', `Skryté vý${byte(0x9a)}ky ${byte(0xbe)}avé ${byte(0xe8)}íslo`)),
    );
    expect(old.drawing?.encoding).toBe('windows-1250');
    expect(old.drawing?.layers.map((l) => l.name)).toEqual(['Skryté výšky ľavé číslo']);
    // „ľavé číslo“ v UTF-8 po bajtoch
    const utf8 = parseDxf(
      ansi(spec('AC1027', '\u00C4\u00BEav\u00C3\u00A9 \u00C4\u008D\u00C3\u00ADslo')),
    );
    expect(utf8.drawing?.encoding).toBe('utf-8');
    expect(utf8.drawing?.layers.map((l) => l.name)).toEqual(['ľavé číslo']);
  });

  it('replaces DXF control codes in texts', () => {
    expect(decodeDxfText('%%c1200 %%d %%p5 100%%% \\U+0161%%u')).toBe('⌀1200 ° ±5 100% š');
  });

  it('places justified texts at the alignment point and left or fitted texts at the insertion point', () => {
    const { drawing } = parseDxf(
      dxfText({
        header: metres,
        entities: [
          text('v', 0, 0, 'vľavo'),
          text('v', -0.39, 0, '804.52', { x: 0, y: 0, h: 1 }),
          text('v', 1, 1, 'na výšku', { x: 2, y: 2, h: 0, v: 2 }),
          text('v', 3, 3, 'zarovnaný', { x: 5, y: 3, h: 3 }),
        ],
      }),
    );
    const at = drawing?.entities.map((e) => (e.kind === 'text' ? [e.at.x, e.at.y] : []));
    expect(at).toEqual([
      [0, 0],
      [0, 0],
      [2, 2],
      [3, 3],
    ]);
  });

  it('scales millimetres and centimetres to metres and assumes metres without units', () => {
    const spec = (units: number) =>
      dxfText({
        header: { $INSUNITS: [[70, units]] },
        entities: [point('b', 1500, -2500, 300), text('t', 1000, 0, 'x')],
      });
    const mm = parseDxf(spec(4));
    expect(mm.issues).toEqual([]);
    expect(mm.drawing?.entities[0]).toMatchObject({ at: { x: 1.5, y: -2.5, z: 0.3 } });
    expect(mm.drawing?.entities[1]).toMatchObject({ height: 0.2 * 0.001 });
    expect(parseDxf(spec(5)).drawing?.entities[0]).toMatchObject({ at: { x: 15, y: -25, z: 3 } });
    const none = parseDxf(spec(0));
    expect(none.issues).toEqual([{ severity: 'warning', code: 'UnitsAssumed' }]);
    expect(none.drawing?.unitScale).toBe(1);
    expect(parseDxf(spec(1))).toEqual({
      drawing: undefined,
      issues: [{ severity: 'error', code: 'UnsupportedUnits', units: 1 }],
    });
  });

  it('reads lightweight polylines with elevation, closure and counts bulges', () => {
    const lw = lwpolyline('asfalt', [
      [0, 0],
      [10, 0],
      [10, 5],
    ]);
    const { drawing } = parseDxf(
      dxfText({
        header: metres,
        entities: [
          {
            type: 'LWPOLYLINE',
            groups: [...lw.groups.slice(0, 2), [70, 1], [38, 2], ...lw.groups.slice(3), [42, 0.4]],
          },
        ],
      }),
    );
    expect(drawing?.entities[0]).toEqual({
      kind: 'line',
      layer: 'asfalt',
      entity: 'LWPOLYLINE',
      points: [
        { x: 0, y: 0, z: 2 },
        { x: 10, y: 0, z: 2 },
        { x: 10, y: 5, z: 2 },
      ],
      closed: true,
    });
    expect(drawing?.bulges).toBe(1);
  });

  it('converts object coordinates with a downward extrusion to world coordinates', () => {
    const down = [
      [210, 0],
      [220, 0],
      [230, -1],
    ] as const;
    const lw = lwpolyline('l', [
      [1, 2],
      [3, 4],
    ]);
    const t = text('t', 5, 6, 'x');
    const { drawing } = parseDxf(
      dxfText({
        header: metres,
        entities: [
          { type: 'LWPOLYLINE', groups: [...lw.groups, [38, 1], ...down] },
          { type: 'TEXT', groups: [...t.groups, ...down] },
        ],
      }),
    );
    expect(drawing?.entities[0]).toMatchObject({
      points: [
        { x: -1, y: 2, z: -1 },
        { x: -3, y: 4, z: -1 },
      ],
    });
    expect(drawing?.entities[1]).toMatchObject({ at: { x: -5, y: 6, z: 0 } });
  });

  it('reads 2D and 3D polylines with vertices and skips meshes and spline frame points', () => {
    const vertex = (x: number, y: number, z: number, flags = 0) => ({
      type: 'VERTEX',
      groups: [
        [8, 'p'],
        [10, x],
        [20, y],
        [30, z],
        [70, flags],
      ] as const,
    });
    const polyline = (flags: number, elevation = 0) => ({
      type: 'POLYLINE',
      groups: [
        [8, 'p'],
        [66, 1],
        [10, 0],
        [20, 0],
        [30, elevation],
        [70, flags],
      ] as const,
    });
    const seqend = { type: 'SEQEND', groups: [[8, 'p']] as const };
    const { drawing } = parseDxf(
      dxfText({
        header: metres,
        entities: [
          polyline(1, 3),
          vertex(0, 0, 0),
          vertex(1, 0, 0),
          vertex(1, 1, 0),
          seqend,
          polyline(8),
          vertex(0, 0, 800.5),
          vertex(5, 5, 9, 16),
          vertex(2, 0, 801.25),
          seqend,
          polyline(16),
          vertex(0, 0, 0, 64),
          seqend,
        ],
      }),
    );
    expect(drawing?.entities).toEqual([
      {
        kind: 'line',
        layer: 'p',
        entity: 'POLYLINE',
        points: [
          { x: 0, y: 0, z: 3 },
          { x: 1, y: 0, z: 3 },
          { x: 1, y: 1, z: 3 },
        ],
        closed: true,
      },
      {
        kind: 'line',
        layer: 'p',
        entity: 'POLYLINE',
        points: [
          { x: 0, y: 0, z: 800.5 },
          { x: 2, y: 0, z: 801.25 },
        ],
        closed: false,
      },
    ]);
    expect(drawing?.skipped).toEqual({ POLYLINE: 1 });
  });

  it('reports binary, malformed and empty files', () => {
    expect(parseDxf(ansi('AutoCAD Binary DXF\r\n\u001a\u0000...')).issues).toEqual([
      { severity: 'error', code: 'BinaryDxf' },
    ]);
    expect(parseDxf('  0\nSECTION\nxx\nHEADER\n').issues).toEqual([
      { severity: 'error', code: 'MalformedDxf', line: 3, detail: 'group code "xx"' },
    ]);
    expect(parseDxf(dxfText({ header: metres })).issues).toEqual([
      { severity: 'error', code: 'NoEntities' },
    ]);
  });

  it('accepts LF line endings', () => {
    const { drawing } = parseDxf(dxfText({ header: metres, entities: [point('b', 1, 2)] }, '\n'));
    expect(drawing?.entities).toHaveLength(1);
  });
});
