import { z } from 'zod';
import { CurveRefSchema, ExprSchema } from './types.ts';

/** Druh prekážky pod mostom (ADR 0020). */
export const ObstacleKindSchema = z.enum([
  'road',
  'railway',
  'water',
  'fieldRoad',
  'footpath',
  'other',
]);
export type ObstacleKind = z.infer<typeof ObstacleKindSchema>;

/**
 * Voľný prierez v reze kolmo na os prekážky (ADR 0020): šírka vľavo a vpravo od osi, výška zvislo, spodok aj vrch
 * sklonené od osi (kladný sklon = klesá od osi), skosenie horných rohov (vodorovne aj zvislo). Výrazy v m.
 */
export const ClearanceSchema = z.object({
  left: ExprSchema,
  right: ExprSchema,
  height: ExprSchema,
  slopeLeft: ExprSchema,
  slopeRight: ExprSchema,
  chamfer: ExprSchema,
});
export type Clearance = z.infer<typeof ClearanceSchema>;

/**
 * Prekážka (ADR 0020): podklad projektu s osou (krivka alebo ručné kríženie na km osi cesty pod uhlom kríženia),
 * úrovňou spodku voľného prierezu v osi prekážky a voľným prierezom.
 */
export const ObstacleSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  kind: ObstacleKindSchema,
  reference: z.discriminatedUnion('type', [
    z.object({ type: z.literal('curve'), curve: CurveRefSchema }),
    /** priamka cez bod osi cesty na zobrazovanom staničení, otočená o uhol kríženia [°] (konvencia ADR 0008) */
    z.object({
      type: z.literal('station'),
      alignment: z.string(),
      station: z.number(),
      angle: ExprSchema,
    }),
  ]),
  level: z.discriminatedUnion('kind', [
    /** niveleta osi prekážky z LandXML */
    z.object({ kind: z.literal('grade') }),
    /** výška čiary meračky (ADR 0021) */
    z.object({ kind: z.literal('line') }),
    /** kóta [m n. m.], napr. temeno koľajnice alebo Q100 */
    z.object({ kind: z.literal('constant'), value: ExprSchema }),
  ]),
  clearance: ClearanceSchema,
});
export type Obstacle = z.infer<typeof ObstacleSchema>;

/** Predvoľba voľného prierezu (ADR 0020); hodnoty sú zástupné, kým ich projektant nepotvrdí. */
export interface ClearancePreset {
  key: string;
  kind: ObstacleKind;
  clearance: Clearance;
}

const preset = (
  key: string,
  kind: ObstacleKind,
  height: string,
  width: string,
  slope = '0',
  chamfer = '0',
): ClearancePreset => ({
  key,
  kind,
  clearance: {
    left: width,
    right: width,
    height,
    slopeLeft: slope,
    slopeRight: slope,
    chamfer,
  },
});

/** Zástupné predvoľby voľných prierezov podľa druhu prekážky (ADR 0020, PLAN.md Otvorené otázky). */
export const CLEARANCE_PRESETS: readonly ClearancePreset[] = [
  preset('road', 'road', '4.8', '5.5', '0.025'),
  preset('fieldRoad', 'fieldRoad', '4.2', '3'),
  preset('footpath', 'footpath', '2.5', '1.5'),
  preset('railwayElectric', 'railway', '6.5', '2.5', '0', '0.5'),
  preset('railway', 'railway', '5', '2.5', '0', '0.5'),
  preset('water', 'water', '0.5', '10'),
  preset('other', 'other', '4', '3'),
];

/** Prvá predvoľba druhu prekážky. */
export function defaultClearance(kind: ObstacleKind): Clearance {
  const p = CLEARANCE_PRESETS.find((x) => x.kind === kind) ?? CLEARANCE_PRESETS[0];
  return { ...(p as ClearancePreset).clearance };
}
