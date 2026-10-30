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

/** Os mosta = posun osi cesty (ADR 0007). Posuny v m; predvolene h = 0, v = −hrúbka vozovky. */
export const BridgeAxisSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  /** názov osi cesty (AlignmentData.name) */
  alignment: z.string(),
  /** vodorovný posun, + vpravo v smere staničenia [m] */
  horizontalOffset: StationFunctionSchema,
  /** zvislý posun od nivelety, + nahor [m] */
  verticalOffset: StationFunctionSchema,
});
export type BridgeAxis = z.infer<typeof BridgeAxisSchema>;

export const ProfileParameterSchema = z.object({
  name: z.string(),
  unit: ParameterUnitSchema,
  /** predvolená hodnota (výraz; môže odkazovať na globálne parametre) */
  default: ExprSchema,
  description: z.string().optional(),
});
export type ProfileParameter = z.infer<typeof ProfileParameterSchema>;

export const ProfilePointSchema = z.object({ name: z.string(), x: ExprSchema, y: ExprSchema });
export type ProfilePoint = z.infer<typeof ProfilePointSchema>;

export const ProfileLoopSchema = z.object({
  name: z.string(),
  role: z.enum(['outer', 'void']),
  points: z.array(z.string()),
});
export type ProfileLoop = z.infer<typeof ProfileLoopSchema>;

/** Parametrický prierez (ADR 0007): rámec x vpravo, y nahor [m], referenčný bod leží na osi mosta. */
export const ProfileDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  parameters: z.array(ProfileParameterSchema),
  points: z.array(ProfilePointSchema),
  loops: z.array(ProfileLoopSchema),
  referencePoint: z.string(),
  /** typológia NK podľa VŠB (napr. 'singleBeamHaunched') — pre informatívne ekonomické rozpätie */
  typology: z.string().optional(),
});
export type ProfileDefinition = z.infer<typeof ProfileDefinitionSchema>;

/** Nosná konštrukcia: prierez vedený po osi mosta v rozsahu from–to (zobrazované staničenie). */
export const SuperstructureSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  bridgeAxis: z.string(),
  from: z.number(),
  to: z.number(),
  profile: z.string(),
  /** priebehy parametrov profilu po staničení; chýbajúce = predvolená hodnota profilu */
  parameterLaws: z.record(z.string(), StationFunctionSchema),
  orientation: z.enum(['vertical', 'normalToGrade']),
});
export type Superstructure = z.infer<typeof SuperstructureSchema>;

/** Geometria podpery (ADR 0008); rozmery sú výrazy v m. */
export const SupportGeometrySchema = z.discriminatedUnion('type', [
  /** stenový pilier: hrúbka (kolmo na os podpery), dĺžka (pozdĺž osi podpery) */
  z.object({ type: z.literal('wall'), thickness: ExprSchema, length: ExprSchema }),
  /** pilier zo stĺpov: kruh (priemer) alebo obdĺžnik (šírka pozdĺž osi podpery × hĺbka), počet, osová vzdialenosť */
  z.object({
    type: z.literal('columns'),
    shape: z.enum(['circle', 'rect']),
    diameter: ExprSchema,
    width: ExprSchema,
    depth: ExprSchema,
    count: ExprSchema,
    spacing: ExprSchema,
  }),
  /** zjednodušená opora: úložný prah (šírka v smere osi mosta), hrúbka drieku, dĺžka pozdĺž osi podpery */
  z.object({
    type: z.literal('abutment'),
    seatLength: ExprSchema,
    stemThickness: ExprSchema,
    length: ExprSchema,
  }),
]);
export type SupportGeometry = z.infer<typeof SupportGeometrySchema>;

/** Podpera (ADR 0008): patrí jednej NK, leží na jej osi mosta. */
export const SupportSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  kind: z.enum(['abutment', 'pier']),
  superstructure: z.string(),
  /** zobrazované staničenie */
  station: z.number(),
  /** uhol kríženia [°], 90 = kolmá; od osi mosta v smere staničenia proti smeru hodín */
  crossingAngle: ExprSchema,
  /** posun stredu podpery kolmo od osi NK [m], + vpravo */
  offset: ExprSchema,
  geometry: SupportGeometrySchema,
  footing: z.object({ length: ExprSchema, width: ExprSchema, thickness: ExprSchema }),
  connection: z.enum(['bearing', 'hinge', 'fixed']),
  /** výška uloženia [m] (ložisko + podložiskový blok) */
  bearingHeight: ExprSchema,
  /** priečne vzdialenosti ložísk od osi NK [m], + vpravo */
  bearings: z.array(ExprSchema),
  /** horná hrana základu [m n. m.] */
  foundationTop: ExprSchema,
});
export type Support = z.infer<typeof SupportSchema>;
