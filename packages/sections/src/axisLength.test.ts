import { type AlignmentData, createAlignment } from '@bridge/alignment';
import { syntheticAlignmentData } from '@bridge/alignment/testing';
import { vec2 } from '@bridge/geom';
import { type BridgeAxis, buildParameterSet, type StationFunction } from '@bridge/model';
import { describe, expect, it } from 'vitest';
import { bridgeAxisLength } from './axisLength.ts';
import { bridgeAxisPlan } from './longitudinal.ts';

const origin = { x: 0, y: 0, z: 0 };
const parameters = buildParameterSet([]);
const build = (data: AlignmentData) => createAlignment(data, origin).alignment;

const straight: AlignmentData = {
  name: 'priamka',
  staStart: 0,
  length: 200,
  horizontal: [{ kind: 'line', length: 200, start: vec2(0, 0), end: vec2(0, 200) }],
  stationEquations: [],
  profiles: [],
};

/** Oblúk R z bodu (0, 0) na sever: doprava (stred vpravo) alebo doľava. */
function arc(R: number, length: number, rotation: 'cw' | 'ccw'): AlignmentData {
  const k = rotation === 'cw' ? 1 : -1;
  const a = length / R;
  return {
    name: `oblúk ${rotation}`,
    staStart: 0,
    length,
    horizontal: [
      {
        kind: 'arc',
        length,
        start: vec2(0, 0),
        end: vec2(k * (R - R * Math.cos(a)), R * Math.sin(a)),
        center: vec2(k * R, 0),
        radius: R,
        rotation,
      },
    ],
    stationEquations: [],
    profiles: [],
  };
}

const axisWith = (horizontalOffset: StationFunction, alignment = 'cesta'): BridgeAxis => ({
  id: 'ax',
  name: 'Os mosta',
  alignment,
  horizontalOffset,
  verticalOffset: { kind: 'constant', value: '0' },
});
const constant = (value: string): StationFunction => ({ kind: 'constant', value });

describe('bridgeAxisLength', () => {
  it('equals the station difference on a straight road with a constant offset', () => {
    const m = bridgeAxisLength(axisWith(constant('3')), build(straight), parameters);
    expect(m.lengthAt(150) - m.lengthAt(50)).toBeCloseTo(100, 9);
    expect(m.total).toBeCloseTo(200, 9);
  });

  it('shortens an axis offset to the inside of a right curve and lengthens it outside a left curve', () => {
    const R = 300;
    const h = 7;
    const right = bridgeAxisLength(
      axisWith(constant(String(h))),
      build(arc(R, 200, 'cw')),
      parameters,
    );
    const left = bridgeAxisLength(
      axisWith(constant(String(h))),
      build(arc(R, 200, 'ccw')),
      parameters,
    );
    expect(right.lengthAt(180) - right.lengthAt(20)).toBeCloseTo(160 * (1 - h / R), 9);
    expect(left.lengthAt(180) - left.lengthAt(20)).toBeCloseTo(160 * (1 + h / R), 9);
  });

  it('includes the change of offset along the road', () => {
    const law: StationFunction = {
      kind: 'piecewise',
      segments: [{ from: 0, to: 200, v0: '0', v1: '10', shape: 'linear' }],
    };
    const m = bridgeAxisLength(axisWith(law), build(straight), parameters);
    expect(m.lengthAt(200) - m.lengthAt(0)).toBeCloseTo(200 * Math.sqrt(1 + 0.05 ** 2), 9);
  });

  it('holds the offset at its end value outside the range of the offset law', () => {
    const law: StationFunction = {
      kind: 'piecewise',
      segments: [{ from: 50, to: 150, v0: '7', v1: '7', shape: 'linear' }],
    };
    const m = bridgeAxisLength(axisWith(law), build(arc(300, 200, 'cw')), parameters);
    expect(m.lengthAt(50)).toBeCloseTo(50 * (1 - 7 / 300), 9);
    expect(m.total).toBeCloseTo(200 * (1 - 7 / 300), 9);
  });

  it('matches the length of the densely sampled bridge axis on spirals with a variable offset', () => {
    const road = build(syntheticAlignmentData());
    // posun sa mení po parabole a priamke cez prechodnice, oblúky aj inflexiu
    const law: StationFunction = {
      kind: 'piecewise',
      segments: [
        { from: 0, to: 120, v0: '2', v1: '6', shape: 'parabolic', vertexAt: 'end' },
        { from: 120, to: road.length, v0: '6', v1: '-3', shape: 'linear' },
      ],
    };
    const axis = axisWith(law);
    const m = bridgeAxisLength(axis, road, parameters);
    const line = bridgeAxisPlan(axis, road, parameters, 30, 400, 0.02);
    let chord = 0;
    for (let i = 1; i < line.length; i++) {
      const p = line[i - 1]?.point ?? vec2(0, 0);
      const q = line[i]?.point ?? vec2(0, 0);
      chord += Math.hypot(q.x - p.x, q.y - p.y);
    }
    expect(Math.abs(m.lengthAt(400) - m.lengthAt(30) - chord)).toBeLessThan(1e-6);
  });

  it('converts a length along the bridge axis back to the road station', () => {
    const road = build(syntheticAlignmentData());
    const axis = axisWith({ kind: 'expression', expr: '4 + sin(sta)' });
    const m = bridgeAxisLength(axis, road, parameters);
    for (const s of [0, 0.03, 49.99, 50, 137.2, 250, road.length]) {
      expect(Math.abs(m.stationAt(m.lengthAt(s)) - s)).toBeLessThan(1e-9);
    }
  });
});
