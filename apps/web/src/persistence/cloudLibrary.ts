import type { LibraryEntry, ProfileLibrary } from '@bridge/model';

/** Verzia a autori položky firemnej knižnice (ADR 0015). */
export interface CloudEntryInfo {
  version: number;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

interface CloudEntry extends CloudEntryInfo {
  entry: LibraryEntry;
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

/**
 * Firemná knižnica prierezov za rozhraním `ProfileLibrary` (API Workera, D1). Pamätá si verzie načítaných položiek
 * a posiela ich pri uložení a odstránení, aby sa neprepísala zmena kolegu (409 → `CloudConflictError`).
 */
export function cloudProfileLibrary(
  fetchFn: typeof fetch = fetch,
  name = 'Firemná knižnica',
): ProfileLibrary & { info(id: string): CloudEntryInfo | undefined } {
  const known = new Map<string, CloudEntryInfo>();
  const remember = (e: CloudEntry) => {
    const { entry, ...info } = e;
    known.set(entry.id, info);
    return entry;
  };
  const url = (id: string) => `/api/library/${encodeURIComponent(id)}`;
  return {
    name,
    readOnly: false,
    info: (id) => known.get(id),
    async list() {
      const r = await fetchFn('/api/library');
      if (!r.ok) throw await failure(r);
      const { entries } = (await r.json()) as { entries: CloudEntry[] };
      known.clear();
      return entries.map(remember);
    },
    async get(id) {
      const r = await fetchFn(url(id));
      if (r.status === 404) return undefined;
      if (!r.ok) throw await failure(r);
      return remember((await r.json()) as CloudEntry);
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
      remember((await r.json()) as CloudEntry);
    },
    async remove(id) {
      const version = known.get(id)?.version ?? 0;
      const r = await fetchFn(`${url(id)}?version=${version}`, { method: 'DELETE' });
      if (!r.ok) throw await failure(r);
      known.delete(id);
    },
  };
}
