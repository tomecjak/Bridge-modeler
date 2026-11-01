import {
  crossbeamBlock,
  deckCrossbeams,
  evaluateBearingLine,
  evaluateSuperstructure,
  type SupportContext,
} from '@bridge/sections';
import { evaluateReference212 } from '@bridge/sections/testing';
import { describe, expect, it } from 'vitest';
import { MeshKernel } from './kernel.ts';
import { meshVolume } from './mesh.ts';
import { superstructureMesh } from './superstructure.ts';

const kernel = new MeshKernel();

describe('priečnik v sieti NK (ADR 0018)', () => {
  it('adds (crossbeam − deck section area) × width to the deck volume, also at a skewed line', () => {
    const { ctx, deck, results } = evaluateReference212();
    const plain = superstructureMesh(kernel, { ctx, superstructure: deck, supports: results });
    const lines = ctx.bearingLines.map((l) =>
      l.id === 'l2' ? { ...l, crossbeam: { profile: 'cb', width: '1.0' } } : l,
    );
    const base: SupportContext = {
      ...ctx,
      profiles: [...ctx.profiles, crossbeamBlock('cb')],
      bearingLines: lines,
    };
    const withCrossbeam: SupportContext = {
      ...base,
      crossbeams: deckCrossbeams(
        base,
        lines.map((l) => evaluateBearingLine(base, l)),
      ),
    };
    const mesh = superstructureMesh(kernel, {
      ctx: withCrossbeam,
      superstructure: deck,
      supports: results,
    });
    expect(mesh.issues).toEqual([]);
    const s2 = 23.81 + 50; // km 9,323 81 na osi od km 9,250
    const block = evaluateSuperstructure(withCrossbeam, deck, s2).area;
    const section = evaluateSuperstructure(ctx, deck, s2).area;
    // šikmé hranice pásu objem nemenia (posunutie rovnobežné s osou uloženia)
    expect(meshVolume(mesh.mesh) - meshVolume(plain.mesh)).toBeCloseTo((block - section) * 1.0, 1);
  });
});
