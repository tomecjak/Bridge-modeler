import { openProject, type ProjectFile, serializeProject } from '@bridge/model';
import type { ProjectStore } from '../store/projectStore.ts';

const DB_NAME = 'bridge-modeler';
const STORE = 'autosave';
const KEY = 'current';
const DEBOUNCE_MS = 1000;

interface AutosaveRecord {
  savedAt: string;
  text: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

/** Načíta automaticky uložený projekt; pri chybe alebo neplatnom obsahu vráti undefined. */
export async function loadAutosave(): Promise<{ project: ProjectFile; savedAt: Date } | undefined> {
  try {
    const record = await withStore<AutosaveRecord | undefined>('readonly', (s) => s.get(KEY));
    if (!record) return undefined;
    const opened = openProject(record.text);
    return opened.ok ? { project: opened.project, savedAt: new Date(record.savedAt) } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Po každej zmene projektu (s oneskorením 1 s) uloží projekt do IndexedDB.
 * Vráti funkciu na zrušenie odberu. Chyby úložiska (súkromné okno) sa ignorujú — projekt ostáva v pamäti.
 */
export function startAutosave(store: ProjectStore): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = store.subscribe((state, prev) => {
    if (state.revision === prev.revision) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const record: AutosaveRecord = {
        savedAt: new Date().toISOString(),
        text: serializeProject(state.project),
      };
      withStore('readwrite', (s) => s.put(record, KEY)).catch(() => undefined);
    }, DEBOUNCE_MS);
  });
  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}
