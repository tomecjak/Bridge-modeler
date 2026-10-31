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

export type LibraryParseResult =
  | { ok: true; entries: LibraryEntry[] }
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

/** Načíta súbor knižnice prierezov; problémy vracia, nevyhadzuje. */
export function parseLibrary(text: string): LibraryParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return {
      ok: false,
      issues: [{ code: 'InvalidJson', detail: e instanceof Error ? e.message : String(e) }],
    };
  }
  if (
    typeof raw !== 'object' ||
    raw === null ||
    (raw as { format?: unknown }).format !== PROFILE_LIBRARY_FORMAT
  ) {
    return { ok: false, issues: [{ code: 'NotAProfileLibrary' }] };
  }
  const parsed = ProfileLibraryFileSchema.safeParse(raw);
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

/**
 * Knižnica prierezov — asynchrónne rozhranie, aby sa za ním dala neskôr schovať aj databáza (Cloudflare D1 / Worker
 * API) bez zmeny volajúcich. Implementácie: zabudované šablóny (len na čítanie), prierezy projektu, súbor.
 */
export interface ProfileLibrary {
  readonly name: string;
  readonly readOnly: boolean;
  list(): Promise<LibraryEntry[]>;
  get(id: string): Promise<LibraryEntry | undefined>;
  /** pridá položku alebo nahradí položku s rovnakým `id` (na jej mieste) */
  save(entry: LibraryEntry): Promise<void>;
  remove(id: string): Promise<void>;
}

/** Knižnica v pamäti (zabudované šablóny, importovaný súbor); poradie položiek je poradie pridania. */
export function memoryLibrary(
  name: string,
  initial: readonly LibraryEntry[],
  options: { readOnly?: boolean } = {},
): ProfileLibrary {
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
