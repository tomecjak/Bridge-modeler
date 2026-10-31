import { entryFromProfile, type LibraryEntry, type ProfileLibrary } from '@bridge/model';
import type { createProjectStore } from './projectStore.ts';

type Store = ReturnType<typeof createProjectStore>;

/**
 * Prierezy projektu ako knižnica (Fáza 8b): čítanie zo stavu projektu, zmeny cez príkazy store (späť / znova).
 * Id položky = id prierezu v projekte.
 */
export function projectProfileLibrary(store: Store, name = 'Projekt'): ProfileLibrary {
  const profiles = () => store.getState().project.profiles;
  return {
    name,
    readOnly: false,
    list: async () => profiles().map(entryFromProfile),
    get: async (id) => {
      const p = profiles().find((x) => x.id === id);
      return p && entryFromProfile(p);
    },
    save: async (entry: LibraryEntry) => {
      const { id: _id, ...profile } = { ...entry.profile, name: entry.name };
      if (profiles().some((p) => p.id === entry.id)) {
        store.getState().dispatch({
          type: 'updateElement',
          collection: 'profiles',
          id: entry.id,
          changes: profile,
        });
      } else {
        store
          .getState()
          .dispatch({ type: 'addElements', profiles: [{ ...profile, id: entry.id }] });
      }
    },
    remove: async (id) => {
      store.getState().dispatch({ type: 'removeElement', collection: 'profiles', id });
    },
  };
}
