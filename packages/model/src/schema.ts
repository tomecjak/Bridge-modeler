import { z } from 'zod';
import { BriefSchema, emptyBrief, StudyAreaSchema } from './brief.ts';
import { ObstacleSchema } from './obstacles.ts';
import { SurveySchema } from './survey.ts';
import {
  BearingLineSchema,
  BridgeAxisSchema,
  EdgeBeamSchema,
  ParameterSchema,
  PlanLineSchema,
  ProfileDefinitionSchema,
  SuperstructureSchema,
  SupportSchema,
  TerrainSurfaceSchema,
} from './types.ts';
import { defaultVariant, VariantSchema, variantStateIssues } from './variants.ts';

/** Aktuálna verzia schémy projektového súboru; staršie sa pri otvorení migrujú (migrations.ts). */
export const SCHEMA_VERSION = '16';

const Vec2Schema = z.object({ x: z.number(), y: z.number() });
const Vec3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() });
const RotationSchema = z.enum(['cw', 'ccw']);

/** Zrkadlí `AlignmentData` z `@bridge/alignment` (zhodu typov stráži test). */
export const AlignmentDataSchema = z.object({
  name: z.string(),
  staStart: z.number(),
  length: z.number(),
  horizontal: z.array(
    z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('line'), length: z.number(), start: Vec2Schema, end: Vec2Schema }),
      z.object({
        kind: z.literal('arc'),
        length: z.number(),
        start: Vec2Schema,
        end: Vec2Schema,
        center: Vec2Schema,
        radius: z.number(),
        rotation: RotationSchema,
      }),
      z.object({
        kind: z.literal('spiral'),
        spiralType: z.literal('clothoid'),
        length: z.number(),
        start: Vec2Schema,
        end: Vec2Schema,
        startAzimuth: z.number(),
        radiusStart: z.number().nullable(),
        radiusEnd: z.number().nullable(),
        rotation: RotationSchema,
      }),
    ]),
  ),
  stationEquations: z.array(
    z.object({ staInternal: z.number(), staBack: z.number(), staAhead: z.number() }),
  ),
  /** klopenie z LandXML (ADR 0022); staničenia staStart + s, sklon v % */
  superelevation: z
    .array(
      z.object({
        staStart: z.number(),
        staEnd: z.number(),
        beginRunout: z.number().optional(),
        beginRunoff: z.number().optional(),
        fullSuper: z.number().optional(),
        fullSuperelev: z.number().optional(),
        runoff: z.number().optional(),
        startOfRunout: z.number().optional(),
        endOfRunout: z.number().optional(),
      }),
    )
    .optional(),
  profiles: z.array(
    z.object({
      name: z.string(),
      pvis: z.array(
        z.object({
          station: z.number(),
          elevation: z.number(),
          curve: z
            .discriminatedUnion('kind', [
              z.object({ kind: z.literal('parabolic'), length: z.number() }),
              z.object({ kind: z.literal('circular'), length: z.number(), radius: z.number() }),
            ])
            .optional(),
        }),
      ),
    }),
  ),
});

export const ProjectFileSchema = z
  .strictObject({
    schemaVersion: z.literal(SCHEMA_VERSION),
    name: z.string(),
    brief: BriefSchema,
    crs: z.object({
      epsg: z.literal(5514),
      /** lokálny počiatok v EPSG:5514 / Bpv; null, kým nie je importovaná os (ADR 0003) */
      origin: Vec3Schema.nullable(),
    }),
    alignments: z.array(AlignmentDataSchema),
    /** oblasť mosta na osi cesty; null, kým ju projektant nevyznačí */
    studyArea: StudyAreaSchema.nullable(),
    parameters: z.array(ParameterSchema),
    bridgeAxes: z.array(BridgeAxisSchema),
    profiles: z.array(ProfileDefinitionSchema),
    superstructures: z.array(SuperstructureSchema),
    /** rímsy na okrajoch NK (ADR 0023) */
    edgeBeams: z.array(EdgeBeamSchema),
    bearingLines: z.array(BearingLineSchema),
    supports: z.array(SupportSchema),
    terrains: z.array(TerrainSurfaceSchema),
    planLines: z.array(PlanLineSchema),
    /** prekážky pod mostom (ADR 0020) */
    obstacles: z.array(ObstacleSchema),
    /** meračky z DXF (ADR 0021) */
    surveys: z.array(SurveySchema),
    /** varianty návrhu mosta (ADR 0024): prvky aktívneho sú na najvyššej úrovni, ostatných vo `variants[].elements` */
    variants: z.array(VariantSchema).min(1),
    activeVariant: z.string(),
  })
  .superRefine((p, ctx) => {
    for (const issue of variantStateIssues(p)) ctx.addIssue({ code: 'custom', ...issue });
  });

export type ProjectFile = z.infer<typeof ProjectFileSchema>;

export function createEmptyProject(name: string): ProjectFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    name,
    brief: emptyBrief(),
    crs: { epsg: 5514, origin: null },
    alignments: [],
    studyArea: null,
    parameters: [],
    bridgeAxes: [],
    profiles: [],
    superstructures: [],
    edgeBeams: [],
    bearingLines: [],
    supports: [],
    terrains: [],
    planLines: [],
    obstacles: [],
    surveys: [],
    variants: [defaultVariant()],
    activeVariant: defaultVariant().id,
  };
}
