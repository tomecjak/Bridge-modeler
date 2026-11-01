import { z } from 'zod';
import type { ModelIssue } from './issues.ts';
import { type ProfileDefinition, ProfileDefinitionSchema } from './types.ts';

/** Značka formátu súboru knižnice prierezov (odlíši ho od projektového súboru). */
export const PROFILE_LIBRARY_FORMAT = 'bridge-modeler/profile-library';

/**
 * Položka knižnice prierezov (Fáza 8b): jeden prierez s metadátami. Zodpovedá jednému riadku budúcej databázy
 * (nasadenie na Cloudflare), preto má vlastné stabilné `id` nezávislé od id prierezu v projekte.
 */
export const LibraryEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  typology: z.string().optional(),
  description: z.string().optional(),
  profile: ProfileDefinitionSchema,
});
export type LibraryEntry = z.infer<typeof LibraryEntrySchema>;

export const ProfileLibraryFileSchema = z.strictObject({
  format: z.literal(PROFILE_LIBRARY_FORMAT),
  version: z.literal(1),
  entries: z.array(LibraryEntrySchema),
});

export type LibraryParseResult<E = LibraryEntry> =
  | { ok: true; entries: E[] }
  | { ok: false; issues: ModelIssue[] };

/** Súbor knižnice prierezov (JSON so stabilným poradím kľúčov podľa schémy). */
export function serializeLibrary(entries: readonly LibraryEntry[]): string {
  const file = ProfileLibraryFileSchema.parse({
    format: PROFILE_LIBRARY_FORMAT,
    version: 1,
    entries,
  });
  return `${JSON.stringify(file, null, 2)}\n`;
}

/**
 * Načíta súbor knižnice so značkou `format` a schémou súboru; problémy vracia, nevyhadzuje. `notALibrary` = problém
 * pre súbor s inou značkou (napr. projektový súbor).
 */
export function parseLibraryFile<E>(
  text: string,
  format: string,
  schema: z.ZodType<{ entries: E[] }>,
  notALibrary: ModelIssue,
): LibraryParseResult<E> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return {
      ok: false,
      issues: [{ code: 'InvalidJson', detail: e instanceof Error ? e.message : String(e) }],
    };
  }
  if (typeof raw !== 'object' || raw === null || (raw as { format?: unknown }).format !== format) {
    return { ok: false, issues: [notALibrary] };
  }
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, entries: parsed.data.entries };
  return {
    ok: false,
    issues: parsed.error.issues.map((i) => ({
      code: 'SchemaViolation' as const,
      path: i.path
        .map((p, k) => (typeof p === 'number' ? `[${p}]` : `${k === 0 ? '' : '.'}${String(p)}`))
        .join(''),
      message: i.message,
    })),
  };
}

/** Načíta súbor knižnice prierezov; problémy vracia, nevyhadzuje. */
export function parseLibrary(text: string): LibraryParseResult {
  return parseLibraryFile(text, PROFILE_LIBRARY_FORMAT, ProfileLibraryFileSchema, {
    code: 'NotAProfileLibrary',
  });
}

/**
 * Knižnica položiek (prierezy, typy podpier) — asynchrónne rozhranie, aby sa za ním dala schovať aj databáza
 * (Cloudflare D1 / Worker API) bez zmeny volajúcich (ADR 0013, 0019). Implementácie: zabudované šablóny (len na
 * čítanie), prvky projektu, súbor, firemná knižnica.
 */
export interface Library<E extends { id: string }> {
  readonly name: string;
  readonly readOnly: boolean;
  list(): Promise<E[]>;
  get(id: string): Promise<E | undefined>;
  /** pridá položku alebo nahradí položku s rovnakým `id` (na jej mieste) */
  save(entry: E): Promise<void>;
  remove(id: string): Promise<void>;
}

/** Knižnica prierezov (ADR 0013). */
export type ProfileLibrary = Library<LibraryEntry>;

/** Knižnica v pamäti (zabudované šablóny, importovaný súbor); poradie položiek je poradie pridania. */
export function memoryLibrary<E extends { id: string }>(
  name: string,
  initial: readonly E[],
  options: { readOnly?: boolean } = {},
): Library<E> {
  const entries = [...initial];
  const readOnly = options.readOnly ?? false;
  const guard = () => {
    if (readOnly) throw new Error(`Knižnica „${name}“ je len na čítanie.`);
  };
  return {
    name,
    readOnly,
    list: async () => [...entries],
    get: async (id) => entries.find((e) => e.id === id),
    save: async (entry) => {
      guard();
      const i = entries.findIndex((e) => e.id === entry.id);
      if (i >= 0) entries[i] = entry;
      else entries.push(entry);
    },
    remove: async (id) => {
      guard();
      const i = entries.findIndex((e) => e.id === id);
      if (i >= 0) entries.splice(i, 1);
    },
  };
}

/** Položka knižnice z prierezu projektu (id položky = id prierezu). */
export const entryFromProfile = (profile: ProfileDefinition): LibraryEntry => ({
  id: profile.id,
  name: profile.name,
  ...(profile.typology !== undefined ? { typology: profile.typology } : {}),
  profile,
});

/** Kópia prierezu z knižnice do projektu: nové id, pri zhode mena poradové číslo „Doska (2)“. */
export function copyForProject(
  entry: LibraryEntry,
  existing: readonly ProfileDefinition[],
  id: string,
): ProfileDefinition {
  const names = new Set(existing.map((p) => p.name));
  let name = entry.name;
  for (let n = 2; names.has(name); n++) name = `${entry.name} (${n})`;
  // hlboká kópia (balík beží bez DOM, structuredClone nemusí byť v typoch k dispozícii)
  const copy = JSON.parse(JSON.stringify(entry.profile)) as ProfileDefinition;
  return { ...copy, id, name };
}
