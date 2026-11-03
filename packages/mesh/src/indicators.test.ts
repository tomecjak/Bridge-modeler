/**
 * Objemy ukazovateľov (ADR 0024) proti sieti: ∫A·dL NK a objem podpier ± 0,5 % voči objemu telies.
 */
import type { Superstructure } from '@bridge/model';
import {
  BEARING_PLAN_SIZE,
  bridgeAxisLength,
  crossbeamBlock,
  deckCrossbeams,
  evaluateBearingLine,
  evaluateSupport,
  type SupportContext,
  sampleSuperstructure,
  segmentVolume,
  supportVolume,
} from '@bridge/sections';
import { evaluateReference212 } from '@bridge/sections/testing';
import { describe, expect, it } from 'vitest';
import { MeshKernel } from './kernel.ts';
import { meshVolume } from './mesh.ts';
import { superstructureMesh } from './superstructure.ts';
import { supportMesh } from './supports.ts';

const kernel = new MeshKernel();
const { p, ctx, deck, results, alignment } = evaluateReference212();

/** ∫A·dL NK cez úseky vzoriek a objem jej siete. */
function volumes(c: SupportContext, sup: Superstructure, supports = results) {
  const axis = c.bridgeAxes[0] as (typeof c.bridgeAxes)[number];
  const measure = bridgeAxisLength(axis, alignment, c.parameters).lengthAt;
  const samples = sampleSuperstructure(c, sup, supports);
  if (!('sections' in samples)) throw new Error('NK sa nevzorkovala');
  const integral = samples.segments.reduce(
    (sum, seg) => sum + segmentVolume(seg, measure, sup.orientation),
    0,
  );
  const mesh = meshVolume(
    superstructureMesh(kernel, { ctx: c, superstructure: sup, supports }).mesh,
  );
  return { integral, mesh };
}

const close = (a: number, b: number) => expect(Math.abs(a / b - 1)).toBeLessThan(0.005);

describe('indicator volumes against the mesh (ADR 0024)', () => {
  it('matches the deck mesh of 212-00', () => {
    const v = volumes(ctx, deck);
    close(v.integral, v.mesh);
  });

  it('matches an off-centre deck with one skew and one square end', () => {
    // NK 6 + 10 m (ťažisko mimo osi), koncová os kolmá
    const sup: Superstructure = {
      ...deck,
      parameterLaws: {
        ...deck.parameterLaws,
        bL: { kind: 'constant', value: '6' },
        bR: { kind: 'constant', value: '10' },
      },
    };
    const lines = ctx.bearingLines.map((l) => (l.id === 'l4' ? { ...l, crossingAngle: '90' } : l));
    const c: SupportContext = { ...ctx, superstructures: [sup], bearingLines: lines };
    const supports = p.supports.map((s) => evaluateSupport(c, s));
    const v = volumes(c, sup, supports);
    close(v.integral, v.mesh);
  });

  it('matches the deck mesh with a crossbeam band', () => {
    const lines = ctx.bearingLines.map((l) =>
      l.id === 'l2' ? { ...l, crossbeam: { profile: 'cb', width: '1.0' } } : l,
    );
    const base: SupportContext = {
      ...ctx,
      profiles: [...ctx.profiles, crossbeamBlock('cb')],
      bearingLines: lines,
    };
    const c: SupportContext = {
      ...base,
      crossbeams: deckCrossbeams(
        base,
        lines.map((l) => evaluateBearingLine(base, l)),
      ),
    };
    const v = volumes(c, deck);
    close(v.integral, v.mesh);
  });

  it('matches the support meshes without the bearings', () => {
    for (const r of results) {
      const bearings = r.bearings.reduce(
        (sum, b) => sum + Math.max(0, b.soffit - b.seat) * BEARING_PLAN_SIZE ** 2,
        0,
      );
      close(supportVolume(r), meshVolume(supportMesh(kernel, r)) - bearings);
    }
  });
});
