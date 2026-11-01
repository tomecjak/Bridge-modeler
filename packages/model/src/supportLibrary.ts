import { z } from 'zod';
import type { ModelIssue } from './issues.ts';
import { type LibraryParseResult, parseLibraryFile } from './library.ts';
import { ExprSchema, type Support, SupportGeometrySchema, SupportSchema } from './types.ts';

/** Značka formátu súboru knižnice podpier (ADR 0019). */
export const SUPPORT_LIBRARY_FORMAT = 'bridge-modeler/support-library';

/**
 * Typ podpery (ADR 0019): druh, geometria, základ, uloženie, výška uloženia a založenie. Bez ložísk (pri vložení sa
 * odvodia z prierezu NK), posunu a terénu; kóta základovej škáry platí len na jednom mieste, preto typ nemá režim
 * `level`.
 */
export const SupportTypeSchema = z.object({
  kind: SupportSchema.shape.kind,
  geometry: SupportGeometrySchema,
  footing: SupportSchema.shape.footing,
  connection: SupportSchema.shape.connection,
  bearingHeight: ExprSchema,
  foundation: z.object({
    mode: z.enum(['terrain', 'height']),
    cover: ExprSchema,
    height: ExprSchema,
  }),
});
export type SupportType = z.infer<typeof SupportTypeSchema>;

/** Položka knižnice podpier; zodpovedá jednému riadku firemnej knižnice v D1. */
export const SupportLibraryEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string().optional(),
  support: SupportTypeSchema,
});
export type SupportLibraryEntry = z.infer<typeof SupportLibraryEntrySchema>;

export const SupportLibraryFileSchema = z.strictObject({
  format: z.literal(SUPPORT_LIBRARY_FORMAT),
  version: z.literal(1),
  entries: z.array(SupportLibraryEntrySchema),
});

/** Súbor knižnice podpier (JSON so stabilným poradím kľúčov podľa schémy). */
export function serializeSupportLibrary(entries: readonly SupportLibraryEntry[]): string {
  const file = SupportLibraryFileSchema.parse({
    format: SUPPORT_LIBRARY_FORMAT,
    version: 1,
    entries,
  });
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** Načíta súbor knižnice podpier; problémy vracia, nevyhadzuje. */
export function parseSupportLibrary(text: string): LibraryParseResult<SupportLibraryEntry> {
  const notALibrary: ModelIssue = { code: 'NotASupportLibrary' };
  return parseLibraryFile(text, SUPPORT_LIBRARY_FORMAT, SupportLibraryFileSchema, notALibrary);
}

// hlboká kópia (balík beží bez DOM, structuredClone nemusí byť v typoch k dispozícii)
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * Typ z podpery projektu (ADR 0019): bez ložísk, posunu a terénu. Podpera v režime kóty sa uloží v režime výšky
 * podpery s jej aktuálnou výškou `height` [m] (najnižšia), ak je známa.
 */
export function typeFromSupport(support: Support, height?: number): SupportType {
  const f = support.foundation;
  const mode = f.mode === 'level' ? 'height' : f.mode;
  const known = height !== undefined && Number.isFinite(height);
  return {
    kind: support.kind,
    geometry: clone(support.geometry),
    footing: { ...support.footing },
    connection: support.connection,
    bearingHeight: support.bearingHeight,
    foundation: {
      mode,
      cover: f.cover,
      height: f.mode === 'level' && known ? String(Math.round(height * 1000) / 1000) : f.height,
    },
  };
}

const NUMBER = /^\s*[-+]?(\d+\.?\d*|\.\d+)\s*$/;
const m = (v: number) => String(Math.round(v * 1000) / 1000);

/**
 * Podpera z typu na osi uloženia (ADR 0019): kópia typu s ložiskami z prierezu NK (prázdne = ±1,8 m). Opora dostane
 * dĺžku podľa šírky NK (aj dĺžku základu, ak základ má); stĺpy s počtom rovným počtu ložísk dostanú ich osovú
 * vzdialenosť. `level` = kóta základovej škáry pre prepnutie do režimu kóty.
 */
export function supportFromType(
  type: SupportType,
  input: {
    id: string;
    name: string;
    bearingLine: string;
    bearings: readonly number[];
    deckWidth?: number;
    level: string;
  },
): Support {
  const bearings = input.bearings.length > 0 ? [...input.bearings] : [-1.8, 1.8];
  let geometry = clone(type.geometry);
  let footing = { ...type.footing };
  if (geometry.type === 'abutment' && input.deckWidth !== undefined) {
    const length = String(Math.round(input.deckWidth * 10) / 10);
    geometry = { ...geometry, length };
    if (!(NUMBER.test(footing.thickness) && Number(footing.thickness) === 0))
      footing = { ...footing, length };
  }
  if (
    geometry.type === 'columns' &&
    NUMBER.test(geometry.count) &&
    Number(geometry.count) === bearings.length &&
    bearings.length >= 2
  ) {
    const sorted = [...bearings].sort((a, b) => a - b);
    const spacing = ((sorted.at(-1) as number) - (sorted[0] as number)) / (sorted.length - 1);
    geometry = { ...geometry, spacing: m(spacing) };
  }
  return {
    id: input.id,
    name: input.name,
    kind: type.kind,
    bearingLine: input.bearingLine,
    offset: '0',
    geometry,
    footing,
    connection: type.connection,
    bearingHeight: type.bearingHeight,
    bearings: bearings.map(m),
    foundation: { ...type.foundation, level: input.level },
  };
}
