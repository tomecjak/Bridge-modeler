import type { LibraryEntry } from '@bridge/model';
import { slab } from '@bridge/sections';
import { describe, expect, it } from 'vitest';
import { CloudConflictError, cloudProfileLibrary, detectCloud } from './cloudLibrary.ts';

const entry = (id: string, name: string): LibraryEntry => ({
  id,
  name,
  typology: 'slab',
  profile: slab(`p-${id}`),
});
const meta = (e: LibraryEntry, version: number) => ({
  entry: e,
  version,
  createdBy: 'jakub@firma.sk',
  createdAt: '2026-10-31T10:00:00Z',
  updatedBy: 'kolega@firma.sk',
  updatedAt: '2026-10-31T11:00:00Z',
});

/** Falošný server: zaznamená požiadavky a vráti pripravené odpovede. */
function server(responses: Record<string, () => Response>) {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ method, url, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
    const r = responses[`${method} ${url.split('?')[0]}`];
    return r ? r() : new Response('{}', { status: 404 });
  }) as typeof fetch;
  return { calls, fetchFn };
}
const ok =
  (body: unknown, status = 200) =>
  () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('detectCloud', () => {
  it('returns the signed-in user, or nothing without the worker', async () => {
    expect(
      await detectCloud(server({ 'GET /api/me': ok({ email: 'jakub@firma.sk' }) }).fetchFn),
    ).toEqual({
      email: 'jakub@firma.sk',
    });
    expect(await detectCloud(server({}).fetchFn)).toBeUndefined();
    const down = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    expect(await detectCloud(down)).toBeUndefined();
  });
});

describe('cloudProfileLibrary', () => {
  it('lists entries with their versions and authors and saves changes with the expected version', async () => {
    const a = entry('a', 'Doska');
    const s = server({
      'GET /api/library': ok({ entries: [meta(a, 3)] }),
      'PUT /api/library/a': ok(meta({ ...a, name: 'Doska 2' }, 4)),
      'PUT /api/library/b': ok(meta(entry('b', 'Nová'), 1), 201),
    });
    const lib = cloudProfileLibrary(s.fetchFn);
    expect((await lib.list()).map((e) => e.name)).toEqual(['Doska']);
    expect(lib.info('a')).toMatchObject({ version: 3, updatedBy: 'kolega@firma.sk' });
    await lib.save({ ...a, name: 'Doska 2' });
    expect(s.calls.at(-1)).toMatchObject({ method: 'PUT', body: { expectedVersion: 3 } });
    expect(lib.info('a')?.version).toBe(4);
    await lib.save(entry('b', 'Nová'));
    expect(s.calls.at(-1)?.body).not.toHaveProperty('expectedVersion');
  });

  it('turns a version conflict into a typed error with the server message', async () => {
    const a = entry('a', 'Doska');
    const s = server({
      'GET /api/library': ok({ entries: [meta(a, 1)] }),
      'PUT /api/library/a': ok(
        {
          code: 'VersionConflict',
          message: 'Položku medzitým zmenil kolega@firma.sk.',
          current: meta(a, 2),
        },
        409,
      ),
      'DELETE /api/library/a': ok(
        { code: 'VersionConflict', message: 'zmenené', current: meta(a, 2) },
        409,
      ),
    });
    const lib = cloudProfileLibrary(s.fetchFn);
    await lib.list();
    await expect(lib.save(a)).rejects.toBeInstanceOf(CloudConflictError);
    await expect(lib.save(a)).rejects.toThrow('Položku medzitým zmenil kolega@firma.sk.');
    await expect(lib.remove('a')).rejects.toBeInstanceOf(CloudConflictError);
    expect(s.calls.at(-1)?.url).toBe('/api/library/a?version=1');
  });
});
