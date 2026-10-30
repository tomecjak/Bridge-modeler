/// Web Worker: generovanie 3D sietí mimo hlavného vlákna (ADR 0009).
import {
  buildScene,
  createSceneCache,
  type RenderBuffers,
  type SceneObjectKind,
  sceneObjectKey,
  toRenderBuffers,
} from '@bridge/mesh';
import type { ModelIssue, ProjectFile } from '@bridge/model';
import { expose, transfer } from 'comlink';

export interface RenderObject {
  key: string;
  kind: SceneObjectKind;
  id: string;
  name: string;
  buffers: RenderBuffers;
  issues: ModelIssue[];
}

export interface MeshUpdate {
  /** `kind:id` všetkých objektov v stabilnom poradí */
  keys: string[];
  /** prepočítané objekty s novými bufframi (prenesené, nie kopírované) */
  changed: RenderObject[];
  removed: string[];
  /** čas generovania v workeri [ms] */
  elapsed: number;
}

// worker žije s viewerom → nový viewer začína s prázdnou cache a dostane všetky siete
const cache = createSceneCache();

const api = {
  build(project: ProjectFile): MeshUpdate {
    const start = performance.now();
    const scene = buildScene(project, cache);
    const changedKeys = new Set(scene.changed);
    const changed = scene.objects
      .filter((o) => changedKeys.has(sceneObjectKey(o.kind, o.id)))
      .map(
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
      keys: scene.objects.map((o) => sceneObjectKey(o.kind, o.id)),
      changed,
      removed: scene.removed,
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
};

export type MeshWorkerApi = typeof api;

expose(api);
