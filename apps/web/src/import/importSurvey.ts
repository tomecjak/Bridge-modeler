import type { Vec3 } from '@bridge/geom';
import type { Survey, SurveyPoint, SurveyVertex } from '@bridge/model';
import {
  type DxfDrawing,
  type ExtractedSurvey,
  extractSurvey,
  parseDxf,
  SURVEY_TOLERANCES,
  type SurveyIssue,
  type SurveyLayers,
} from '@bridge/survey';

/** Načítaný súbor meračky pred výberom hladín (ADR 0021). */
export interface SurveyFile {
  fileName: string;
  drawing: DxfDrawing | undefined;
  issues: SurveyIssue[];
}

export const isSurveyFile = (name: string) => /\.dxf$/i.test(name);

/** Prečíta DXF meračky (kódovanie podľa hlavičky súboru). */
export async function readSurveyFile(file: File): Promise<SurveyFile> {
  const { drawing, issues } = parseDxf(new Uint8Array(await file.arrayBuffer()));
  return { fileName: file.name, drawing, issues };
}

/**
 * Lokálny počiatok z meračky pre projekt bez osi (ako pri importe osi: prvý bod zaokrúhlený na 100 m, výška 0).
 * Súradnice DXF meračky sú E, N v S-JTSK (EPSG:5514).
 */
export function surveyOrigin(drawing: DxfDrawing): Vec3 | undefined {
  for (const e of drawing.entities) {
    const p = e.kind === 'line' ? e.points[0] : e.at;
    if (p) return { x: Math.round(p.x / 100) * 100, y: Math.round(p.y / 100) * 100, z: 0 };
  }
  return undefined;
}

/** Oblasť orezania v lokálnych súradniciach (koridor terénu okolo mosta, ADR 0011). */
export interface SurveyClip {
  contains(x: number, y: number): boolean;
}

export interface SurveyBuild {
  /** undefined, ak po orezaní nič neostalo */
  survey: Survey | undefined;
  /** problémy výšok v uloženej časti meračky */
  issues: SurveyIssue[];
  /** body a čiary vynechané orezaním */
  dropped: { points: number; lines: number };
}

const mm = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Meračka projektu zo súboru (ADR 0021): body a čiary zvolených hladín v lokálnych súradniciach na mm, orezané
 * na `clip` (čiara ostane celá, ak má aspoň jeden vrchol vnútri). Čiary dostanú id L1, L2, … v poradí súboru.
 */
export function buildSurvey(input: {
  drawing: DxfDrawing;
  fileName: string;
  layers: SurveyLayers;
  id: string;
  name: string;
  origin: Vec3;
  clip: SurveyClip | undefined;
  /** výsledok `extractSurvey` (dialóg ho má z náhľadu); inak sa vypočíta */
  extracted?: ExtractedSurvey;
}): SurveyBuild {
  const { origin, clip } = input;
  const extracted =
    input.extracted ?? extractSurvey(input.drawing, input.layers, SURVEY_TOLERANCES);
  const inside = (p: { x: number; y: number }) =>
    !clip || clip.contains(p.x - origin.x, p.y - origin.y);
  const height = (z: number | undefined) => (z === undefined ? {} : { z: mm(z - origin.z) });
  const vertex = (p: { x: number; y: number; z: number | undefined }): SurveyVertex => ({
    x: mm(p.x - origin.x),
    y: mm(p.y - origin.y),
    ...height(p.z),
  });
  const keptPoints = extracted.points.filter(inside);
  const keptLines = extracted.lines.filter((l) => l.points.some(inside));
  const points: SurveyPoint[] = keptPoints.map((p) => ({
    ...vertex(p),
    ...(p.number === undefined ? {} : { number: p.number }),
    ...(p.code === undefined ? {} : { code: p.code }),
  }));
  const lines = keptLines.map((l, i) => ({
    id: `L${i + 1}`,
    layer: l.layer,
    points: l.points.map(vertex),
    closed: l.closed,
  }));
  const issues = extracted.issues.filter((i) => !('x' in i) || inside(i));
  const dropped = {
    points: extracted.points.length - keptPoints.length,
    lines: extracted.lines.length - keptLines.length,
  };
  if (points.length === 0 && lines.length === 0) return { survey: undefined, issues, dropped };
  return {
    survey: {
      id: input.id,
      name: input.name,
      file: input.fileName,
      layers: {
        points: [...input.layers.points],
        heights: [...input.layers.heights],
        numbers: [...input.layers.numbers],
        codes: [...input.layers.codes],
        lines: [...input.layers.lines],
      },
      points,
      lines,
    },
    issues,
    dropped,
  };
}

/** Rozsah výšok bodov meračky (lokálne z) alebo undefined bez výšok. */
export function surveyHeightRange(survey: Survey): { min: number; max: number } | undefined {
  const z = survey.points.flatMap((p) => (p.z === undefined ? [] : [p.z]));
  return z.length > 0 ? { min: Math.min(...z), max: Math.max(...z) } : undefined;
}
