import { z } from 'zod';

/** Výraz parametra (ADR 0006): dĺžky v m, uhly v °, sklony v m/m. */
export const ExprSchema = z.string();

export const ParameterUnitSchema = z.enum(['length', 'angle', 'slope', 'none']);
export type ParameterUnit = z.infer<typeof ParameterUnitSchema>;

export const SegmentShapeSchema = z.enum(['linear', 'parabolic', 'circular']);
export type SegmentShape = z.infer<typeof SegmentShapeSchema>;

/** Úsek staničnej funkcie; `from`, `to` sú zobrazované staničenia [m] (ADR 0006). */
export const SegmentSchema = z.object({
  from: z.number(),
  to: z.number(),
  v0: ExprSchema,
  v1: ExprSchema,
  shape: SegmentShapeSchema,
  /** koniec úseku s vodorovnou dotyčnicou (pre parabolic a circular) */
  vertexAt: z.enum(['start', 'end']).optional(),
});
export type Segment = z.infer<typeof SegmentSchema>;

export const StationFunctionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('constant'), value: ExprSchema }),
  z.object({ kind: z.literal('piecewise'), segments: z.array(SegmentSchema) }),
  /** výraz s premennou `sta` = zobrazované staničenie [m] */
  z.object({ kind: z.literal('expression'), expr: ExprSchema }),
]);
export type StationFunction = z.infer<typeof StationFunctionSchema>;

export const ParameterSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  unit: ParameterUnitSchema,
  law: StationFunctionSchema,
  description: z.string().optional(),
});
export type Parameter = z.infer<typeof ParameterSchema>;

/** Premenná vo výrazoch so zobrazovaným staničením. */
export const STATION_VARIABLE = 'sta';
