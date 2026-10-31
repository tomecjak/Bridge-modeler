import { builtinProfileLibrary } from '@bridge/sections';
import { describe, expect, it } from 'vitest';
import { projectProfileLibrary } from './profileLibrary.ts';
import { createProjectStore } from './projectStore.ts';

describe('projectProfileLibrary', () => {
  it('lists project profiles, saves new and changed entries and removes them as undoable steps', async () => {
    const store = createProjectStore();
    const lib = projectProfileLibrary(store);
    const template = await builtinProfileLibrary().get('sablona:slab');
    if (!template) throw new Error('chýba šablóna');
    await lib.save({ ...template, id: 'p1', name: 'Doska nad potokom' });
    expect((await lib.list()).map((e) => [e.id, e.name, e.typology])).toEqual([
      ['p1', 'Doska nad potokom', 'slab'],
    ]);
    expect(store.getState().project.profiles[0]?.id).toBe('p1');
    await lib.save({ ...template, id: 'p1', name: 'Doska' });
    expect(store.getState().project.profiles.map((p) => p.name)).toEqual(['Doska']);
    await lib.remove('p1');
    expect(await lib.list()).toEqual([]);
    store.getState().undo();
    store.getState().undo();
    expect(store.getState().project.profiles.map((p) => p.name)).toEqual(['Doska nad potokom']);
  });
});
