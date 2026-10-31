import { describe, expect, it } from 'vitest';
import {
  copyForProject,
  type LibraryEntry,
  memoryLibrary,
  parseLibrary,
  serializeLibrary,
} from './library.ts';
import type { ProfileDefinition } from './types.ts';

const def = (id: string, name: string): ProfileDefinition => ({
  id,
  name,
  parameters: [{ name: 'h', unit: 'length', default: '1' }],
  points: [
    { name: 'R', x: '0', y: '0' },
    { name: 'A', x: '1', y: '-h' },
    { name: 'B', x: '-1', y: '-h' },
  ],
  loops: [{ name: 'obrys', role: 'outer', points: ['R', 'B', 'A'] }],
  referencePoint: 'R',
  typology: 'slab',
});
const entry = (id: string, name: string): LibraryEntry => ({
  id,
  name,
  typology: 'slab',
  profile: def(`p-${id}`, name),
});

describe('profile library file', () => {
  it('round-trips entries deterministically with a format tag and version', () => {
    const text = serializeLibrary([entry('a', 'Doska A'), entry('b', 'Doska B')]);
    expect(JSON.parse(text)).toMatchObject({
      format: 'bridge-modeler/profile-library',
      version: 1,
    });
    const r = parseLibrary(text);
    expect(r.ok && r.entries.map((e) => e.name)).toEqual(['Doska A', 'Doska B']);
    if (r.ok) expect(serializeLibrary(r.entries)).toBe(text);
  });

  it('reports invalid JSON, a project file opened as a library and schema violations', () => {
    expect(parseLibrary('{')).toMatchObject({ ok: false, issues: [{ code: 'InvalidJson' }] });
    expect(parseLibrary('{"schemaVersion":"6","name":"Most"}')).toMatchObject({
      ok: false,
      issues: [{ code: 'NotAProfileLibrary' }],
    });
    const broken = JSON.parse(serializeLibrary([entry('a', 'Doska')]));
    broken.entries[0].profile.loops[0].role = 'kruh';
    expect(parseLibrary(JSON.stringify(broken))).toMatchObject({
      ok: false,
      issues: [{ code: 'SchemaViolation', path: 'entries[0].profile.loops[0].role' }],
    });
  });
});

describe('memoryLibrary', () => {
  it('lists, gets, saves and removes entries in a stable order', async () => {
    const lib = memoryLibrary('Súbor', [entry('a', 'A')]);
    await lib.save(entry('b', 'B'));
    await lib.save({ ...entry('a', 'A2') });
    expect((await lib.list()).map((e) => e.name)).toEqual(['A2', 'B']);
    expect((await lib.get('b'))?.name).toBe('B');
    await lib.remove('a');
    expect((await lib.list()).map((e) => e.id)).toEqual(['b']);
    expect(await lib.get('a')).toBeUndefined();
  });

  it('refuses changes when read-only', async () => {
    const lib = memoryLibrary('Šablóny', [entry('a', 'A')], { readOnly: true });
    expect(lib.readOnly).toBe(true);
    await expect(lib.save(entry('b', 'B'))).rejects.toThrow();
    await expect(lib.remove('a')).rejects.toThrow();
  });
});

describe('copyForProject', () => {
  it('copies the profile with a new id and a unique name', () => {
    const existing = [def('p1', 'Doska'), def('p2', 'Doska (2)')];
    const copy = copyForProject(entry('a', 'Doska'), existing, 'p9');
    expect(copy.id).toBe('p9');
    expect(copy.name).toBe('Doska (3)');
    expect(copy.points).toEqual(def('x', 'x').points);
    expect(copyForProject(entry('b', 'Komora'), existing, 'p10').name).toBe('Komora');
  });
});
