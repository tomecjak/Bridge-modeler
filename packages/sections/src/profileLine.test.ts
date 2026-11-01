import { type AlignmentData, createAlignment } from '@bridge/alignment';
import { vec2 } from '@bridge/geom';
import { type BridgeAxis, buildParameterSet } from '@bridge/model';
import { describe, expect, it } from 'vitest';
import { bridgeAxisLength } from './axisLength.ts';
import {
  alignmentProfileLine,
  bridgeAxisProfileLine,
  polylineProfileLine,
  roadProfileLine,
} from './profileLine.ts';

const origin = { x: 0, y: 0, z: 0 };
const R = 300;
/** Oblúk doprava R 300 z (0, 0) na sever, staničenie od km 1,000. */
const arcData: AlignmentData = {
  name: 'cesta',
  staStart: 1000,
  length: 200,
  horizontal: [
    {
      kind: 'arc',
      length: 200,
      start: vec2(0, 0),
      end: vec2(R - R * Math.cos(200 / R), R * Math.sin(200 / R)),
      center: vec2(R, 0),
      radius: R,
      rotation: 'cw',
    },
  ],
  stationEquations: [],
  profiles: [],
};
const road = createAlignment(arcData, origin).alignment;
const axis: BridgeAxis = {
  id: 'ax',
  name: 'Os mosta',
  alignment: 'cesta',
  horizontalOffset: { kind: 'constant', value: '7' },
  verticalOffset: { kind: 'constant', value: '0' },
};
const measure = bridgeAxisLength(axis, road, buildParameterSet([]));

describe('profile lines', () => {
  it('uses the road station as u along the road axis', () => {
    const line = roadProfileLine(road);
    expect(line.uTo).toBeCloseTo(200, 9);
    expect(line.lengthAt(37.5)).toBe(37.5);
    expect(line.labelAlignment).toBe(road);
  });

  it('uses the length along the bridge axis and maps it back to the road station', () => {
    const line = bridgeAxisProfileLine(road, measure);
    expect(line.uTo).toBeCloseTo(200 * (1 - 7 / R), 9);
    const u = line.lengthAt(120) as number;
    expect(u).toBeCloseTo(120 * (1 - 7 / R), 9);
    expect(line.stationAt(u)).toBeCloseTo(120, 9);
    // bod osi mosta leží 7 m od osi cesty, vpravo
    const p = line.pointAt(u);
    expect(road.project(p)?.offset).toBeCloseTo(7, 6);
    expect(road.project(p)?.s).toBeCloseTo(120, 6);
  });

  it('measures a plan line from its first vertex and projects it on the road', () => {
    // tetiva oblúka 3 m vľavo od osi: päta kolmice sa posúva rýchlejšie ako dĺžka po čiare
    const a = road.evaluateHorizontal(20);
    const b = road.evaluateHorizontal(80);
    const left = (r: typeof a) =>
      vec2(r.point.x - 3 * Math.cos(r.azimuth), r.point.y + 3 * Math.sin(r.azimuth));
    const line = polylineProfileLine('planLine', [left(a), left(b)], road);
    expect(line.points[0]?.s).toBeCloseTo(20, 6);
    expect(line.points.at(-1)?.s).toBeCloseTo(80, 6);
    expect(line.uTo).toBeCloseTo(Math.hypot(left(b).x - left(a).x, left(b).y - left(a).y), 9);
    const u = line.lengthAt(50) as number;
    expect(line.stationAt(u)).toBeCloseTo(50, 2);
    expect(line.lengthAt(10)).toBeUndefined();
  });

  it('labels another alignment with its own stationing', () => {
    const other = createAlignment(
      {
        ...arcData,
        name: 'vetva',
        staStart: 0,
        horizontal: [{ kind: 'line', length: 100, start: vec2(-10, 50), end: vec2(-10, 150) }],
        length: 100,
      },
      origin,
    ).alignment;
    const line = alignmentProfileLine(other, road);
    expect(line.labelAlignment).toBe(other);
    expect(line.uTo).toBeCloseTo(100, 9);
    expect(line.points[0]?.s).toBeCloseTo(road.project(vec2(-10, 50))?.s ?? Number.NaN, 9);
  });
});
