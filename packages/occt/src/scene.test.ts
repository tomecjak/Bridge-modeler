/**
 * Presná scéna (Fáza 8c) na referenčnom moste 212-00: objemy proti sieti, koncová plocha NK v rovine opory,
 * zjednotená opora, STEP celej scény.
 */
import { buildScene, createSceneCache, meshVolume } from '@bridge/mesh';
import { type DeckSamples, sampleSuperstructure } from '@bridge/sections';
import { evaluateReference212, reference212Project } from '@bridge/sections/testing';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { OcctGeometryKernel } from './kernel.ts';
import { type ExactObject, exactScene, exactSceneStep } from './scene.ts';

const project = reference212Project();
let kernel: OcctGeometryKernel;
let objects: ExactObject[];
let elapsed = 0;
beforeAll(async () => {
  kernel = await OcctGeometryKernel.create();
  const t0 = Date.now();
  objects = exactScene(project, kernel);
  elapsed = Date.now() - t0;
});
const meshScene = buildScene(project, createSceneCache());
const meshOf = (id: string) => meshScene.objects.find((o) => o.id === id)?.mesh;

describe('exactScene (212-00)', () => {
  it('builds the deck and all supports in model order within a few seconds', () => {
    expect(objects.map((o) => `${o.kind}:${o.id}`)).toEqual(
      meshScene.objects.map((o) => `${o.kind}:${o.id}`),
    );
    expect(objects.every((o) => o.issues.length === 0)).toBe(true);
    expect(elapsed).toBeLessThan(15000);
  });

  it('matches the deck volume of the mesh kernel within 0.5 % (same skewed end planes)', () => {
    const deck = objects[0] as ExactObject;
    const exact = kernel.volume(deck.solids[0]?.solid as never);
    const mesh = meshVolume(meshOf(deck.id) as never);
    expect(Math.abs(exact - mesh) / mesh).toBeLessThan(0.005);
    // tesselácia presného telesa (rovinné steny) → objem siete zhodný na mm³
    expect(meshVolume(deck.mesh)).toBeCloseTo(exact, 3);
  });

  it('ends the deck exactly in the vertical planes through the abutment axes', () => {
    const deck = objects[0] as ExactObject;
    const p = deck.mesh.positions;
    const ref = evaluateReference212();
    const samples = sampleSuperstructure(ref.ctx, ref.deck, ref.results) as DeckSamples;
    const first = samples.sections[0]?.axis?.point;
    const last = samples.sections.at(-1)?.axis?.point;
    if (!first || !last) throw new Error('chýba os NK');
    for (const [point, other, r] of [
      [first, last, ref.results[0]],
      [last, first, ref.results[3]],
    ] as const) {
      const d = r?.direction ?? { x: 0, y: 1 };
      // normála roviny konca (zvislej, cez os opory) smerom von z NK
      let n = { x: d.y, y: -d.x };
      if ((other.x - point.x) * n.x + (other.y - point.y) * n.y > 0) n = { x: -n.x, y: -n.y };
      let on = 0;
      let beyond = 0;
      for (let i = 0; i < p.length; i += 3) {
        const dist = ((p[i] as number) - point.x) * n.x + ((p[i + 1] as number) - point.y) * n.y;
        if (dist > 1e-6) beyond++;
        if (Math.abs(dist) <= 1e-6) on++;
      }
      expect(beyond).toBe(0);
      expect(on).toBeGreaterThanOrEqual(4);
    }
  });

  it('unites the abutment parts into one body and keeps the pier volume of the mesh kernel', () => {
    const [, o1, p2] = objects as [ExactObject, ExactObject, ExactObject];
    const o1Body = kernel.volume(o1.solids[0]?.solid as never);
    const o1Bearings = o1.solids.slice(1).reduce((a, s) => a + kernel.volume(s.solid), 0);
    const o1Mesh = meshVolume(meshOf(o1.id) as never);
    // sieť sčíta prekrývajúce sa časti (krídla × múrik × prah) → zjednotená opora má menší objem
    expect(o1Body + o1Bearings).toBeLessThanOrEqual(o1Mesh + 1e-6);
    expect(o1Body + o1Bearings).toBeGreaterThan(0.8 * o1Mesh);
    const p2Exact = p2.solids.reduce((a, s) => a + kernel.volume(s.solid), 0);
    const p2Mesh = meshVolume(meshOf(p2.id) as never);
    expect(Math.abs(p2Exact - p2Mesh) / p2Mesh).toBeLessThan(0.005);
    // podpery vzoru 212-00 sa volajú 1 – 4 (id p1 – p4)
    expect(p2.solids.map((s) => s.name)).toEqual([
      `${p2.name} (p2)`,
      `${p2.name} – ložisko 1 (p2)`,
      `${p2.name} – ložisko 2 (p2)`,
    ]);
  });

  it('writes the whole scene to a deterministic STEP that reads back solid by solid', () => {
    const output = (globalThis as unknown as { console: { log: (...args: unknown[]) => void } })
      .console;
    const quiet = vi.spyOn(output, 'log').mockImplementation(() => undefined);
    try {
      const origin = project.crs.origin as { x: number; y: number; z: number };
      const sjtsk = exactSceneStep(kernel, objects, origin);
      expect(exactSceneStep(kernel, objects, origin)).toBe(sjtsk);
      // spätné načítanie v lokálnych súradniciach: OCCT číta v mm a súradnice S-JTSK (~1e9 mm) by jeho tolerancie
      // nezvládli; zápis v S-JTSK je ten istý so začiatkom posunutým o počiatok
      const step = exactSceneStep(kernel, objects);
      const named = objects.flatMap((o) => o.solids);
      for (const s of named) expect(sjtsk).toContain(`PRODUCT('${s.name}'`);
      const volumes = kernel.stepVolumes(step);
      expect(volumes).toHaveLength(named.length);
      const total = named.reduce((a, s) => a + kernel.volume(s.solid), 0);
      expect(volumes.reduce((a, v) => a + v, 0)).toBeCloseTo(total, 3);
    } finally {
      quiet.mockRestore();
    }
  });
});
