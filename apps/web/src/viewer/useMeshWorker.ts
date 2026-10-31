import type { ProjectFile } from '@bridge/model';
import { type Remote, wrap } from 'comlink';
import { useEffect, useRef } from 'react';
import type { ExactWorkerApi } from './exact.worker.ts';
import type { MeshUpdate, MeshWorkerApi } from './mesh.worker.ts';

interface Callbacks {
  onUpdate: (update: MeshUpdate) => void;
  onError: (error: unknown) => void;
}

type BuildApi = Pick<MeshWorkerApi, 'build'> | Pick<ExactWorkerApi, 'build'>;

interface WorkerState<A extends BuildApi> {
  worker: Worker;
  api: Remote<A>;
  busy: boolean;
  pending: ProjectFile | undefined;
  /** posledne odoslaný projekt (rovnaký objekt sa neposiela znova — immer zachová identitu) */
  sent: ProjectFile | undefined;
  disposed: boolean;
  callbacks: { current: Callbacks };
}

/**
 * Generovanie scény vo Web Workeri. Požiadavky „posledná vyhráva“: kým worker počíta, ďalšie zmeny projektu
 * sa zlúčia a pošle sa len posledná. Worker žije, kým je komponent pripojený a `enabled` (nový worker = prázdna
 * cache → pošle všetky siete, napr. po návrate z presného modelu).
 */
function useSceneWorker<A extends BuildApi>(
  create: () => Worker,
  project: ProjectFile,
  onUpdate: (update: MeshUpdate) => void,
  onError: (error: unknown) => void,
  enabled: boolean,
): { current: WorkerState<A> | undefined } {
  const callbacks = useRef<Callbacks>({ onUpdate, onError });
  callbacks.current = { onUpdate, onError };
  const state = useRef<WorkerState<A> | undefined>(undefined);
  const latest = useRef(project);
  latest.current = project;

  // biome-ignore lint/correctness/useExhaustiveDependencies: worker sa vytvára len podľa `enabled`
  useEffect(() => {
    if (!enabled) return;
    const worker = create();
    const s: WorkerState<A> = {
      worker,
      api: wrap<A>(worker),
      busy: false,
      pending: latest.current,
      sent: undefined,
      disposed: false,
      callbacks,
    };
    state.current = s;
    void pump(s);
    return () => {
      s.disposed = true;
      worker.terminate();
      if (state.current === s) state.current = undefined;
    };
  }, [enabled]);

  useEffect(() => {
    const s = state.current;
    if (!s) return;
    s.pending = project;
    void pump(s);
  }, [project]);

  return state;
}

/** Siete jadra `MeshKernel` (ADR 0009). */
export function useMeshWorker(
  project: ProjectFile,
  onUpdate: (update: MeshUpdate) => void,
  onError: (error: unknown) => void,
  enabled = true,
): void {
  useSceneWorker<MeshWorkerApi>(
    () => new Worker(new URL('./mesh.worker.ts', import.meta.url), { type: 'module' }),
    project,
    onUpdate,
    onError,
    enabled,
  );
}

/** Presný model cez OpenCascade (ADR 0014); vráti funkciu na export STEP poslednej presnej scény. */
export function useExactWorker(
  project: ProjectFile,
  onUpdate: (update: MeshUpdate) => void,
  onError: (error: unknown) => void,
  enabled: boolean,
): (offset?: { x: number; y: number; z: number }) => Promise<string> {
  const state = useSceneWorker<ExactWorkerApi>(
    () => new Worker(new URL('./exact.worker.ts', import.meta.url), { type: 'module' }),
    project,
    onUpdate,
    onError,
    enabled,
  );
  return async (offset) => {
    const s = state.current;
    if (!s) throw new Error('Presný model nie je zapnutý.');
    return s.api.step(offset);
  };
}

/** Posiela do workera vždy len najnovší projekt, kým nie je čo počítať. */
async function pump<A extends BuildApi>(s: WorkerState<A>) {
  if (s.busy) return;
  s.busy = true;
  try {
    while (s.pending && !s.disposed) {
      const next = s.pending;
      s.pending = undefined;
      if (next === s.sent) continue;
      s.sent = next;
      // terén worker nepotrebuje a jeho kopírovanie pri každej zmene by bolo drahé (ADR 0011)
      const update = await (s.api as Remote<BuildApi>).build(
        next.terrains.length > 0 ? { ...next, terrains: [] } : next,
      );
      if (!s.disposed) s.callbacks.current.onUpdate(update);
    }
  } catch (e) {
    if (!s.disposed) s.callbacks.current.onError(e);
  } finally {
    s.busy = false;
  }
}
