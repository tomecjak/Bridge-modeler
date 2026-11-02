/**
 * Golden test na vzorke meračky `fixtures/inbox/Meracka skutocneho stavu.dxf` (klenbový priepust, AC1018,
 * ANSI_1250; rozbor v PLAN.md → Zistené z podkladov). Podklad sa neverzuje — bez neho sa test preskočí.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractSurvey, parseDxf, SURVEY_TOLERANCES, suggestSurveyLayers } from '../src/index.ts';

const file = resolve(import.meta.dirname, '../../../fixtures/inbox/Meracka skutocneho stavu.dxf');
const available = existsSync(file);

describe.skipIf(!available)('survey sample of an existing culvert', () => {
  const { drawing, issues } = available
    ? parseDxf(new Uint8Array(readFileSync(file)))
    : { drawing: undefined, issues: [] };

  it('reads the header, layers and entities', () => {
    expect(issues).toEqual([]);
    expect(drawing?.version).toBe('AC1018');
    expect(drawing?.encoding).toBe('windows-1250');
    expect(drawing?.unitScale).toBe(1);
    expect(drawing?.layers.find((l) => l.name === 'Skryté výšky od výkresu')).toEqual({
      name: 'Skryté výšky od výkresu',
      color: 7,
      hidden: true,
    });
    const kinds: Record<string, number> = {};
    for (const e of drawing?.entities ?? []) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
    expect(kinds).toEqual({ point: 153, text: 459, line: 41, insert: 23 });
    expect(drawing?.skipped).toEqual({ ELLIPSE: 8 });
  });

  it('suggests the survey layers', () => {
    if (!drawing) throw new Error('DXF sa nenačítal');
    expect(suggestSurveyLayers(drawing, SURVEY_TOLERANCES)).toEqual({
      points: ['Vrstva 23', 'Skryté výšky od výkresu'],
      heights: ['Vrstva 5', 'Skryté výšky od výkresu'],
      numbers: ['Vrstva 4'],
      codes: ['Vrstva 23'],
      lines: ['Vrstva 1', 'asfalt', 'priepust', 'klenba', 'rimsa', 'kocky', 'kamen', 'murik'],
    });
  });

  it('gives all 153 points a height, number and code, including heights on the hidden layer', () => {
    if (!drawing) throw new Error('DXF sa nenačítal');
    const s = extractSurvey(
      drawing,
      suggestSurveyLayers(drawing, SURVEY_TOLERANCES),
      SURVEY_TOLERANCES,
    );
    expect(s.issues).toEqual([]);
    expect(s.points).toHaveLength(153);
    expect(s.points.every((p) => p.z !== undefined && p.number && p.code)).toBe(true);
    expect(new Set(s.points.map((p) => p.number)).size).toBe(153);
    const z = s.points.map((p) => p.z as number);
    expect(Math.min(...z)).toBe(800.97);
    expect(Math.max(...z)).toBe(813.36);
    expect(s.points[0]).toEqual({
      x: -302796.712,
      y: -1199001.555,
      z: 804.52,
      number: '1',
      code: 'te',
      layer: 'Vrstva 23',
    });
    // body 148 a 149 majú výšky len na skrytej hladine
    expect(
      s.points.filter((p) => p.number === '148' || p.number === '149').map((p) => p.z),
    ).toEqual([802.26, 802.13]);
    expect(s.lines).toHaveLength(41);
  });
});
