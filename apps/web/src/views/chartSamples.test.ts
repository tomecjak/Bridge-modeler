import { buildParameterSet, type Parameter } from '@bridge/model';
import { describe, expect, it } from 'vitest';
import { chartRange, sampleParameter } from './chartSamples.ts';

const h: Parameter = {
  id: 'h',
  name: 'h',
  unit: 'length',
  law: {
    kind: 'piecewise',
    segments: [
      { from: 100, to: 110, v0: '1.6', v1: '1', shape: 'parabolic', vertexAt: 'end' },
      { from: 110, to: 150, v0: '1', v1: '1', shape: 'linear' },
    ],
  },
};

describe('chart samples', () => {
  it('uses the segment range for piecewise functions', () => {
    expect(chartRange(h, { from: 0, to: 500 }, 0)).toEqual({ from: 100, to: 150 });
    expect(
      chartRange({ ...h, law: { kind: 'constant', value: '1' } }, { from: 0, to: 500 }, 0),
    ).toEqual({
      from: 0,
      to: 500,
    });
  });

  it('samples in display units including segment boundaries', () => {
    const samples = sampleParameter(buildParameterSet([h]), h, { from: 100, to: 150 }, 10);
    expect(samples[0]).toEqual({ sta: 100, value: 1600 });
    expect(samples.some((s) => s.sta === 110 && Math.abs((s.value ?? 0) - 1000) < 1e-9)).toBe(true);
  });

  it('leaves gaps where the function is undefined', () => {
    const samples = sampleParameter(buildParameterSet([h]), h, { from: 90, to: 150 }, 6);
    expect(samples[0]).toEqual({ sta: 90, value: undefined });
  });
});
