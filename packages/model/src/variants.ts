import { z } from 'zod';
import type { ProjectFile } from './schema.ts';
import {
  BearingLineSchema,
  BridgeAxisSchema,
  EdgeBeamSchema,
  type Parameter,
  ProfileDefinitionSchema,
  type StationFunction,
  StationFunctionSchema,
  SuperstructureSchema,
  SupportSchema,
} from './types.ts';

/** Kolekcie prvkov mosta, ktoré má každý variant vlastné (ADR 0024); ostatné časti projektu sú spoločné. */
export const VARIANT_COLLECTIONS = [
  'bridgeAxes',
  'profiles',
  'superstructures',
  'edgeBeams',
  'bearingLines',
  'supports',
] as const;
export type VariantCollection = (typeof VARIANT_COLLECTIONS)[number];

export const VariantElementsSchema = z.strictObject({
  bridgeAxes: z.array(BridgeAxisSchema),
  profiles: z.array(ProfileDefinitionSchema),
  superstructures: z.array(SuperstructureSchema),
  edgeBeams: z.array(EdgeBeamSchema),
  bearingLines: z.array(BearingLineSchema),
  supports: z.array(SupportSchema),
});
export type VariantElements = z.infer<typeof VariantElementsSchema>;

/**
 * Variant návrhu mosta (ADR 0024). Aktívny variant má prvky na najvyššej úrovni projektu (pracovná kópia), neaktívne
 * ich majú uložené v `elements`.
 */
export const VariantSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  /** prepísané priebehy globálnych parametrov vo variante (id parametra → priebeh) */
  parameters: z.record(z.string(), StationFunctionSchema),
  /** prvky neaktívneho variantu; aktívny ich nemá */
  elements: VariantElementsSchema.optional(),
});
export type Variant = z.infer<typeof VariantSchema>;

/** id prvého variantu nového projektu aj projektu z migrácie 15 → 16 */
export const DEFAULT_VARIANT_ID = 'variant-a';

export const defaultVariant = (): Variant => ({
  id: DEFAULT_VARIANT_ID,
  name: 'Variant A',
  parameters: {},
});

type VariantState = Pick<ProjectFile, 'variants' | 'activeVariant'>;

/**
 * Problémy zoznamu variantov pre schému: jedinečné id, aktívny variant existuje a nemá `elements`, ostatné ich majú.
 * Vracia správy s cestou (index variantu), prázdne = v poriadku.
 */
export function variantStateIssues(p: VariantState): { path: PropertyKey[]; message: string }[] {
  const issues: { path: PropertyKey[]; message: string }[] = [];
  const ids = new Set<string>();
  p.variants.forEach((v, i) => {
    if (ids.has(v.id))
      issues.push({ path: ['variants', i, 'id'], message: 'duplicate variant id' });
    ids.add(v.id);
    const active = v.id === p.activeVariant;
    if (active && v.elements)
      issues.push({ path: ['variants', i, 'elements'], message: 'active variant has elements' });
    if (!active && !v.elements)
      issues.push({
        path: ['variants', i, 'elements'],
        message: 'inactive variant lacks elements',
      });
  });
  if (!ids.has(p.activeVariant))
    issues.push({ path: ['activeVariant'], message: 'unknown active variant' });
  return issues;
}

/** Aktívny variant (schéma zaručí, že existuje). */
export function activeVariantOf(p: VariantState): Variant {
  return (p.variants.find((v) => v.id === p.activeVariant) ?? p.variants[0]) as Variant;
}

/** Prvky mosta aktívneho variantu (kolekcie z najvyššej úrovne projektu, bez kópie). */
export function variantElements(p: Pick<ProjectFile, VariantCollection>): VariantElements {
  return {
    bridgeAxes: p.bridgeAxes,
    profiles: p.profiles,
    superstructures: p.superstructures,
    edgeBeams: p.edgeBeams,
    bearingLines: p.bearingLines,
    supports: p.supports,
  };
}

/**
 * Projekt s variantom `id` ako aktívnym (ADR 0024): jeho prvky na najvyššej úrovni, prvky doterajšieho aktívneho
 * variantu v jeho `elements`. Podklady a parametre sú tie isté objekty; pre aktívny variant (alebo neznámy) vráti
 * `project`.
 */
export function variantProject(project: ProjectFile, id: string): ProjectFile {
  const next = project.variants.find((v) => v.id === id);
  if (!next?.elements || id === project.activeVariant) return project;
  const stored = variantElements(project);
  return {
    ...project,
    ...next.elements,
    activeVariant: id,
    variants: project.variants.map((v) => {
      if (v.id === project.activeVariant) return { ...v, elements: stored };
      if (v.id !== id) return v;
      const { elements: _elements, ...rest } = v;
      return rest;
    }),
  };
}

const effective = new WeakMap<
  readonly Parameter[],
  WeakMap<Readonly<Record<string, StationFunction>>, readonly Parameter[]>
>();

/**
 * Globálne parametre s prepismi aktívneho variantu (ADR 0024). Bez prepisov vráti `parameters`; výsledok je pri tých
 * istých vstupoch ten istý objekt (cache podľa identity, immer zachová nezmenené časti).
 */
export function effectiveParameters(
  p: Pick<ProjectFile, 'parameters' | 'variants' | 'activeVariant'>,
): readonly Parameter[] {
  const overrides = activeVariantOf(p).parameters;
  if (Object.keys(overrides).length === 0) return p.parameters;
  let byOverrides = effective.get(p.parameters);
  if (!byOverrides) {
    byOverrides = new WeakMap();
    effective.set(p.parameters, byOverrides);
  }
  let list = byOverrides.get(overrides);
  if (!list) {
    list = p.parameters.map((x) => {
      const law = overrides[x.id];
      return law ? { ...x, law } : x;
    });
    byOverrides.set(overrides, list);
  }
  return list;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Prvé voľné meno „Variant B“, „Variant C“, …; po Z „Variant 27“, … */
export function nextVariantName(variants: readonly Pick<Variant, 'name'>[]): string {
  const names = new Set(variants.map((v) => v.name));
  for (const c of LETTERS) if (!names.has(`Variant ${c}`)) return `Variant ${c}`;
  let i = LETTERS.length + 1;
  while (names.has(`Variant ${i}`)) i++;
  return `Variant ${i}`;
}
