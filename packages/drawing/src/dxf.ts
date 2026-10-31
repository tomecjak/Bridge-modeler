import { LAYER_ORDER, LAYERS, type LayerId, LINETYPE_PATTERN } from './layers.ts';
import { type Drawing, drawingBounds, type Entity } from './model.ts';

/**
 * Výkres ako ASCII DXF R2000 (AC1015, ADR 0012): jednotky metre (`$INSUNITS` = 6), tabuľky typov čiar, hladín
 * a štýlu písma, entity LWPOLYLINE a TEXT v modelovom priestore. Handle sú pridelené postupne, výstup je
 * deterministický; znaky mimo ASCII sa zapíšu ako `\U+XXXX`. Vzory čiar sú v metroch pre mierku výkresu.
 */
export function toDxf(drawing: Drawing): string {
  const out: string[] = [];
  const put = (code: number, value: string | number) => {
    out.push(String(code).padStart(3, ' '), typeof value === 'number' ? real(value) : value);
  };
  const int = (code: number, value: number) => put(code, String(Math.trunc(value)));
  let next = 1;
  const handle = () => (next++).toString(16).toUpperCase();

  const used = new Set(drawing.entities.map((e) => e.layer));
  const layers = LAYER_ORDER.filter((id) => used.has(id));
  const linetypes = [...new Set(layers.map((id) => LAYERS[id].linetype))].filter(
    (lt) => lt !== 'CONTINUOUS',
  );
  const scale = drawing.scale;
  const b = drawingBounds(drawing) ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };

  // handle sa prideľujú vopred, aby hlavička mohla uviesť $HANDSEED a odkazy smerovali dopredu
  const h = {
    vportTable: handle(),
    vport: handle(),
    ltypeTable: handle(),
    ltypes: ['ByBlock', 'ByLayer', 'Continuous', ...linetypes].map(handle),
    layerTable: handle(),
    layers: ['0', ...layers].map(handle),
    styleTable: handle(),
    style: handle(),
    viewTable: handle(),
    ucsTable: handle(),
    appidTable: handle(),
    appid: handle(),
    dimstyleTable: handle(),
    dimstyle: handle(),
    blockRecordTable: handle(),
    modelRecord: handle(),
    paperRecord: handle(),
    modelBlock: handle(),
    modelEnd: handle(),
    paperBlock: handle(),
    paperEnd: handle(),
    entities: drawing.entities.map(handle),
    rootDict: handle(),
    groupDict: handle(),
  };

  put(0, 'SECTION');
  put(2, 'HEADER');
  put(9, '$ACADVER');
  put(1, 'AC1015');
  put(9, '$DWGCODEPAGE');
  put(3, 'ANSI_1250');
  put(9, '$INSBASE');
  point(put, 10, { x: 0, y: 0 });
  put(9, '$EXTMIN');
  point(put, 10, { x: b.minX, y: b.minY });
  put(9, '$EXTMAX');
  point(put, 10, { x: b.maxX, y: b.maxY });
  put(9, '$LTSCALE');
  put(40, 1);
  put(9, '$INSUNITS');
  int(70, 6);
  put(9, '$MEASUREMENT');
  int(70, 1);
  put(9, '$HANDSEED');
  put(5, handle());
  put(0, 'ENDSEC');

  put(0, 'SECTION');
  put(2, 'CLASSES');
  put(0, 'ENDSEC');

  put(0, 'SECTION');
  put(2, 'TABLES');
  const table = (name: string, own: string, count: number, extra?: () => void) => {
    put(0, 'TABLE');
    put(2, name);
    put(5, own);
    put(330, '0');
    put(100, 'AcDbSymbolTable');
    int(70, count);
    extra?.();
  };
  const record = (type: string, own: string, owner: string, subclass: string, name: string) => {
    put(0, type);
    put(type === 'DIMSTYLE' ? 105 : 5, own);
    put(330, owner);
    put(100, 'AcDbSymbolTableRecord');
    put(100, subclass);
    put(2, name);
    int(70, 0);
  };

  // počiatočný pohľad: celý výkres
  table('VPORT', h.vportTable, 1);
  record('VPORT', h.vport, h.vportTable, 'AcDbViewportTableRecord', '*Active');
  point(put, 10, { x: 0, y: 0 }, false);
  point(put, 11, { x: 1, y: 1 }, false);
  point(put, 12, { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }, false);
  point(put, 13, { x: 0, y: 0 }, false);
  point(put, 14, { x: 1, y: 1 }, false);
  point(put, 15, { x: 1, y: 1 }, false);
  point(put, 16, { x: 0, y: 0 });
  put(36, 1);
  point(put, 17, { x: 0, y: 0 });
  put(37, 0);
  put(40, Math.max(1, (b.maxY - b.minY) * 1.1, ((b.maxX - b.minX) * 1.1) / 1.6));
  put(41, 1.6);
  put(42, 50);
  put(43, 0);
  put(44, 0);
  put(50, 0);
  put(51, 0);
  for (const [code, v] of [
    [71, 0],
    [72, 1000],
    [73, 1],
    [74, 3],
    [75, 0],
    [76, 0],
    [77, 0],
    [78, 0],
  ] as const) {
    int(code, v);
  }
  put(0, 'ENDTAB');

  const ltypeNames = ['ByBlock', 'ByLayer', 'Continuous', ...linetypes];
  table('LTYPE', h.ltypeTable, ltypeNames.length);
  ltypeNames.forEach((name, i) => {
    record('LTYPE', h.ltypes[i] as string, h.ltypeTable, 'AcDbLinetypeTableRecord', name);
    const pattern = i < 3 ? [] : LINETYPE_PATTERN[name as keyof typeof LINETYPE_PATTERN];
    const dashes = pattern.map((v, k) => ((k % 2 === 0 ? 1 : -1) * v * scale) / 1000);
    put(3, i < 3 ? '' : name === 'DASHED' ? 'Dashed __ __ __' : 'Center ____ _ ____');
    int(72, 65);
    int(73, dashes.length);
    put(
      40,
      dashes.reduce((sum, d) => sum + Math.abs(d), 0),
    );
    for (const d of dashes) {
      put(49, d);
      int(74, 0);
    }
  });
  put(0, 'ENDTAB');

  table('LAYER', h.layerTable, layers.length + 1);
  const layerRecord = (own: string, name: string, color: number, linetype: string) => {
    record('LAYER', own, h.layerTable, 'AcDbLayerTableRecord', name);
    int(62, color);
    put(6, linetype);
    int(370, -3);
  };
  layerRecord(h.layers[0] as string, '0', 7, 'Continuous');
  layers.forEach((id: LayerId, i) => {
    const l = LAYERS[id];
    layerRecord(
      h.layers[i + 1] as string,
      l.name,
      l.color,
      l.linetype === 'CONTINUOUS' ? 'Continuous' : l.linetype,
    );
  });
  put(0, 'ENDTAB');

  table('STYLE', h.styleTable, 1);
  record('STYLE', h.style, h.styleTable, 'AcDbTextStyleTableRecord', 'Standard');
  put(40, 0);
  put(41, 1);
  put(50, 0);
  int(71, 0);
  put(42, 2.5);
  put(3, 'arial.ttf');
  put(4, '');
  put(0, 'ENDTAB');

  table('VIEW', h.viewTable, 0);
  put(0, 'ENDTAB');
  table('UCS', h.ucsTable, 0);
  put(0, 'ENDTAB');

  table('APPID', h.appidTable, 1);
  record('APPID', h.appid, h.appidTable, 'AcDbRegAppTableRecord', 'ACAD');
  put(0, 'ENDTAB');

  table('DIMSTYLE', h.dimstyleTable, 1, () => {
    put(100, 'AcDbDimStyleTable');
    int(71, 1);
    put(340, h.dimstyle);
  });
  record('DIMSTYLE', h.dimstyle, h.dimstyleTable, 'AcDbDimStyleTableRecord', 'Standard');
  put(0, 'ENDTAB');

  table('BLOCK_RECORD', h.blockRecordTable, 2);
  for (const [own, name] of [
    [h.modelRecord, '*Model_Space'],
    [h.paperRecord, '*Paper_Space'],
  ] as const) {
    put(0, 'BLOCK_RECORD');
    put(5, own);
    put(330, h.blockRecordTable);
    put(100, 'AcDbSymbolTableRecord');
    put(100, 'AcDbBlockTableRecord');
    put(2, name);
  }
  put(0, 'ENDTAB');
  put(0, 'ENDSEC');

  put(0, 'SECTION');
  put(2, 'BLOCKS');
  for (const [begin, end, owner, name, paper] of [
    [h.modelBlock, h.modelEnd, h.modelRecord, '*Model_Space', false],
    [h.paperBlock, h.paperEnd, h.paperRecord, '*Paper_Space', true],
  ] as const) {
    put(0, 'BLOCK');
    put(5, begin);
    put(330, owner);
    put(100, 'AcDbEntity');
    if (paper) int(67, 1);
    put(8, '0');
    put(100, 'AcDbBlockBegin');
    put(2, name);
    int(70, 0);
    point(put, 10, { x: 0, y: 0 });
    put(3, name);
    put(1, '');
    put(0, 'ENDBLK');
    put(5, end);
    put(330, owner);
    put(100, 'AcDbEntity');
    if (paper) int(67, 1);
    put(8, '0');
    put(100, 'AcDbBlockEnd');
  }
  put(0, 'ENDSEC');

  put(0, 'SECTION');
  put(2, 'ENTITIES');
  drawing.entities.forEach((e: Entity, i) => {
    put(0, e.kind === 'polyline' ? 'LWPOLYLINE' : 'TEXT');
    put(5, h.entities[i] as string);
    put(330, h.modelRecord);
    put(100, 'AcDbEntity');
    put(8, LAYERS[e.layer].name);
    if (e.kind === 'polyline') {
      put(100, 'AcDbPolyline');
      int(90, e.points.length);
      int(70, e.closed ? 1 : 0);
      put(43, 0);
      for (const p of e.points) point(put, 10, p, false);
      return;
    }
    const justify = { left: 0, center: 1, right: 2 }[e.align];
    put(100, 'AcDbText');
    point(put, 10, e.at);
    put(40, e.height);
    put(1, encodeText(e.text));
    put(50, (e.rotation * 180) / Math.PI);
    put(7, 'Standard');
    if (justify !== 0) {
      int(72, justify);
      point(put, 11, e.at);
    }
    put(100, 'AcDbText');
    int(73, 0);
  });
  put(0, 'ENDSEC');

  put(0, 'SECTION');
  put(2, 'OBJECTS');
  put(0, 'DICTIONARY');
  put(5, h.rootDict);
  put(330, '0');
  put(100, 'AcDbDictionary');
  int(281, 1);
  put(3, 'ACAD_GROUP');
  put(350, h.groupDict);
  put(0, 'DICTIONARY');
  put(5, h.groupDict);
  put(330, h.rootDict);
  put(100, 'AcDbDictionary');
  int(281, 1);
  put(0, 'ENDSEC');
  put(0, 'EOF');
  return `${out.join('\n')}\n`;
}

/** Bod do skupín `code`, `code + 10` (a `code + 20` = 0, ak `z`). */
function point(
  put: (code: number, value: number) => void,
  code: number,
  p: { x: number; y: number },
  z = true,
) {
  put(code, p.x);
  put(code + 10, p.y);
  if (z) put(code + 20, 0);
}

/** Reálne číslo na 1e-6 vždy s desatinnou bodkou (bez exponentu pre bežné rozmery). */
function real(v: number): string {
  const r = Math.round(v * 1e6) / 1e6;
  const s = String(r === 0 ? 0 : r);
  return s.includes('.') || s.includes('e') ? s : `${s}.0`;
}

/** Text DXF: znaky mimo ASCII ako `\U+XXXX`, riadiace znaky sa vynechajú. */
function encodeText(text: string): string {
  let out = '';
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 32) continue;
    out +=
      c < 128 ? ch : c <= 0xffff ? `\\U+${c.toString(16).toUpperCase().padStart(4, '0')}` : '?';
  }
  return out;
}
