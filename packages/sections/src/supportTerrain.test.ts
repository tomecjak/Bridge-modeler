import { createAlignment, suggestOrigin } from '@bridge/alignment';
import { syntheticAlignmentData } from '@bridge/alignment/testing';
import {
  type BearingLine,
  buildParameterSet,
  defaultFoundation,
  type Superstructure,
  type Support,
} from '@bridge/model';
import { describe, expect, it } from 'vitest';
import { evaluateSupport, type SupportContext, supportCenter } from './supports.ts';
import { resolveSupportTerrain } from './supportTerrain.ts';
import { singleDeckExample } from './templates/singleBeamHaunched.ts';

const base = syntheticAlignmentData(undefined, 1000);
const example = singleDeckExample(base.name, 1020, 1400, { deck: 'nk', profile: 'pr', axis: 'ax' });
const origin = { ...suggestOrigin(base), z: 200 };

function context(lines: BearingLine[]): SupportContext {
  const { alignment } = createAlignment(base, origin);
  return {
    alignments: new Map([[base.name, alignment]]),
    parameters: buildParameterSet([]),
    bridgeAxes: example.bridgeAxes,
    profiles: [example.profile],
    planLines: [],
    superstructures: [example.superstructures[0] as Superstructure],
    bearingLines: lines,
  };
}

const line = (id: string, station: number, crossingAngle = '90'): BearingLine => ({
  id,
  name: id,
  superstructure: 'nk',
  station,
  crossingAngle,
});

const pier = (id: string, bearingLine: string, changes: Partial<Support> = {}): Support => ({
  id,
  name: id,
  kind: 'pier',
  bearingLine,
  offset: '0',
  geometry: { type: 'wall', thickness: '1.2', length: '6' },
  footing: { length: '8', width: '4', thickness: '1.2' },
  connection: 'bearing',
  bearingHeight: '0.35',
  bearings: ['-1.8', '1.8'],
  foundation: defaultFoundation('pier', '230'),
  ...changes,
});

/** naklonená rovina terénu v lokálnych súradniciach */
const plane = (x: number, y: number) => 40 + 0.01 * x - 0.02 * y;

describe('supportCenter', () => {
  it('lies on the bearing line, offset perpendicular to the bridge axis', () => {
    const ctx = context([line('l1', 1060, '70')]);
    const s = pier('p1', 'l1', { offset: '2' });
    const r = evaluateSupport(ctx, s);
    expect(r.center).toEqual(supportCenter(r.line as NonNullable<typeof r.line>, 2));
    const n = r.axis?.frame.normal ?? { x: 0, y: 0 };
    const p = r.axis?.point ?? { x: 0, y: 0 };
    expect((r.center.x - p.x) * n.x + (r.center.y - p.y) * n.y).toBeCloseTo(2, 9);
  });
});

describe('resolveSupportTerrain', () => {
  it('samples the terrain in the support centre in metres above sea level, to the millimetre', () => {
    const lines = [line('l1', 1060, '70'), line('l2', 1100)];
    const supports = [pier('p1', 'l1', { offset: '2' }), pier('p2', 'l2')];
    const ctx = context(lines);
    const changes = resolveSupportTerrain({ ...ctx, supports, terrainAt: plane, z0: 200 });
    const centre = (s: Support) => evaluateSupport(ctx, s).center;
    expect(changes).toEqual(
      supports.map((s) => ({
        id: s.id,
        terrain: Math.round((plane(centre(s).x, centre(s).y) + 200) * 1000) / 1000,
      })),
    );
  });

  it('keeps a terrain value that agrees to the millimetre', () => {
    const lines = [line('l1', 1060)];
    const ctx = context(lines);
    const first = resolveSupportTerrain({
      ...ctx,
      supports: [pier('p1', 'l1')],
      terrainAt: plane,
      z0: 200,
    });
    const stored = pier('p1', 'l1', {
      foundation: { ...defaultFoundation('pier', '230'), terrain: first[0]?.terrain },
    });
    expect(
      resolveSupportTerrain({ ...ctx, supports: [stored], terrainAt: plane, z0: 200 }),
    ).toEqual([]);
  });

  it('removes the terrain of a support outside the surface and skips supports it cannot place', () => {
    const lines = [line('l1', 1060)];
    const ctx = context(lines);
    const outside = () => undefined;
    const stored = pier('p1', 'l1', {
      foundation: { ...defaultFoundation('pier', '230'), terrain: 241.5 },
    });
    expect(
      resolveSupportTerrain({ ...ctx, supports: [stored], terrainAt: outside, z0: 200 }),
    ).toEqual([{ id: 'p1', terrain: undefined }]);
    expect(
      resolveSupportTerrain({ ...ctx, supports: [pier('p1', 'l1')], terrainAt: outside, z0: 200 }),
    ).toEqual([]);
    // os neexistuje alebo posun je neplatný výraz → terén sa nemení
    expect(
      resolveSupportTerrain({
        ...ctx,
        supports: [pier('p2', 'chyba'), pier('p3', 'l1', { offset: 'x +' })],
        terrainAt: plane,
        z0: 200,
      }),
    ).toEqual([]);
  });
});
