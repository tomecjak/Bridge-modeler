import { type LibraryEntry, LibraryEntrySchema } from '@bridge/model';
import { z } from 'zod';

/** Položka firemnej knižnice s verziou a autormi (odpoveď API). */
export interface CloudEntry {
  entry: LibraryEntry;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

interface Row {
  id: string;
  name: string;
  typology: string | null;
  description: string | null;
  profile: string;
  version: number;
  created_by: string;
  created_at: string;
  updated_by: string;
  updated_at: string;
}

/** Chyba API so stavom a slovenskou hláškou pre projektanta. */
export interface ApiError {
  status: number;
  code: string;
  message: string;
  path?: string;
  current?: CloudEntry;
}

export type Result<T> = { ok: true; value: T; status?: number } | { ok: false; error: ApiError };

const SaveBodySchema = z.object({
  entry: LibraryEntrySchema,
  expectedVersion: z.number().int().positive().optional(),
});

function fromRow(r: Row): CloudEntry {
  return {
    entry: {
      id: r.id,
      name: r.name,
      ...(r.typology !== null ? { typology: r.typology } : {}),
      ...(r.description !== null ? { description: r.description } : {}),
      profile: JSON.parse(r.profile),
    },
    version: r.version,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedBy: r.updated_by,
    updatedAt: r.updated_at,
  };
}

const conflict = (current: CloudEntry): ApiError => ({
  status: 409,
  code: 'VersionConflict',
  message: `Položku „${current.entry.name}“ medzitým zmenil ${current.updatedBy} (${current.updatedAt.slice(0, 16).replace('T', ' ')} UTC). Načítajte knižnicu znova.`,
  current,
});

/** Všetky položky podľa mena (bez ohľadu na veľkosť písmen). */
export async function listEntries(db: D1Database): Promise<CloudEntry[]> {
  const r = await db
    .prepare('SELECT * FROM profile_library ORDER BY name COLLATE NOCASE, id')
    .all<Row>();
  return r.results.map(fromRow);
}

export async function getEntry(db: D1Database, id: string): Promise<CloudEntry | undefined> {
  const r = await db.prepare('SELECT * FROM profile_library WHERE id = ?').bind(id).first<Row>();
  return r ? fromRow(r) : undefined;
}

/**
 * Uloží položku: nová (bez `expectedVersion`) dostane verziu 1, existujúca sa zmení len pri zhode
 * `expectedVersion` s uloženou verziou (inak 409 s aktuálnou položkou).
 */
export async function saveEntry(
  db: D1Database,
  id: string,
  body: unknown,
  user: string,
  now: string,
): Promise<Result<CloudEntry>> {
  const parsed = SaveBodySchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: {
        status: 400,
        code: 'InvalidEntry',
        message: `Neplatná položka knižnice: ${issue?.message ?? ''}`,
        path: (issue?.path ?? []).map(String).join('.'),
      },
    };
  }
  const { entry, expectedVersion } = parsed.data;
  if (entry.id !== id) {
    return {
      ok: false,
      error: { status: 400, code: 'IdMismatch', message: 'Id položky sa nezhoduje s adresou.' },
    };
  }
  const existing = await getEntry(db, id);
  if (existing) {
    if (expectedVersion !== existing.version) return { ok: false, error: conflict(existing) };
    await db
      .prepare(
        `UPDATE profile_library SET name = ?, typology = ?, description = ?, profile = ?, version = ?,
         updated_by = ?, updated_at = ? WHERE id = ? AND version = ?`,
      )
      .bind(
        entry.name,
        entry.typology ?? null,
        entry.description ?? null,
        JSON.stringify(entry.profile),
        existing.version + 1,
        user,
        now,
        id,
        existing.version,
      )
      .run();
  } else {
    if (expectedVersion !== undefined) {
      return {
        ok: false,
        error: { status: 404, code: 'NotFound', message: 'Položka v knižnici už nie je.' },
      };
    }
    await db
      .prepare(
        `INSERT INTO profile_library (id, name, typology, description, profile, version,
         created_by, created_at, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        entry.name,
        entry.typology ?? null,
        entry.description ?? null,
        JSON.stringify(entry.profile),
        user,
        now,
        user,
        now,
      )
      .run();
  }
  const saved = (await getEntry(db, id)) as CloudEntry;
  return { ok: true, value: saved, status: existing ? 200 : 201 };
}

/** Odstráni položku, ak má očakávanú verziu. */
export async function deleteEntry(
  db: D1Database,
  id: string,
  expectedVersion: number | undefined,
): Promise<Result<undefined>> {
  const existing = await getEntry(db, id);
  if (!existing) {
    return {
      ok: false,
      error: { status: 404, code: 'NotFound', message: 'Položka v knižnici už nie je.' },
    };
  }
  if (expectedVersion !== existing.version) return { ok: false, error: conflict(existing) };
  await db
    .prepare('DELETE FROM profile_library WHERE id = ? AND version = ?')
    .bind(id, existing.version)
    .run();
  return { ok: true, value: undefined };
}
