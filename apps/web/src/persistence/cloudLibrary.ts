import type { Library, LibraryEntry, ProfileLibrary, SupportLibraryEntry } from '@bridge/model';

/** Verzia a autori položky firemnej knižnice (ADR 0015). */
export interface CloudEntryInfo {
  version: number;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

interface CloudEntry<E> extends CloudEntryInfo {
  entry: E;
}

/** Položku medzitým zmenil niekto iný (409); hláška je zo servera. */
export class CloudConflictError extends Error {}

/** Prihlásený používateľ, ak beží Worker s API (nasadená aplikácia alebo `wrangler dev`); inak undefined. */
export async function detectCloud(
  fetchFn: typeof fetch = fetch,
): Promise<{ email: string } | undefined> {
  try {
    const r = await fetchFn('/api/me');
    if (!r.ok) return undefined;
    const body = (await r.json()) as { email?: unknown };
    return typeof body.email === 'string' ? { email: body.email } : undefined;
  } catch {
    return undefined;
  }
}

async function failure(r: Response): Promise<Error> {
  let message = `Firemná knižnica odpovedala chybou ${r.status}.`;
  try {
    const body = (await r.json()) as { message?: string };
    if (body.message) message = body.message;
  } catch {
    // telo nie je JSON → ostane všeobecná hláška
  }
  return r.status === 409 ? new CloudConflictError(message) : new Error(message);
}

/** Firemná knižnica s verziami položiek (na kontrolu súbežných zmien). */
export type CloudLibrary<E extends { id: string }> = Library<E> & {
  info(id: string): CloudEntryInfo | undefined;
};

/**
 * Firemná knižnica za rozhraním `Library` (API Workera `path`, D1; ADR 0015, 0019). Pamätá si verzie načítaných
 * položiek a posiela ich pri uložení a odstránení, aby sa neprepísala zmena kolegu (409 → `CloudConflictError`).
 */
export function cloudLibrary<E extends { id: string }>(
  path: string,
  fetchFn: typeof fetch,
  name: string,
): CloudLibrary<E> {
  const known = new Map<string, CloudEntryInfo>();
  const remember = (e: CloudEntry<E>) => {
    const { entry, ...info } = e;
    known.set(entry.id, info);
    return entry;
  };
  const url = (id: string) => `${path}/${encodeURIComponent(id)}`;
  return {
    name,
    readOnly: false,
    info: (id) => known.get(id),
    async list() {
      const r = await fetchFn(path);
      if (!r.ok) throw await failure(r);
      const { entries } = (await r.json()) as { entries: CloudEntry<E>[] };
      known.clear();
      return entries.map(remember);
    },
    async get(id) {
      const r = await fetchFn(url(id));
      if (r.status === 404) return undefined;
      if (!r.ok) throw await failure(r);
      return remember((await r.json()) as CloudEntry<E>);
    },
    async save(entry) {
      const version = known.get(entry.id)?.version;
      const r = await fetchFn(url(entry.id), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          version === undefined ? { entry } : { entry, expectedVersion: version },
        ),
      });
      if (!r.ok) throw await failure(r);
      remember((await r.json()) as CloudEntry<E>);
    },
    async remove(id) {
      const version = known.get(id)?.version ?? 0;
      const r = await fetchFn(`${url(id)}?version=${version}`, { method: 'DELETE' });
      if (!r.ok) throw await failure(r);
      known.delete(id);
    },
  };
}

/** Firemná knižnica prierezov (ADR 0015). */
export const cloudProfileLibrary = (
  fetchFn: typeof fetch = fetch,
  name = 'Firemná knižnica',
): ProfileLibrary & CloudLibrary<LibraryEntry> => cloudLibrary('/api/library', fetchFn, name);

/** Firemná knižnica podpier (ADR 0019). */
export const cloudSupportLibrary = (
  fetchFn: typeof fetch = fetch,
  name = 'Firemná knižnica',
): CloudLibrary<SupportLibraryEntry> => cloudLibrary('/api/support-library', fetchFn, name);
