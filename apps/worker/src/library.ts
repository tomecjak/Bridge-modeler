import {
  type LibraryEntry,
  LibraryEntrySchema,
  type SupportLibraryEntry,
  SupportLibraryEntrySchema,
} from '@bridge/model';
import { z } from 'zod';

/** Položka firemnej knižnice s verziou a autormi (odpoveď API). */
export interface CloudEntry<E = LibraryEntry> {
  entry: E;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

/** Riadok tabuľky knižnice: stĺpce položky (podľa tabuľky), verzia a autori. */
type Row = Record<string, string | number | null> & {
  id: string;
  name: string;
  version: number;
  created_by: string;
  created_at: string;
  updated_by: string;
  updated_at: string;
};

/**
 * Tabuľka firemnej knižnice (ADR 0015, 0019): položka ↔ riadok. Názov tabuľky a stĺpcov je konštanta v kóde, nie
 * vstup od používateľa.
 */
export interface LibraryTable<E extends { id: string; name: string }> {
  table: string;
  schema: z.ZodType<E>;
  /** stĺpce okrem id, name, verzie a autorov */
  columns: readonly string[];
  toColumns(entry: E): (string | null)[];
  fromRow(row: Row): E;
}

/** Firemná knižnica prierezov (ADR 0015). */
export const PROFILE_TABLE: LibraryTable<LibraryEntry> = {
  table: 'profile_library',
  schema: LibraryEntrySchema,
  columns: ['typology', 'description', 'profile'],
  toColumns: (e) => [e.typology ?? null, e.description ?? null, JSON.stringify(e.profile)],
  fromRow: (r) => ({
    id: r.id,
    name: r.name,
    ...(r.typology !== null ? { typology: String(r.typology) } : {}),
    ...(r.description !== null ? { description: String(r.description) } : {}),
    profile: JSON.parse(String(r.profile)),
  }),
};

/** Firemná knižnica podpier (ADR 0019). */
export const SUPPORT_TABLE: LibraryTable<SupportLibraryEntry> = {
  table: 'support_library',
  schema: SupportLibraryEntrySchema,
  columns: ['kind', 'description', 'support'],
  toColumns: (e) => [e.support.kind, e.description ?? null, JSON.stringify(e.support)],
  fromRow: (r) => ({
    id: r.id,
    name: r.name,
    ...(r.description !== null ? { description: String(r.description) } : {}),
    support: JSON.parse(String(r.support)),
  }),
};

/** Chyba API so stavom a slovenskou hláškou pre projektanta. */
export interface ApiError {
  status: number;
  code: string;
  message: string;
  path?: string;
  current?: CloudEntry<unknown>;
}

export type Result<T> = { ok: true; value: T; status?: number } | { ok: false; error: ApiError };

function fromRow<E extends { id: string; name: string }>(
  t: LibraryTable<E>,
  r: Row,
): CloudEntry<E> {
  return {
    entry: t.fromRow(r),
    version: r.version,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedBy: r.updated_by,
    updatedAt: r.updated_at,
  };
}

const conflict = (current: CloudEntry<{ name: string }>): ApiError => ({
  status: 409,
  code: 'VersionConflict',
  message: `Položku „${current.entry.name}“ medzitým zmenil ${current.updatedBy} (${current.updatedAt.slice(0, 16).replace('T', ' ')} UTC). Načítajte knižnicu znova.`,
  current,
});

/** Všetky položky podľa mena (bez ohľadu na veľkosť písmen). */
export async function listEntries<E extends { id: string; name: string }>(
  db: D1Database,
  t: LibraryTable<E>,
): Promise<CloudEntry<E>[]> {
  const r = await db
    .prepare(`SELECT * FROM ${t.table} ORDER BY name COLLATE NOCASE, id`)
    .all<Row>();
  return r.results.map((row) => fromRow(t, row));
}

export async function getEntry<E extends { id: string; name: string }>(
  db: D1Database,
  t: LibraryTable<E>,
  id: string,
): Promise<CloudEntry<E> | undefined> {
  const r = await db.prepare(`SELECT * FROM ${t.table} WHERE id = ?`).bind(id).first<Row>();
  return r ? fromRow(t, r) : undefined;
}

/**
 * Uloží položku: nová (bez `expectedVersion`) dostane verziu 1, existujúca sa zmení len pri zhode
 * `expectedVersion` s uloženou verziou (inak 409 s aktuálnou položkou).
 */
export async function saveEntry<E extends { id: string; name: string }>(
  db: D1Database,
  t: LibraryTable<E>,
  id: string,
  body: unknown,
  user: string,
  now: string,
): Promise<Result<CloudEntry<E>>> {
  const parsed = z
    .object({ entry: t.schema, expectedVersion: z.number().int().positive().optional() })
    .safeParse(body);
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
  const { entry, expectedVersion } = parsed.data as { entry: E; expectedVersion?: number };
  if (entry.id !== id) {
    return {
      ok: false,
      error: { status: 400, code: 'IdMismatch', message: 'Id položky sa nezhoduje s adresou.' },
    };
  }
  const existing = await getEntry(db, t, id);
  const values = t.toColumns(entry);
  if (existing) {
    if (expectedVersion !== existing.version) return { ok: false, error: conflict(existing) };
    const set = t.columns.map((c) => `${c} = ?`).join(', ');
    await db
      .prepare(
        `UPDATE ${t.table} SET name = ?, ${set}, version = ?, updated_by = ?, updated_at = ?
         WHERE id = ? AND version = ?`,
      )
      .bind(entry.name, ...values, existing.version + 1, user, now, id, existing.version)
      .run();
  } else {
    if (expectedVersion !== undefined) {
      return {
        ok: false,
        error: { status: 404, code: 'NotFound', message: 'Položka v knižnici už nie je.' },
      };
    }
    const columns = ['id', 'name', ...t.columns, 'version', 'created_by', 'created_at'];
    const all = [...columns, 'updated_by', 'updated_at'];
    await db
      .prepare(
        `INSERT INTO ${t.table} (${all.join(', ')}) VALUES (${all.map(() => '?').join(', ')})`,
      )
      .bind(id, entry.name, ...values, 1, user, now, user, now)
      .run();
  }
  const saved = (await getEntry(db, t, id)) as CloudEntry<E>;
  return { ok: true, value: saved, status: existing ? 200 : 201 };
}

/** Odstráni položku, ak má očakávanú verziu. */
export async function deleteEntry<E extends { id: string; name: string }>(
  db: D1Database,
  t: LibraryTable<E>,
  id: string,
  expectedVersion: number | undefined,
): Promise<Result<undefined>> {
  const existing = await getEntry(db, t, id);
  if (!existing) {
    return {
      ok: false,
      error: { status: 404, code: 'NotFound', message: 'Položka v knižnici už nie je.' },
    };
  }
  if (expectedVersion !== existing.version) return { ok: false, error: conflict(existing) };
  await db
    .prepare(`DELETE FROM ${t.table} WHERE id = ? AND version = ?`)
    .bind(id, existing.version)
    .run();
  return { ok: true, value: undefined };
}
