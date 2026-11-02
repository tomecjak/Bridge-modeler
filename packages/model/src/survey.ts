import { z } from 'zod';

/** Bod meračky v lokálnych súradniciach projektu [m], zaokrúhlený na mm; bez výšky, ak ju text neurčil. */
export const SurveyPointSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number().optional(),
  number: z.string().optional(),
  code: z.string().optional(),
});
export type SurveyPoint = z.infer<typeof SurveyPointSchema>;

/** Vrchol čiary meračky; výšku má len vrchol v zameranom bode (ADR 0021). */
export const SurveyVertexSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number().optional(),
});
export type SurveyVertex = z.infer<typeof SurveyVertexSchema>;

/** Čiara meračky; `id` je stabilné v rámci meračky (L1, L2, … v poradí súboru). */
export const SurveyLineSchema = z.object({
  id: z.string().min(1),
  layer: z.string(),
  points: z.array(SurveyVertexSchema),
  closed: z.boolean(),
});
export type SurveyLine = z.infer<typeof SurveyLineSchema>;

/**
 * Meračka (zameranie existujúceho stavu) z DXF (ADR 0021): 2D podklad s výškami bodov, orezaný pri importe na koridor
 * okolo mosta. Pôvodný súbor sa neukladá, hladiny zvolené pri importe áno (pre opätovný import).
 */
export const SurveySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  /** meno pôvodného súboru DXF */
  file: z.string(),
  layers: z.object({
    points: z.array(z.string()),
    heights: z.array(z.string()),
    numbers: z.array(z.string()),
    codes: z.array(z.string()),
    lines: z.array(z.string()),
  }),
  points: z.array(SurveyPointSchema),
  lines: z.array(SurveyLineSchema),
});
export type Survey = z.infer<typeof SurveySchema>;

/** Meno čiary meračky v UI a v hláseniach: meračka, hladina a poradie čiary na hladine („Meračka: asfalt 2“). */
export function surveyLineName(survey: Survey, lineId: string): string {
  const i = survey.lines.findIndex((l) => l.id === lineId);
  const line = survey.lines[i];
  if (!line) return `${survey.name}: ${lineId}`;
  const n = survey.lines.slice(0, i + 1).filter((l) => l.layer === line.layer).length;
  return `${survey.name}: ${line.layer} ${n}`;
}
