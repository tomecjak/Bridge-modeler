import { z } from 'zod';
import { BriefSchema, emptyBrief, StudyAreaSchema } from './brief.ts';
import {
  BearingLineSchema,
  BridgeAxisSchema,
  ParameterSchema,
  PlanLineSchema,
  ProfileDefinitionSchema,
  SuperstructureSchema,
  SupportSchema,
  TerrainSurfaceSchema,
} from './types.ts';

/** Aktuálna verzia schémy projektového súboru; staršie sa pri otvorení migrujú (migrations.ts). */
export const SCHEMA_VERSION = '9';

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

export const ProjectFileSchema = z.strictObject({
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
  bearingLines: z.array(BearingLineSchema),
  supports: z.array(SupportSchema),
  terrains: z.array(TerrainSurfaceSchema),
  planLines: z.array(PlanLineSchema),
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
    bearingLines: [],
    supports: [],
    terrains: [],
    planLines: [],
  };
}
