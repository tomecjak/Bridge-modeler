import type { ProjectFile } from '@bridge/model';
import { type Remote, wrap } from 'comlink';
import { useEffect, useRef } from 'react';
import type { MeshUpdate, MeshWorkerApi } from './mesh.worker.ts';

interface Callbacks {
  onUpdate: (update: MeshUpdate) => void;
  onError: (error: unknown) => void;
}

interface WorkerState {
  worker: Worker;
  api: Remote<MeshWorkerApi>;
  busy: boolean;
  pending: ProjectFile | undefined;
  disposed: boolean;
  callbacks: { current: Callbacks };
}

/**
 * Generovanie sietí vo Web Workeri. Požiadavky „posledná vyhráva“: kým worker počíta, ďalšie zmeny projektu
 * sa zlúčia a pošle sa len posledná. Worker žije, kým je komponent pripojený (jeho cache tiež).
 */
export function useMeshWorker(
  project: ProjectFile,
  onUpdate: (update: MeshUpdate) => void,
  onError: (error: unknown) => void,
): void {
  const callbacks = useRef<Callbacks>({ onUpdate, onError });
  callbacks.current = { onUpdate, onError };
  const state = useRef<WorkerState | undefined>(undefined);

  useEffect(() => {
    const worker = new Worker(new URL('./mesh.worker.ts', import.meta.url), { type: 'module' });
    const s: WorkerState = {
      worker,
      api: wrap<MeshWorkerApi>(worker),
      busy: false,
      pending: undefined,
      disposed: false,
      callbacks,
    };
    state.current = s;
    return () => {
      s.disposed = true;
      worker.terminate();
      if (state.current === s) state.current = undefined;
    };
  }, []);

  useEffect(() => {
    const s = state.current;
    if (!s) return;
    s.pending = project;
    void pump(s);
  }, [project]);
}

/** Posiela do workera vždy len najnovší projekt, kým nie je čo počítať. */
async function pump(s: WorkerState) {
  if (s.busy) return;
  s.busy = true;
  try {
    while (s.pending && !s.disposed) {
      const next = s.pending;
      s.pending = undefined;
      const update = await s.api.build(next);
      if (!s.disposed) s.callbacks.current.onUpdate(update);
    }
  } catch (e) {
    if (!s.disposed) s.callbacks.current.onError(e);
  } finally {
    s.busy = false;
  }
}
