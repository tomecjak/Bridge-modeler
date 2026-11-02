import type { DxfDrawing, DxfLayer } from './dxf.ts';
import { nearIndex, type SurveyLayers, type SurveyTolerances } from './survey.ts';

/** Hladina DXF s počtami entít (výber hladín pri importe meračky). */
export interface DxfLayerSummary extends DxfLayer {
  points: number;
  texts: number;
  lines: number;
  inserts: number;
}

export function summarizeLayers(drawing: DxfDrawing): DxfLayerSummary[] {
  const counts = new Map(
    drawing.layers.map((l) => [l.name, { ...l, points: 0, texts: 0, lines: 0, inserts: 0 }]),
  );
  for (const e of drawing.entities) {
    const c = counts.get(e.layer);
    if (!c) continue;
    if (e.kind === 'point') c.points++;
    else if (e.kind === 'text') c.texts++;
    else if (e.kind === 'line') c.lines++;
    else c.inserts++;
  }
  return [...counts.values()];
}

/** podiel textov hladiny, od ktorého sa hladina navrhne (výšky, čísla, kódy) */
const MOSTLY = 0.9;
const HALF = 0.5;
const DECIMAL = /^[+-]?\d+[.,]\d+$/;
const INTEGER = /^\d+$/;

/**
 * Návrh hladín meračky: body = hladiny s `POINT`; výšky = hladiny s desatinnými číslami; čísla bodov = celé čísla
 * väčšinou v bodoch; kódy = iné texty takmer vždy v bodoch; čiary = hladiny s čiarami. Projektant návrh upraví.
 */
export function suggestSurveyLayers(drawing: DxfDrawing, tol: SurveyTolerances): SurveyLayers {
  const points = drawing.entities.filter((e) => e.kind === 'point').map((e) => e.at);
  const near = nearIndex(points, tol.label);
  const stats = new Map<string, { n: number; decimal: number; integer: number; atPoint: number }>();
  for (const e of drawing.entities) {
    if (e.kind !== 'text') continue;
    const text = e.text.trim();
    if (text === '') continue;
    const s = stats.get(e.layer) ?? { n: 0, decimal: 0, integer: 0, atPoint: 0 };
    s.n++;
    if (DECIMAL.test(text)) s.decimal++;
    else if (INTEGER.test(text)) s.integer++;
    if (near(e.at, tol.label).length > 0) s.atPoint++;
    stats.set(e.layer, s);
  }
  const summary = summarizeLayers(drawing);
  const textLayers = (
    test: (s: { n: number; decimal: number; integer: number; atPoint: number }) => boolean,
  ) =>
    summary
      .filter((l) => {
        const s = stats.get(l.name);
        return s !== undefined && test(s);
      })
      .map((l) => l.name);
  return {
    points: summary.filter((l) => l.points > 0).map((l) => l.name),
    heights: textLayers((s) => s.decimal >= MOSTLY * s.n),
    numbers: textLayers((s) => s.integer >= MOSTLY * s.n && s.atPoint >= HALF * s.n),
    codes: textLayers(
      (s) => s.n - s.decimal - s.integer >= HALF * s.n && s.atPoint >= MOSTLY * s.n,
    ),
    lines: summary.filter((l) => l.lines > 0).map((l) => l.name),
  };
}
