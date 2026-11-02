import type { DxfDrawing, DxfEntity, DxfPoint } from './dxf.ts';
import type { SurveyIssue } from './issues.ts';

/** Hladiny meračky zvolené projektantom (návrh dá `suggestSurveyLayers`). */
export interface SurveyLayers {
  /** body (`POINT`, prípadne značky `INSERT`) */
  points: readonly string[];
  /** výšky bodov (číselné texty) */
  heights: readonly string[];
  /** čísla bodov (texty v bode) */
  numbers: readonly string[];
  /** kódy bodov (texty v bode) */
  codes: readonly string[];
  /** čiary (`LINE`, `LWPOLYLINE`, `POLYLINE`) */
  lines: readonly string[];
}

/** Tolerancie priradenia textov a výšok [m] (ADR 0021). */
export interface SurveyTolerances {
  /** najväčšia vzdialenosť textu výšky od bodu */
  height: number;
  /** číslo a kód bodu ležia „presne v bode“ */
  label: number;
  /** vrchol čiary dostane výšku bodu meračky do tejto vzdialenosti */
  vertex: number;
}

export const SURVEY_TOLERANCES: SurveyTolerances = { height: 1.0, label: 0.02, vertex: 0.05 };

export interface ExtractedPoint {
  x: number;
  y: number;
  /** výška [m n. m.]; undefined = bod bez výšky */
  z: number | undefined;
  number: string | undefined;
  code: string | undefined;
  layer: string;
}

export interface ExtractedVertex {
  x: number;
  y: number;
  z: number | undefined;
}

export interface ExtractedLine {
  layer: string;
  points: ExtractedVertex[];
  closed: boolean;
}

export interface ExtractedSurvey {
  points: ExtractedPoint[];
  lines: ExtractedLine[];
  issues: SurveyIssue[];
}

type TextEntity = Extract<DxfEntity, { kind: 'text' }>;

interface Near {
  index: number;
  distance: number;
}

/** Susedia do vzdialenosti `radius` (≤ veľkosť bunky) zoradení podľa vzdialenosti a poradia. */
export function nearIndex(
  items: readonly { x: number; y: number }[],
  cell: number,
): (p: { x: number; y: number }, radius: number) => Near[] {
  const size = Math.max(cell, 1e-6);
  const cells = new Map<string, number[]>();
  const key = (i: number, j: number) => `${i},${j}`;
  items.forEach((p, k) => {
    const c = key(Math.floor(p.x / size), Math.floor(p.y / size));
    const list = cells.get(c);
    if (list) list.push(k);
    else cells.set(c, [k]);
  });
  return (p, radius) => {
    const ci = Math.floor(p.x / size);
    const cj = Math.floor(p.y / size);
    const found: Near[] = [];
    for (let i = ci - 1; i <= ci + 1; i++)
      for (let j = cj - 1; j <= cj + 1; j++)
        for (const k of cells.get(key(i, j)) ?? []) {
          const q = items[k] as { x: number; y: number };
          const distance = Math.hypot(q.x - p.x, q.y - p.y);
          if (distance <= radius) found.push({ index: k, distance });
        }
    return found.sort((a, b) => a.distance - b.distance || a.index - b.index);
  };
}

const HEIGHT = /^[+-]?\d+(?:[.,]\d+)?$/;

/** Výška z textu (desatinná bodka aj čiarka); iný text → undefined. */
export function parseHeight(text: string): number | undefined {
  const t = text.trim();
  return HEIGHT.test(t) ? Number(t.replace(',', '.')) : undefined;
}

/**
 * Body a čiary meračky so zvolenými hladinami (ADR 0021):
 * - číslo a kód bodu sú najbližšie texty do `label` od bodu;
 * - výšky sa párujú s bodmi do `height` od najbližšej dvojice; každý text patrí najviac jednému bodu
 *   a bod má najviac jednu výšku; ak text nepatrí najbližšiemu bodu alebo bod nedostal najbližší text,
 *   je výška nejednoznačná (upozornenie);
 * - vrchol čiary dostane výšku bodu do `vertex`, inak ostane bez výšky.
 * Súradnice ostávajú v súradniciach DXF.
 */
export function extractSurvey(
  drawing: DxfDrawing,
  layers: SurveyLayers,
  tol: SurveyTolerances,
): ExtractedSurvey {
  const pointLayers = new Set(layers.points);
  const lineLayers = new Set(layers.lines);
  const textsOn = (names: readonly string[]) => {
    const set = new Set(names);
    return drawing.entities.filter((e): e is TextEntity => e.kind === 'text' && set.has(e.layer));
  };
  const raw: { at: DxfPoint; layer: string }[] = [];
  for (const e of drawing.entities)
    if ((e.kind === 'point' || e.kind === 'insert') && pointLayers.has(e.layer))
      raw.push({ at: e.at, layer: e.layer });
  const near = nearIndex(
    raw.map((r) => r.at),
    Math.max(tol.height, tol.label),
  );

  // číslo a kód: najbližší text do tolerancie
  const labels = (names: readonly string[]) => {
    const best: ({ text: string; distance: number } | undefined)[] = raw.map(() => undefined);
    for (const t of textsOn(names)) {
      const text = t.text.trim();
      if (text === '') continue;
      for (const { index, distance } of near(t.at, tol.label)) {
        const b = best[index];
        if (!b || distance < b.distance) best[index] = { text, distance };
      }
    }
    return best.map((b) => b?.text);
  };
  const numbers = labels(layers.numbers);
  const codes = labels(layers.codes);

  const issues: SurveyIssue[] = [];
  const heights: { at: DxfPoint; value: number }[] = [];
  for (const t of textsOn(layers.heights)) {
    const value = parseHeight(t.text);
    if (value !== undefined) heights.push({ at: t.at, value });
    else if (t.text.trim() !== '')
      issues.push({
        severity: 'warning',
        code: 'NonNumericHeight',
        x: t.at.x,
        y: t.at.y,
        text: t.text,
      });
  }

  // dvojice bod–výška od najbližšej; prvá dvojica bodu (textu) v poradí je jeho najbližší text (bod)
  const pairs: { p: number; t: number; d: number }[] = [];
  heights.forEach((h, t) => {
    for (const { index, distance } of near(h.at, tol.height))
      pairs.push({ p: index, t, d: distance });
  });
  pairs.sort((a, b) => a.d - b.d || a.p - b.p || a.t - b.t);
  const nearestPoint = new Map<number, number>();
  const nearestText = new Map<number, number>();
  const assigned = new Map<number, { t: number; d: number }>();
  const used = new Set<number>();
  for (const q of pairs) {
    if (!nearestPoint.has(q.t)) nearestPoint.set(q.t, q.p);
    if (!nearestText.has(q.p)) nearestText.set(q.p, q.t);
    if (assigned.has(q.p) || used.has(q.t)) continue;
    assigned.set(q.p, q);
    used.add(q.t);
  }

  const points: ExtractedPoint[] = raw.map((r, k) => {
    const q = assigned.get(k);
    const value = q && (heights[q.t] as { value: number }).value;
    const number = numbers[k];
    if (q && value !== undefined && (nearestPoint.get(q.t) !== k || nearestText.get(k) !== q.t))
      issues.push({
        severity: 'warning',
        code: 'AmbiguousHeight',
        x: r.at.x,
        y: r.at.y,
        number,
        value,
        distance: q.d,
      });
    if (!q && layers.heights.length > 0)
      issues.push({
        severity: 'warning',
        code: 'PointWithoutHeight',
        x: r.at.x,
        y: r.at.y,
        number,
      });
    return { x: r.at.x, y: r.at.y, z: value, number, code: codes[k], layer: r.layer };
  });
  heights.forEach((h, t) => {
    if (!used.has(t))
      issues.push({
        severity: 'warning',
        code: 'HeightWithoutPoint',
        x: h.at.x,
        y: h.at.y,
        value: h.value,
      });
  });

  // výšky vrcholov čiar z bodov meračky
  const withHeight = points.filter((p): p is ExtractedPoint & { z: number } => p.z !== undefined);
  const nearHeight = nearIndex(withHeight, tol.vertex);
  const lines: ExtractedLine[] = [];
  for (const e of drawing.entities) {
    if (e.kind !== 'line' || !lineLayers.has(e.layer) || e.points.length < 2) continue;
    lines.push({
      layer: e.layer,
      closed: e.closed,
      points: e.points.map((v) => {
        const hit = nearHeight(v, tol.vertex)[0];
        return { x: v.x, y: v.y, z: hit && withHeight[hit.index]?.z };
      }),
    });
  }
  return { points, lines, issues };
}
