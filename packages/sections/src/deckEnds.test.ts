import { type AlignmentData, createAlignment } from '@bridge/alignment';
import { vec2 } from '@bridge/geom';
import {
  type BridgeAxis,
  buildParameterSet,
  defaultAbutmentGeometry,
  levelFoundation,
  type ProjectFile,
  type Support,
} from '@bridge/model';
import { describe, expect, it } from 'vitest';
import { bridgeAxisLength } from './axisLength.ts';
import { resolveDeckEnds } from './deckEnds.ts';
import { reference212Project } from './testing/index.ts';

function resolve(p: ProjectFile) {
  const origin = p.crs.origin as NonNullable<ProjectFile['crs']['origin']>;
  const alignments = new Map(
    p.alignments.map((d) => {
      const a = createAlignment(d, origin).alignment;
      return [a.name, a];
    }),
  );
  return resolveDeckEnds({
    superstructures: p.superstructures,
    bearingLines: p.bearingLines,
    supports: p.supports,
    bridgeAxes: p.bridgeAxes,
    alignments,
    parameters: buildParameterSet(p.parameters),
  });
}

/** 212-00 s NK v nesprávnom rozsahu (koniec NK sa má odvodiť z opôr). */
function shifted(): ProjectFile {
  const p = reference212Project();
  return {
    ...p,
    superstructures: p.superstructures.map((d) => ({ ...d, from: 9300, to: 9370 })),
  };
}

describe('resolveDeckEnds', () => {
  it('derives the 212-00 deck from the abutments: bearing line ∓ 0.50 m', () => {
    expect(resolve(shifted())).toEqual([
      { id: 'nk', from: expect.closeTo(9307.31, 9), to: expect.closeTo(9363.31, 9) },
    ]);
    // súhlasný rozsah sa nemení
    expect(resolve(reference212Project())).toEqual([]);
  });

  it('moves the deck start with its abutment', () => {
    const p = reference212Project();
    const moved = {
      ...p,
      bearingLines: p.bearingLines.map((l) => (l.id === 'l1' ? { ...l, station: 9306.81 } : l)),
    };
    expect(resolve(moved)).toEqual([{ id: 'nk', from: expect.closeTo(9306.31, 9), to: 9363.31 }]);
  });

  it('keeps a manual end and an end without an abutment', () => {
    const p = shifted();
    const manual = {
      ...p,
      superstructures: p.superstructures.map((d) => ({
        ...d,
        ends: { start: 'manual' as const, end: 'abutment' as const },
      })),
    };
    expect(resolve(manual)).toEqual([{ id: 'nk', from: 9300, to: expect.closeTo(9363.31, 9) }]);
    const noAbutment = { ...p, supports: p.supports.filter((s) => s.id !== 'p4') };
    expect(resolve(noAbutment)).toEqual([{ id: 'nk', from: expect.closeTo(9307.31, 9), to: 9370 }]);
  });

  it('ends the deck at the rear face of a monolithic wall', () => {
    const p = shifted();
    const monolithic = {
      ...p,
      supports: p.supports.map(
        (s): Support =>
          s.id === 'p4' && s.geometry.type === 'abutment'
            ? {
                ...s,
                geometry: { ...s.geometry, construction: 'monolithic', wallThickness: '1.2' },
              }
            : s,
      ),
    };
    expect(resolve(monolithic)[0]?.to).toBeCloseTo(9362.81 + 0.6, 9);
  });

  it('measures the end offset along a bridge axis offset 7 m into a curve', () => {
    const R = 300;
    const road: AlignmentData = {
      name: 'oblúk',
      staStart: 1000,
      length: 300,
      horizontal: [
        {
          kind: 'arc',
          length: 300,
          start: vec2(0, 0),
          end: vec2(R - R * Math.cos(300 / R), R * Math.sin(300 / R)),
          center: vec2(R, 0),
          radius: R,
          rotation: 'cw',
        },
      ],
      stationEquations: [],
      profiles: [
        {
          name: 'n',
          pvis: [
            { station: 1000, elevation: 300 },
            { station: 1300, elevation: 300 },
          ],
        },
      ],
    };
    const axis: BridgeAxis = {
      id: 'ax',
      name: 'Os mosta',
      alignment: 'oblúk',
      horizontalOffset: { kind: 'constant', value: '7' },
      verticalOffset: { kind: 'constant', value: '0' },
    };
    const abutment = (id: string, line: string): Support => ({
      id,
      name: id,
      kind: 'abutment',
      bearingLine: line,
      offset: '0',
      geometry: defaultAbutmentGeometry('12'),
      footing: { length: '0', width: '0', thickness: '0' },
      connection: 'bearing',
      bearingHeight: '0.35',
      bearings: ['0'],
      foundation: levelFoundation('290'),
    });
    const alignment = createAlignment(road, { x: 0, y: 0, z: 0 }).alignment;
    const parameters = buildParameterSet([]);
    const changes = resolveDeckEnds({
      superstructures: [
        {
          id: 'nk',
          name: 'NK',
          bridgeAxis: 'ax',
          from: 1040,
          to: 1200,
          profile: 'p',
          parameterLaws: {},
          orientation: 'vertical',
        },
      ],
      bearingLines: [
        { id: 'a', name: '1', superstructure: 'nk', station: 1050, crossingAngle: '90' },
        { id: 'b', name: '2', superstructure: 'nk', station: 1150, crossingAngle: '90' },
      ],
      supports: [abutment('o1', 'a'), abutment('o2', 'b')],
      bridgeAxes: [axis],
      alignments: new Map([[alignment.name, alignment]]),
      parameters,
    });
    const measure = bridgeAxisLength(axis, alignment, parameters);
    const s = (station: number) => alignment.stationing.fromDisplay(station) as number;
    const change = changes[0];
    expect(measure.lengthAt(s(1050)) - measure.lengthAt(s(change?.from ?? 0))).toBeCloseTo(0.5, 9);
    expect(measure.lengthAt(s(change?.to ?? 0)) - measure.lengthAt(s(1150))).toBeCloseTo(0.5, 9);
    // po osi cesty je odsadenie dlhšie (os mosta je vnútri oblúka)
    expect(1050 - (change?.from ?? 0)).toBeCloseTo(0.5 / (1 - 7 / R), 6);
  });
});
