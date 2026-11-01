import type { LibraryEntry, SupportLibraryEntry } from '@bridge/model';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Env, handleApi } from '../src/index.ts';
import { testDatabase } from './d1.ts';

const entry = (id: string, name: string): LibraryEntry => ({
  id,
  name,
  typology: 'slab',
  profile: {
    id: `p-${id}`,
    name,
    parameters: [{ name: 'h', unit: 'length', default: '1' }],
    points: [
      { name: 'R', x: '0', y: '0' },
      { name: 'A', x: '1', y: '-h' },
      { name: 'B', x: '-1', y: '-h' },
    ],
    loops: [{ name: 'obrys', role: 'outer', points: ['R', 'B', 'A'] }],
    referencePoint: 'R',
  },
});

let env: Env;
beforeEach(() => {
  env = { DB: testDatabase(), ASSETS: {} as Fetcher };
});

const call = (method: string, path: string, body?: unknown, user = 'jakub@firma.sk') =>
  handleApi(
    new Request(`https://x${path}`, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env,
    user,
  );
const put = (e: LibraryEntry, expectedVersion?: number, user?: string) =>
  call(
    'PUT',
    `/api/library/${e.id}`,
    { entry: e, ...(expectedVersion ? { expectedVersion } : {}) },
    user,
  );

describe('library API', () => {
  it('creates entries, lists them by name and returns one with its version and authors', async () => {
    expect((await put(entry('b', 'Komora'))).status).toBe(201);
    expect((await put(entry('a', 'doska'))).status).toBe(201);
    const list = (await (await call('GET', '/api/library')).json()) as { entries: unknown[] };
    expect(list.entries.map((e) => (e as { entry: { name: string } }).entry.name)).toEqual([
      'doska',
      'Komora',
    ]);
    const one = await (await call('GET', '/api/library/b')).json();
    expect(one).toMatchObject({
      entry: { id: 'b', name: 'Komora', profile: { referencePoint: 'R' } },
      version: 1,
      createdBy: 'jakub@firma.sk',
      updatedBy: 'jakub@firma.sk',
    });
    expect((await call('GET', '/api/library/nic')).status).toBe(404);
  });

  it('updates with the expected version and refuses a stale or missing one', async () => {
    await put(entry('a', 'Doska'));
    const ok = await put({ ...entry('a', 'Doska 2') }, 1, 'kolega@firma.sk');
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ version: 2, updatedBy: 'kolega@firma.sk' });
    const stale = await put(entry('a', 'Doska 3'), 1);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      code: 'VersionConflict',
      current: { version: 2, updatedBy: 'kolega@firma.sk' },
    });
    expect((await put(entry('a', 'Doska 4'))).status).toBe(409);
  });

  it('rejects invalid bodies with the failing path and an id that differs from the address', async () => {
    const broken = {
      entry: { ...entry('a', 'X'), profile: { ...entry('a', 'X').profile, loops: 'nie' } },
    };
    const r = await call('PUT', '/api/library/a', broken);
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ code: 'InvalidEntry', path: 'entry.profile.loops' });
    expect((await call('PUT', '/api/library/x', { entry: entry('a', 'X') })).status).toBe(400);
    const notJson = await handleApi(
      new Request('https://x/api/library/a', { method: 'PUT', body: '{' }),
      env,
      'jakub@firma.sk',
    );
    expect(notJson.status).toBe(400);
  });

  it('deletes with the expected version', async () => {
    await put(entry('a', 'Doska'));
    expect((await call('DELETE', '/api/library/a?version=7')).status).toBe(409);
    expect((await call('DELETE', '/api/library/a?version=1')).status).toBe(204);
    expect((await call('DELETE', '/api/library/a?version=1')).status).toBe(404);
  });

  it('answers unsupported methods with 405', async () => {
    expect((await call('POST', '/api/library')).status).toBe(405);
  });
});

const supportEntry = (id: string, name: string): SupportLibraryEntry => ({
  id,
  name,
  support: {
    kind: 'pier',
    geometry: { type: 'wall', thickness: '1.2', length: '7.5' },
    footing: { length: '9', width: '6.5', thickness: '1.5' },
    connection: 'bearing',
    bearingHeight: '0.45',
    foundation: { mode: 'terrain', cover: '0.5', height: '8' },
  },
});

describe('support library API (ADR 0019)', () => {
  const putSupport = (e: SupportLibraryEntry, expectedVersion?: number) =>
    call('PUT', `/api/support-library/${e.id}`, {
      entry: e,
      ...(expectedVersion ? { expectedVersion } : {}),
    });

  it('stores support types apart from profiles with versions and authors', async () => {
    expect((await putSupport(supportEntry('s', 'Stenový pilier'))).status).toBe(201);
    const list = (await (await call('GET', '/api/support-library')).json()) as {
      entries: { entry: SupportLibraryEntry; version: number }[];
    };
    expect(list.entries).toMatchObject([
      { entry: { id: 's', support: { geometry: { type: 'wall' } } }, version: 1 },
    ]);
    const profiles = (await (await call('GET', '/api/library')).json()) as { entries: unknown[] };
    expect(profiles.entries).toEqual([]);
    expect((await putSupport(supportEntry('s', 'Stena'), 1)).status).toBe(200);
    expect((await putSupport(supportEntry('s', 'Stena 2'), 1)).status).toBe(409);
    expect((await call('DELETE', '/api/support-library/s?version=2')).status).toBe(204);
  });

  it('rejects a level-founded type and unknown addresses', async () => {
    const level = supportEntry('s', 'Kóta');
    const r = await call('PUT', '/api/support-library/s', {
      entry: { ...level, support: { ...level.support, foundation: { mode: 'level' } } },
    });
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ code: 'InvalidEntry' });
    expect((await call('GET', '/api/support-library/a/b')).status).toBe(404);
    expect((await call('GET', '/api/support-libraryx')).status).toBe(404);
  });
});
