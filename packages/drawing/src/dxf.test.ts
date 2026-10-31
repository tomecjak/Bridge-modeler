import { describe, expect, it } from 'vitest';
import { toDxf } from './dxf.ts';
import { type Drawing, translate } from './model.ts';

const drawing: Drawing = {
  scale: 200,
  entities: [
    {
      kind: 'polyline',
      layer: 'deck',
      points: [
        { x: 0, y: 0 },
        { x: 56, y: 0 },
        { x: 56, y: 1.2 },
      ],
      closed: true,
      owner: 'nk',
    },
    {
      kind: 'polyline',
      layer: 'roadAxis',
      points: [
        { x: -5, y: 0.5 },
        { x: 60, y: 0.5 },
      ],
      closed: false,
    },
    {
      kind: 'text',
      layer: 'label',
      at: { x: 10, y: 3 },
      text: 'Opora č. 1 – ľavá',
      height: 0.5,
      rotation: Math.PI / 2,
      align: 'center',
    },
  ],
};

/** Dvojice (kód, hodnota) zo súboru DXF. */
function pairs(dxf: string): [number, string][] {
  const lines = dxf.split('\n');
  const out: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    out.push([Number(lines[i]), lines[i + 1] as string]);
  }
  return out;
}

const valueAfter = (p: [number, string][], name: string, code: number) => {
  const i = p.findIndex(([c, v]) => c === 9 && v === name);
  return p.slice(i + 1).find(([c]) => c === code)?.[1];
};

describe('toDxf', () => {
  const dxf = toDxf(drawing);
  const p = pairs(dxf);

  it('writes the R2000 section structure ending with EOF', () => {
    const sections = p.filter(([c], i) => c === 2 && p[i - 1]?.[1] === 'SECTION').map(([, v]) => v);
    expect(sections).toEqual(['HEADER', 'CLASSES', 'TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS']);
    expect(p.at(-1)).toEqual([0, 'EOF']);
    expect(valueAfter(p, '$ACADVER', 1)).toBe('AC1015');
    expect(valueAfter(p, '$INSUNITS', 70)).toBe('6');
    const tables = p.filter(([c], i) => c === 2 && p[i - 1]?.[1] === 'TABLE').map(([, v]) => v);
    expect(tables).toEqual([
      'VPORT',
      'LTYPE',
      'LAYER',
      'STYLE',
      'VIEW',
      'UCS',
      'APPID',
      'DIMSTYLE',
      'BLOCK_RECORD',
    ]);
  });

  it('assigns unique handles below $HANDSEED and points owners at existing handles', () => {
    const handles = p.filter(([c]) => c === 5 || c === 105).map(([, v]) => v);
    expect(new Set(handles).size).toBe(handles.length);
    const seed = Number.parseInt(valueAfter(p, '$HANDSEED', 5) ?? '0', 16);
    for (const hd of handles.slice(1)) expect(Number.parseInt(hd, 16)).toBeLessThan(seed);
    const owners = p.filter(([c]) => c === 330 || c === 350 || c === 340).map(([, v]) => v);
    for (const o of owners) expect(o === '0' || handles.includes(o)).toBe(true);
  });

  it('defines only the used layers with their colour and linetype', () => {
    const names = p.filter(([c], i) => c === 2 && p[i - 5]?.[1] === 'LAYER').map(([, v]) => v);
    expect(names).toEqual(['0', 'OS_CESTY', 'NK', 'POPIS']);
    const ltypes = p.filter(([c], i) => c === 2 && p[i - 5]?.[1] === 'LTYPE').map(([, v]) => v);
    expect(ltypes).toEqual(['ByBlock', 'ByLayer', 'Continuous', 'CENTER']);
    // CENTER 12 – 3 – 3 – 3 mm v mierke 1 : 200
    const i = p.findIndex(([c, v]) => c === 2 && v === 'CENTER');
    expect(
      p
        .slice(i)
        .filter(([c]) => c === 49)
        .map(([, v]) => v),
    ).toEqual(['2.4', '-0.6', '0.6', '-0.6']);
  });

  it('writes polylines and justified, rotated texts with escaped diacritics', () => {
    const ents = p.slice(p.findIndex(([c, v]) => c === 2 && v === 'ENTITIES'));
    expect(ents.filter(([c, v]) => c === 0 && v === 'LWPOLYLINE')).toHaveLength(2);
    expect(dxf).toContain('Opora \\U+010D. 1 \\U+2013 \\U+013Eav\\U+00E1');
    expect([...dxf].every((ch) => ch.charCodeAt(0) < 128)).toBe(true);
    const t = ents.findIndex(([, v]) => v === 'TEXT');
    const text = ents.slice(t, t + 30);
    expect(text).toContainEqual([50, '90.0']);
    expect(text).toContainEqual([72, '1']);
    expect(text).toContainEqual([11, '10.0']);
  });

  it('writes S-JTSK coordinates after translation and is deterministic', () => {
    const moved = toDxf(translate(drawing, -512300, -1187600));
    expect(moved).toContain('\n-512244.0\n');
    expect(moved).toContain('\n-1187598.8\n');
    expect(toDxf(drawing)).toBe(dxf);
  });
});
