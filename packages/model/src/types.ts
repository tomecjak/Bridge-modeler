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

/** Vstavané meno vo výrazoch NK: požadovaná voľná šírka na NK [m] (pri NK, inak zo zadania; ADR 0023). */
export const FREE_WIDTH_VARIABLE = 'volnaSirka';

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

/** Čiara v pôdoryse (napr. okraj NK) v lokálnych súradniciach projektu [m], zaokrúhlená na mm. */
export const PlanLineSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  points: z.array(z.object({ x: z.number(), y: z.number() })),
});
export type PlanLine = z.infer<typeof PlanLineSchema>;

/** Krivka v pôdoryse: os cesty z LandXML (podľa názvu), čiara v pôdoryse (podľa id) alebo čiara meračky (ADR 0021). */
export const CurveRefSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('alignment'), name: z.string() }),
  z.object({ type: z.literal('planLine'), id: z.string() }),
  z.object({ type: z.literal('survey'), survey: z.string(), line: z.string() }),
]);
export type CurveRef = z.infer<typeof CurveRefSchema>;

/**
 * Okraj podľa krivky: vodorovná vzdialenosť od osi mosta ku krivke meraná kolmo na os mosta (v rovine prierezu),
 * kladná na stranu `side`, plus prídavok `add` [m] (výraz, môže sa meniť so `sta`).
 */
export const EdgeLawSchema = z.object({
  kind: z.literal('edge'),
  curve: CurveRefSchema,
  side: z.enum(['left', 'right']),
  add: ExprSchema,
});
export type EdgeLaw = z.infer<typeof EdgeLawSchema>;

/** Priebeh parametra profilu v NK: staničná funkcia alebo okraj podľa krivky. */
export const ProfileLawSchema = z.discriminatedUnion('kind', [
  ...StationFunctionSchema.options,
  EdgeLawSchema,
]);
export type ProfileLaw = z.infer<typeof ProfileLawSchema>;

/**
 * Koniec NK (ADR 0018): `abutment` = odvodený z opory na krajnej osi uloženia (bez opory platí od / do),
 * `manual` = zadané od / do.
 */
export const DeckEndModeSchema = z.enum(['abutment', 'manual']);
export type DeckEndMode = z.infer<typeof DeckEndModeSchema>;

/** Nosná konštrukcia: prierez vedený po osi mosta v rozsahu from–to (zobrazované staničenie). */
export const SuperstructureSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  bridgeAxis: z.string(),
  /** začiatok a koniec NK; pri koncoch odvodených z opory ich aplikácia udržiava v súlade s oporami */
  from: z.number(),
  to: z.number(),
  /** režim koncov NK (ADR 0018); chýba = oba odvodené z opory */
  ends: z.object({ start: DeckEndModeSchema, end: DeckEndModeSchema }).optional(),
  profile: z.string(),
  /** priebehy parametrov profilu po staničení; chýbajúce = predvolená hodnota profilu */
  parameterLaws: z.record(z.string(), ProfileLawSchema),
  orientation: z.enum(['vertical', 'normalToGrade']),
  /** požadovaná voľná šírka na NK [m] (ADR 0023); chýba = voľná šírka zo zadania */
  freeWidth: z.number().positive().optional(),
});
export type Superstructure = z.infer<typeof SuperstructureSchema>;

/**
 * Rímsa (ADR 0023): prierez s typológiou `edgeBeam` na okraji NK `side` po celej dĺžke NK. Rámec prierezu: referenčný
 * bod = okraj NK, x von od NK, y nahor; prierez je definovaný pre pravú stranu, ľavá rímsa sa zrkadlí.
 */
export const EdgeBeamSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  superstructure: z.string(),
  side: z.enum(['left', 'right']),
  profile: z.string(),
  /** priebehy parametrov prierezu rímsy po staničení; chýbajúce = predvolená hodnota prierezu */
  parameterLaws: z.record(z.string(), StationFunctionSchema),
});
export type EdgeBeam = z.infer<typeof EdgeBeamSchema>;

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
   * Opora (ADR 0018): s úložným prahom a ložiskami (prah od zadnej líce múrika po prednú lícu, voliteľný driek,
   * záverný múrik) alebo monolitická stena (integrovaná, rámová); krídla. Pozdĺžne rozmery sa merajú v osi mosta
   * od osi uloženia, kladne smerom do poľa; obe skupiny polí sú vždy uložené.
   */
  z.object({
    type: z.literal('abutment'),
    construction: z.enum(['bearing', 'monolithic']),
    /** dĺžka pozdĺž osi podpery (medzi vonkajšími lícami krídel) */
    length: ExprSchema,
    /** a — predná líca prahu pred osou uloženia */
    frontOffset: ExprSchema,
    /** e — koniec NK za osou uloženia (odsadenie konca NK) */
    endOffset: ExprSchema,
    /** g — medzera medzi koncom NK a záverným múrikom */
    gap: ExprSchema,
    /** t — hrúbka záverného múrika */
    backwallThickness: ExprSchema,
    /** h_p — výška prahu pod hornou hranou podpery */
    seatHeight: ExprSchema,
    /** hrúbka drieku pod prednou lícou prahu (driek vznikne, len ak je základ nižšie ako spodok prahu) */
    stemThickness: ExprSchema,
    /** t_s — hrúbka steny monolitickej opory, stred na osi uloženia */
    wallThickness: ExprSchema,
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

/** Predvolená opora s prahom podľa vzorového mosta 212-00 (ADR 0018); `length` doplní volajúci podľa šírky NK. */
export function defaultAbutmentGeometry(length = '12'): AbutmentGeometry {
  return {
    type: 'abutment',
    construction: 'bearing',
    length,
    frontOffset: '0.9',
    endOffset: '0.5',
    gap: '0.08',
    backwallThickness: '0.5',
    seatHeight: '1.1',
    stemThickness: '1.2',
    wallThickness: '1.2',
    wings: { angle: '0', length: '4', thickness: '0.6', support: 'hung', endHeight: '1.5' },
  };
}

/**
 * Os uloženia (ADR 0017): patrí jednej NK, priamka cez bod osi mosta otočená o uhol kríženia; polia NK sa počítajú
 * z osí uloženia, podpery na nich stoja.
 */
export const BearingLineSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  superstructure: z.string(),
  /** zobrazované staničenie osi cesty v osi mosta */
  station: z.number(),
  /** uhol kríženia [°], 90 = kolmá; od osi mosta v smere staničenia proti smeru hodín (ADR 0008) */
  crossingAngle: ExprSchema,
  /**
   * priečnik (ADR 0018): v páse rovnobežnom s osou má NK prierez `profile`; šírka v osi mosta [m], vnútorný
   * priečnik symetricky okolo osi, koncový od čela NK
   */
  crossbeam: z.object({ profile: z.string(), width: ExprSchema }).optional(),
});
export type BearingLine = z.infer<typeof BearingLineSchema>;

/**
 * Založenie podpery (ADR 0019): horná hrana základu podľa terénu v strede podpery (− krytie), z výšky podpery (pod
 * najnižším ložiskom − výška) alebo z kóty základovej škáry (+ hrúbka základu). Všetky polia sú vždy uložené, takže
 * prepnutie režimu nestratí hodnoty.
 */
export const FoundationSchema = z.object({
  mode: z.enum(['terrain', 'height', 'level']),
  /** krytie hornej hrany základu pod terénom [m] */
  cover: ExprSchema,
  /** výška podpery od hornej hrany základu po hornú hranu podpery pod najnižším ložiskom [m] */
  height: ExprSchema,
  /** kóta základovej škáry = spodok základu, bez základu spodok podpery [m n. m.] */
  level: ExprSchema,
  /** terén v strede podpery [m n. m.]; udržiava ho aplikácia z terénu projektu, chýba = bez terénu */
  terrain: z.number().optional(),
});
export type Foundation = z.infer<typeof FoundationSchema>;
export type FoundationMode = Foundation['mode'];

/**
 * Predvolené založenie novej podpery (ADR 0019): pilier podľa terénu s krytím 0,5 m, opora výškou podpery 4 m.
 * `level` = kóta základovej škáry pre prepnutie do režimu kóty.
 */
export function defaultFoundation(kind: 'abutment' | 'pier', level = '0'): Foundation {
  return kind === 'abutment'
    ? { mode: 'height', cover: '0.5', height: '4', level }
    : { mode: 'terrain', cover: '0.5', height: '8', level };
}

/** Založenie kótou základovej škáry (napr. podpera zo staršieho súboru). */
export const levelFoundation = (level: string, kind: 'abutment' | 'pier' = 'pier'): Foundation => ({
  ...defaultFoundation(kind, level),
  mode: 'level',
});

/** Podpera (ADR 0008, 0017): stojí na osi uloženia, z ktorej preberá NK, staničenie a uhol kríženia. */
export const SupportSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  kind: z.enum(['abutment', 'pier']),
  /** id osi uloženia */
  bearingLine: z.string(),
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
  /** založenie (ADR 0019) */
  foundation: FoundationSchema,
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
  /**
   * oblasť použitá pri orezaní: pás okolo osi cesty (pol šírky, presah za NK) alebo obdĺžnik E/N okolo mosta
   * s okrajom `margin` (stiahnutý DMR); chýbajúci tvar = pás
   */
  corridor: z.object({
    halfWidth: z.number(),
    margin: z.number(),
    shape: z.enum(['strip', 'rectangle']).optional(),
  }),
  data: TerrainDataSchema,
  /** povrch pre založenie podpier (ADR 0019, 0020); pri viacerých zapnutých sa berie najvyšší v bode */
  foundation: z.boolean().optional(),
});
export type TerrainSurface = z.infer<typeof TerrainSurfaceSchema>;
