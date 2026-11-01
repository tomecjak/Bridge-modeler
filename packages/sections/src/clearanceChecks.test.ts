import { createAlignment, suggestOrigin } from '@bridge/alignment';
import { syntheticAlignmentData } from '@bridge/alignment/testing';
import {
  buildParameterSet,
  levelFoundation,
  type Obstacle,
  type Superstructure,
  type Support,
} from '@bridge/model';
import { describe, expect, it } from 'vitest';
import { checkClearance } from './clearanceChecks.ts';
import { lowestCrossing } from './crossing.ts';
import { evaluateObstacle } from './obstacles.ts';
import { evaluateSuperstructure } from './superstructure.ts';
import { evaluateSupport, type SupportContext } from './supports.ts';
import { singleDeckExample } from './templates/singleBeamHaunched.ts';

const base = syntheticAlignmentData(undefined, 1000);
const example = singleDeckExample(base.name, 1020, 1400, { deck: 'nk', profile: 'pr', axis: 'ax' });
const { alignment } = createAlignment(base, suggestOrigin(base));
const ctx: SupportContext = {
  alignments: new Map([[base.name, alignment]]),
  parameters: buildParameterSet([]),
  bridgeAxes: example.bridgeAxes,
  profiles: [example.profile],
  planLines: [],
  superstructures: [example.superstructures[0] as Superstructure],
  bearingLines: [{ id: 'l1', name: '1', superstructure: 'nk', station: 1100, crossingAngle: '90' }],
};

/** spodok NK v osi na km 1,100 (lokálne z) */
const soffit = () => {
  const s = alignment.stationing.fromDisplay(1100) as number;
  const section = evaluateSuperstructure(ctx, ctx.superstructures[0] as Superstructure, s);
  const outer = section.loops.filter((l) => l.role === 'outer').map((l) => l.polygon);
  return section.toWorld({ x: 0, y: lowestCrossing(outer, 0) as number }).z;
};

const obstacle = (level: number): Obstacle => ({
  id: 'o',
  name: 'Cesta',
  kind: 'road',
  reference: { type: 'station', alignment: base.name, station: 1100, angle: '90' },
  level: { kind: 'constant', value: String(level) },
  clearance: {
    left: '3',
    right: '3',
    height: '4.8',
    slopeLeft: '0',
    slopeRight: '0',
    chamfer: '0',
  },
});

const check = (level: number, supports: Support[] = []) => {
  const r = evaluateObstacle(ctx, obstacle(level));
  return checkClearance(
    ctx,
    r,
    supports.map((s) => evaluateSupport(ctx, s)),
  );
};

describe('checkClearance', () => {
  const z0 = alignment.origin.z;

  it('finds the smallest free height under the deck', () => {
    const level = soffit() + z0 - 6;
    const r = check(level);
    expect(r.issues).toEqual([]);
    expect(r.minimum?.required).toBeCloseTo(4.8, 9);
    // spodok NK klesá s niveletou aj priečnym sklonom → najmenšia voľná výška na okraji pásu (± 3 m po osi cesty)
    expect(r.minimum?.free).toBeLessThan(6);
    expect(r.minimum?.free).toBeGreaterThan(5.5);
    // syntetická os je v oblúku → staničenie okraja pásu sa líši o niečo viac ako 3 m
    expect(Math.abs((r.minimum?.station ?? 0) - 1100)).toBeLessThan(3.1);
  });

  it('reports a clearance violated by a raised obstacle level', () => {
    const r = check(soffit() + z0 - 4.5);
    expect(r.issues).toMatchObject([
      { code: 'ClearanceViolated', required: 4.8, owner: { kind: 'obstacle', name: 'Cesta' } },
    ]);
    expect((r.issues[0] as { actual: number }).actual).toBeLessThan(4.8);
  });

  it('reports a pier standing in the clearance band', () => {
    const pier: Support = {
      id: 'p1',
      name: 'P1',
      kind: 'pier',
      bearingLine: 'l1',
      offset: '0',
      geometry: { type: 'wall', thickness: '1.2', length: '6' },
      footing: { length: '8', width: '4', thickness: '1.2' },
      connection: 'bearing',
      bearingHeight: '0.35',
      bearings: ['-1.8', '1.8'],
      foundation: levelFoundation('240'),
    };
    const r = check(soffit() + z0 - 6, [pier]);
    expect(r.issues).toMatchObject([{ code: 'SupportInClearance', support: 'P1' }]);
  });
});
