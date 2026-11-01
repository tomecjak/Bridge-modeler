import { createEmptyProject, type ProjectFile } from '@bridge/model';
import {
  applyPatches,
  type Draft,
  enablePatches,
  type Patch,
  produce,
  produceWithPatches,
} from 'immer';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { applyCommand, type Command } from './commands.ts';
import { syncDeckEnds } from './deckEnds.ts';

enablePatches();

const HISTORY_LIMIT = 200;

interface HistoryEntry {
  command: Command['type'];
  patches: Patch[];
  inverse: Patch[];
}

export interface ProjectState {
  project: ProjectFile;
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** zvyšuje sa pri každej zmene projektu (spúšťač autosave) */
  revision: number;
  dispatch(command: Command): void;
  undo(): void;
  redo(): void;
  /** nahradí celý projekt (nový / otvorený / obnovený) a vymaže históriu */
  replace(project: ProjectFile): void;
}

/**
 * Zosúladenie odvodených hodnôt projektu po zmene (napr. konce NK z opôr, ADR 0018): úprava draftu alebo undefined,
 * ak je projekt v súlade. Zapíše sa do toho istého kroku späť.
 */
export type ProjectNormalizer = (
  project: ProjectFile,
) => ((draft: Draft<ProjectFile>) => void) | undefined;

export function createProjectStore(
  initial: ProjectFile = createEmptyProject('Nový most'),
  normalize?: ProjectNormalizer,
) {
  const normalized = (p: ProjectFile) => {
    const fix = normalize?.(p);
    return fix ? produce(p, fix) : p;
  };
  return createStore<ProjectState>()((set, get) => ({
    project: normalized(initial),
    past: [],
    future: [],
    revision: 0,
    dispatch(command) {
      const [changed, applied, reverted] = produceWithPatches(get().project, (draft) => {
        applyCommand(draft, command);
      });
      if (applied.length === 0) return;
      const fix = normalize?.(changed);
      const [project, extra, undoExtra] = fix
        ? produceWithPatches(changed, fix)
        : [changed, [] as Patch[], [] as Patch[]];
      const patches = [...applied, ...extra];
      const inverse = [...undoExtra, ...reverted];
      set((s) => ({
        project,
        past: [...s.past, { command: command.type, patches, inverse }].slice(-HISTORY_LIMIT),
        future: [],
        revision: s.revision + 1,
      }));
    },
    undo() {
      const { past, future, project, revision } = get();
      const entry = past.at(-1);
      if (!entry) return;
      set({
        project: applyPatches(project, entry.inverse),
        past: past.slice(0, -1),
        future: [entry, ...future],
        revision: revision + 1,
      });
    },
    redo() {
      const { past, future, project, revision } = get();
      const entry = future[0];
      if (!entry) return;
      set({
        project: applyPatches(project, entry.patches),
        past: [...past, entry],
        future: future.slice(1),
        revision: revision + 1,
      });
    },
    replace(project) {
      set((s) => ({
        project: normalized(project),
        past: [],
        future: [],
        revision: s.revision + 1,
      }));
    },
  }));
}

export type ProjectStore = ReturnType<typeof createProjectStore>;

/** Jediný store aplikácie; konce NK sa po každej zmene zosúladia s oporami (ADR 0018). */
export const projectStore = createProjectStore(undefined, syncDeckEnds);

export function useProject<T>(selector: (state: ProjectState) => T): T {
  return useStore(projectStore, selector);
}
