import { createEmptyProject, type ProjectFile } from '@bridge/model';
import { applyPatches, enablePatches, type Patch, produceWithPatches } from 'immer';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { applyCommand, type Command } from './commands.ts';

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

export function createProjectStore(initial: ProjectFile = createEmptyProject('Nový most')) {
  return createStore<ProjectState>()((set, get) => ({
    project: initial,
    past: [],
    future: [],
    revision: 0,
    dispatch(command) {
      const [project, patches, inverse] = produceWithPatches(get().project, (draft) => {
        applyCommand(draft, command);
      });
      if (patches.length === 0) return;
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
      set((s) => ({ project, past: [], future: [], revision: s.revision + 1 }));
    },
  }));
}

export type ProjectStore = ReturnType<typeof createProjectStore>;

/** Jediný store aplikácie. */
export const projectStore = createProjectStore();

export function useProject<T>(selector: (state: ProjectState) => T): T {
  return useStore(projectStore, selector);
}
