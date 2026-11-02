import type { CurveRef, Survey } from '@bridge/model';
import { describe, expect, it } from 'vitest';
import { curveFromKey, curveKey, surveyLineOptions } from './curves.ts';

describe('curve keys', () => {
  it('round-trips alignments, plan lines and survey lines', () => {
    const refs: CurveRef[] = [
      { type: 'alignment', name: 'Vetva: A' },
      { type: 'planLine', id: 'line-1' },
      { type: 'survey', survey: 'survey-1', line: 'L12' },
    ];
    for (const ref of refs) expect(curveFromKey(curveKey(ref))).toEqual(ref);
    expect(curveFromKey('station')).toBeUndefined();
    expect(curveFromKey('survey:bez-ciary')).toBeUndefined();
  });

  it('names survey lines by survey, layer and order on the layer', () => {
    const s: Survey = {
      id: 'm',
      name: 'Priepust',
      file: 'p.dxf',
      layers: { points: [], heights: [], numbers: [], codes: [], lines: [] },
      points: [],
      lines: [
        { id: 'L1', layer: 'asfalt', points: [], closed: false },
        { id: 'L2', layer: 'kamen', points: [], closed: false },
        { id: 'L3', layer: 'asfalt', points: [], closed: false },
      ],
    };
    expect(surveyLineOptions([s])).toEqual([
      { value: 'survey:m/L1', label: 'Priepust: asfalt 1' },
      { value: 'survey:m/L2', label: 'Priepust: kamen 1' },
      { value: 'survey:m/L3', label: 'Priepust: asfalt 2' },
    ]);
  });
});
