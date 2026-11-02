import { z } from 'zod';
import type { Superstructure } from './types.ts';

/** Druh mosta v zadaní (Fáza 10a). */
export const BridgeTypeSchema = z.enum(['road', 'railway', 'footbridge', 'ecoduct']);
export type BridgeType = z.infer<typeof BridgeTypeSchema>;

/** Zadanie projektu (Fáza 10a): stavba, objekt, kto projektuje a čo sa prevádza cez most. */
export const BriefSchema = z.object({
  construction: z.object({ number: z.string(), name: z.string() }),
  object: z.object({ number: z.string(), name: z.string() }),
  /** objednávateľ (investor) */
  client: z.string(),
  responsibleDesigner: z.string(),
  /** vypracoval */
  designer: z.string(),
  bridgeType: BridgeTypeSchema.nullable(),
  /** popis premosťovanej prekážky */
  obstacle: z.string(),
  /** kategória prevádzanej cesty, napr. „C 9,5/70“ (STN 73 6102) */
  roadCategory: z.string(),
  /** voľná šírka na moste [m]; null = voľná šírka b z označenia kategórie */
  freeWidth: z.number().positive().nullable(),
});
export type Brief = z.infer<typeof BriefSchema>;

/** Oblasť mosta (Fáza 10a): úsek osi cesty v zobrazovanom staničení, okolo ktorého sa navrhuje most. */
export const StudyAreaSchema = z.object({
  /** názov osi cesty (AlignmentData.name) */
  alignment: z.string(),
  from: z.number(),
  to: z.number(),
});
export type StudyArea = z.infer<typeof StudyAreaSchema>;

export function emptyBrief(): Brief {
  return {
    construction: { number: '', name: '' },
    object: { number: '', name: '' },
    client: '',
    responsibleDesigner: '',
    designer: '',
    bridgeType: null,
    obstacle: '',
    roadCategory: '',
    freeWidth: null,
  };
}

/**
 * Návrhy kategórií pre výber v zadaní. *Predpoklad* do dodania tabuľky z noriem (PLAN.md, Otvorené otázky);
 * kategória sa dá zadať aj ľubovoľným textom.
 */
export const ROAD_CATEGORY_SUGGESTIONS: readonly string[] = [
  'C 7,5/60',
  'C 9,5/70',
  'C 11,5/80',
  'R 22,5/100',
  'R 24,5/120',
  'D 26,5/120',
];

export interface RoadCategory {
  /** písmenové označenie (D, R, C, MZ, …) */
  letter: string;
  /** voľná šírka b [m] z čitateľa označenia */
  b: number;
  /** návrhová rýchlosť [km/h] z menovateľa, ak je uvedená */
  speed?: number;
}

const CATEGORY = /^([A-Za-z]+)\s*(\d+(?:[.,]\d+)?)\s*(?:\/\s*(\d+))?$/;

/** Rozoberie označenie kategórie cesty v tvare „C 9,5/70“ (aj „C9.5“); neplatné → undefined. */
export function parseRoadCategory(code: string): RoadCategory | undefined {
  const m = CATEGORY.exec(code.trim());
  const letter = m?.[1];
  const width = m?.[2];
  const speed = m?.[3];
  if (letter === undefined || width === undefined) return undefined;
  const b = Number(width.replace(',', '.'));
  if (!(b > 0)) return undefined;
  return speed === undefined
    ? { letter: letter.toUpperCase(), b }
    : { letter: letter.toUpperCase(), b, speed: Number(speed) };
}

/** Voľná šírka na moste [m]: ručná hodnota zo zadania, inak b z kategórie; undefined, ak sa nedá určiť. */
export function effectiveFreeWidth(brief: Pick<Brief, 'freeWidth' | 'roadCategory'>) {
  return brief.freeWidth ?? parseRoadCategory(brief.roadCategory)?.b;
}

/**
 * Požadovaná voľná šírka na NK [m] (ADR 0023): hodnota pri NK, inak voľná šírka zo zadania; undefined, ak sa nedá
 * určiť.
 */
export function requiredFreeWidth(
  sup: Pick<Superstructure, 'freeWidth'>,
  brief: Pick<Brief, 'freeWidth' | 'roadCategory'> | undefined,
): { value: number; source: 'deck' | 'brief' } | undefined {
  if (sup.freeWidth !== undefined) return { value: sup.freeWidth, source: 'deck' };
  const value = brief && effectiveFreeWidth(brief);
  return value === undefined ? undefined : { value, source: 'brief' };
}
