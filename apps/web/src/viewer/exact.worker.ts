/// Web Worker: presný model cez OpenCascade (ADR 0014) — načíta sa len pri zapnutí „Presného modelu“.
import type { Vec3 } from '@bridge/geom';
import { sceneObjectKey, toRenderBuffers } from '@bridge/mesh';
import type { ProjectFile } from '@bridge/model';
import { type ExactObject, exactScene, exactSceneStep, OcctGeometryKernel } from '@bridge/occt';
import { expose, transfer } from 'comlink';
import createModule from 'occt-wasm/dist/occt-wasm.js';
// WASM (LGPL-2.1) ostáva samostatný nezmenený súbor s vlastnou URL — dá sa nahradiť (ADR 0014)
import wasmUrl from 'occt-wasm/dist/occt-wasm.wasm?url';
import type { MeshUpdate, RenderObject } from './mesh.worker.ts';

let kernel: Promise<OcctGeometryKernel> | undefined;
let last: ExactObject[] = [];

const api = {
  async build(project: ProjectFile): Promise<MeshUpdate> {
    kernel ??= OcctGeometryKernel.create({ createModule, wasm: wasmUrl });
    const k = await kernel;
    const start = performance.now();
    // predchádzajúce telesá sa uvoľnia (scéna sa počíta celá nanovo, cache tu nie je)
    k.releaseAll();
    last = exactScene(project, k);
    const changed = last.map(
      (o): RenderObject => ({
        key: sceneObjectKey(o.kind, o.id),
        kind: o.kind,
        id: o.id,
        name: o.name,
        buffers: toRenderBuffers(o.mesh),
        issues: o.issues,
      }),
    );
    const update: MeshUpdate = {
      keys: changed.map((c) => c.key),
      changed,
      removed: [],
      elapsed: performance.now() - start,
    };
    return transfer(
      update,
      changed.flatMap((c) => [
        c.buffers.positions.buffer,
        c.buffers.normals.buffer,
        c.buffers.indices.buffer,
      ]),
    );
  },

  /** STEP posledne vypočítanej presnej scény (posun napr. do S-JTSK). */
  async step(offset?: Vec3): Promise<string> {
    const k = await kernel;
    if (!k || last.length === 0) throw new Error('Presný model ešte nie je vypočítaný.');
    return exactSceneStep(k, last, offset);
  },
};

export type ExactWorkerApi = typeof api;

expose(api);
