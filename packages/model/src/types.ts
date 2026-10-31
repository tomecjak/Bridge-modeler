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
  /**
   * Opora (ADR 0010): úložný prah, voliteľný driek, záverný múrik a krídla. Hrúbky a šírky kolmo na os podpery,
   * vzdialenosti od osi ložísk kladné smerom do poľa.
   */
  z.object({
    type: z.literal('abutment'),
    /** dĺžka pozdĺž osi podpery (medzi vonkajšími lícami krídel) */
    length: ExprSchema,
    /** šírka úložného prahu */
    seatLength: ExprSchema,
    /** výška prahu pod hornou hranou podpery */
    seatHeight: ExprSchema,
    /** predná líca prahu od osi ložísk */
    frontOffset: ExprSchema,
    /** hrúbka drieku pod prahom (driek vznikne, len ak je základ nižšie ako spodok prahu) */
    stemThickness: ExprSchema,
    /** hrúbka záverného múrika */
    backwallThickness: ExprSchema,
    /** medzera medzi koncom NK a záverným múrikom, meraná v osi mosta */
    gap: ExprSchema,
    wings: z.object({
      /** uhol od osi mosta [°], + roztvorené von; 0 = rovnobežné s osou mosta */
      angle: ExprSchema,
      /** dĺžka od zadnej líce opory pozdĺž krídla */
      length: ExprSchema,
      thickness: ExprSchema,
      /** zavesené krídlo (spodná hrana stúpa ku koncu) alebo založené na základe opory */
      support: z.enum(['hung', 'founded']),
      /** výška zaveseného krídla na voľnom konci */
      endHeight: ExprSchema,
    }),
  }),
]);
export type SupportGeometry = z.infer<typeof SupportGeometrySchema>;
export type AbutmentGeometry = Extract<SupportGeometry, { type: 'abutment' }>;

/** Predvolená opora podľa vzorového mosta 212-00 (ADR 0010); `length` doplní volajúci podľa šírky NK. */
export function defaultAbutmentGeometry(length = '12'): AbutmentGeometry {
  return {
    type: 'abutment',
    length,
    seatLength: '2.05',
    seatHeight: '1.1',
    frontOffset: '0.9',
    stemThickness: '1.2',
    backwallThickness: '0.5',
    gap: '0.08',
    wings: { angle: '0', length: '4', thickness: '0.6', support: 'hung', endHeight: '1.5' },
  };
}

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
  /** základ; hrúbka 0 = bez základu (napr. prah na pilótach, pilóty sa nemodelujú) */
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

/**
 * Terén (ADR 0011): povrch orezaný na koridor okolo osi mosta, v lokálnych súradniciach projektu zaokrúhlených na mm.
 * TIN (body x, y, z za sebou + trojice indexov) alebo mriežka rastra (stredy buniek, úseky riadkov vnútri koridoru).
 */
export const TerrainDataSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('tin'),
    points: z.array(z.number()),
    triangles: z.array(z.number().int().nonnegative()),
  }),
  z.object({
    kind: z.literal('grid'),
    /** stred bunky [0, 0] a krok mriežky v smere E (dx) a N (dy) [m] */
    x0: z.number(),
    y0: z.number(),
    dx: z.number().positive(),
    dy: z.number().positive(),
    /** súvislé úseky riadku `row` od stĺpca `col` (bunka [row, col] má stred x0 + col·dx, y0 + row·dy) */
    runs: z.array(
      z.object({ row: z.number().int(), col: z.number().int(), z: z.array(z.number()) }),
    ),
  }),
]);
export type TerrainData = z.infer<typeof TerrainDataSchema>;

export const TerrainSurfaceSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  /** súbor z Civil 3D, súbor DMR alebo DMR 5.0 stiahnutý zo služby ZBGIS (ÚGKK) */
  source: z.enum(['landxml', 'geotiff', 'zbgis']),
  /** povinné uvedenie zdroja (napr. „DMR 5.0 © ÚGKK SR, CC BY 4.0“) */
  attribution: z.string().optional(),
  /** koridor použitý pri orezaní: pol šírky okolo osi cesty a presah za NK [m] */
  corridor: z.object({ halfWidth: z.number(), margin: z.number() }),
  data: TerrainDataSchema,
});
export type TerrainSurface = z.infer<typeof TerrainSurfaceSchema>;
