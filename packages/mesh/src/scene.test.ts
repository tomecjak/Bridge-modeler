import { suggestOrigin } from '@bridge/alignment';
import { syntheticAlignmentData } from '@bridge/alignment/testing';
import {
  createEmptyProject,
  defaultAbutmentGeometry,
  type ProjectFile,
  type Support,
} from '@bridge/model';
import { twinDeckExample } from '@bridge/sections';
import { describe, expect, it } from 'vitest';
import { meshVolume } from './mesh.ts';
import { buildScene, createSceneCache, sceneObjectKey, toRenderBuffers } from './scene.ts';

const data = syntheticAlignmentData(undefined, 1000);
// balíky nemajú DOM ani Node typy (structuredClone) → kópia cez JSON
const clone = (p: ProjectFile): ProjectFile => JSON.parse(JSON.stringify(p));

function support(id: string, deck: string, kind: Support['kind'], station: number): Support {
  return {
    id,
    name: id,
    kind,
    superstructure: deck,
    station,
    crossingAngle: kind === 'abutment' ? '80' : '90',
    offset: '0',
    geometry:
      kind === 'abutment'
        ? defaultAbutmentGeometry()
        : { type: 'wall', thickness: '1.2', length: '4' },
    footing: { length: '8', width: '4', thickness: '1.2' },
    connection: 'bearing',
    bearingHeight: '0.35',
    bearings: ['-1.8', '1.8'],
    foundationTop: '238',
  };
}

/** Dvojica NK dĺžky 200 m (oblúky, klotoidy, výškové oblúky), na každej 2 opory a 3 piliere. */
function bridge200(): ProjectFile {
  const ex = twinDeckExample(data.name, 1050, 1250, {
    left: 'L',
    right: 'P',
    profile: 'jednotram',
    leftAxis: 'osL',
    rightAxis: 'osP',
  });
  const supports = ['L', 'P'].flatMap((deck) => [
    support(`${deck}-O1`, deck, 'abutment', 1051),
    support(`${deck}-P1`, deck, 'pier', 1100),
    support(`${deck}-P2`, deck, 'pier', 1150),
    support(`${deck}-P3`, deck, 'pier', 1200),
    support(`${deck}-O2`, deck, 'abutment', 1249),
  ]);
  return {
    ...createEmptyProject('Most 200 m'),
    crs: { epsg: 5514, origin: suggestOrigin(data) },
    alignments: [data],
    bridgeAxes: ex.bridgeAxes,
    profiles: [ex.profile],
    superstructures: ex.superstructures,
    supports,
  };
}

describe('buildScene', () => {
  it('regenerates a 200 m twin-deck bridge in under 1 s (kritérium Fázy 5)', () => {
    const project = bridge200();
    const start = Date.now();
    const scene = buildScene(project, createSceneCache());
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
    expect(scene.objects.map((o) => o.id)).toEqual([
      'L',
      'P',
      ...project.supports.map((s) => s.id),
    ]);
    for (const o of scene.objects) {
      expect(o.issues, o.id).toEqual([]);
      expect(meshVolume(o.mesh), o.id).toBeGreaterThan(0);
    }
  });

  it('regenerates only objects whose inputs changed', () => {
    const cache = createSceneCache();
    const project = bridge200();
    expect(buildScene(project, cache).changed).toHaveLength(12);
    expect(buildScene(clone(project), cache).changed).toEqual([]);

    // rozmer piliera nemení NK
    const thicker = clone(project);
    const p2 = thicker.supports.find((s) => s.id === 'L-P2') as Support;
    p2.geometry = { type: 'wall', thickness: '1.5', length: '4' };
    expect(buildScene(thicker, cache).changed).toEqual([sceneObjectKey('support', 'L-P2')]);

    // šikmosť opory mení koniec NK
    const skewed = clone(thicker);
    (skewed.supports.find((s) => s.id === 'P-O2') as Support).crossingAngle = '70';
    expect(buildScene(skewed, cache).changed).toEqual([
      sceneObjectKey('superstructure', 'P'),
      sceneObjectKey('support', 'P-O2'),
    ]);

    // parameter projektu môže ovplyvniť čokoľvek
    const withParam = clone(skewed);
    withParam.parameters.push({
      id: 'x',
      name: 'x',
      unit: 'length',
      law: { kind: 'constant', value: '1' },
    });
    expect(buildScene(withParam, cache).changed).toHaveLength(12);
  });

  it('reports removed objects and clears the scene without an origin', () => {
    const cache = createSceneCache();
    const project = bridge200();
    buildScene(project, cache);
    const fewer = { ...project, supports: project.supports.slice(1) };
    expect(buildScene(fewer, cache).removed).toEqual([sceneObjectKey('support', 'L-O1')]);
    const empty = buildScene({ ...project, crs: { epsg: 5514, origin: null } }, cache);
    expect(empty.objects).toEqual([]);
    expect(empty.removed).toHaveLength(11);
  });

  it('is deterministic', () => {
    const a = buildScene(bridge200(), createSceneCache());
    const b = buildScene(bridge200(), createSceneCache());
    expect(a.objects.map((o) => [...o.mesh.positions])).toEqual(
      b.objects.map((o) => [...o.mesh.positions]),
    );
  });
});

describe('toRenderBuffers', () => {
  it('stores positions relative to the mesh centre in float32 without losing precision', () => {
    const scene = buildScene(bridge200(), createSceneCache());
    const mesh = (scene.objects[0] as (typeof scene.objects)[number]).mesh;
    const r = toRenderBuffers(mesh);
    let worst = 0;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      worst = Math.max(
        worst,
        Math.abs((r.positions[i] as number) + r.center.x - (mesh.positions[i] as number)),
        Math.abs((r.positions[i + 1] as number) + r.center.y - (mesh.positions[i + 1] as number)),
        Math.abs((r.positions[i + 2] as number) + r.center.z - (mesh.positions[i + 2] as number)),
      );
    }
    // NK 200 m: polohy do ±110 m od stredu → chyba float32 pod 0,01 mm
    expect(worst).toBeLessThan(1e-5);
  });
});
