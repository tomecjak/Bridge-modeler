import type { Vec2 } from '@bridge/geom';
import type { CurveRef, Survey, SurveyLine } from '@bridge/model';

type Vertex = { x: number; y: number; z?: number | undefined };

/** Čiara meračky, na ktorú odkazuje krivka `survey` (ADR 0021). */
export function findSurveyLine(
  surveys: readonly Survey[] | undefined,
  ref: CurveRef,
): { survey: Survey; line: SurveyLine } | undefined {
  if (ref.type !== 'survey') return undefined;
  const survey = surveys?.find((s) => s.id === ref.survey);
  const line = survey?.lines.find((l) => l.id === ref.line);
  return survey && line ? { survey, line } : undefined;
}

/** Dĺžky od začiatku čiary vo vrcholoch. */
export function lineLengths(points: readonly Vertex[]): number[] {
  let t = 0;
  return points.map((p, i) => {
    const prev = points[i - 1];
    if (prev) t += Math.hypot(p.x - prev.x, p.y - prev.y);
    return t;
  });
}

/**
 * Výšky vrcholov čiary meračky (predpoklad 2026-11-02, PLAN.md §7): medzi vrcholmi so zameranou výškou lineárne
 * po dĺžke čiary, pred prvým a za posledným zameraným vrcholom výška najbližšieho z nich. Čiara bez výšok → undefined
 * (zobrazenie ju môže položiť na terén).
 */
export function lineHeights(points: readonly Vertex[]): number[] | undefined {
  const t = lineLengths(points);
  const known = points.flatMap((p, i) =>
    p.z === undefined ? [] : [{ t: t[i] as number, z: p.z }],
  );
  if (known.length === 0) return undefined;
  return t.map((ti) => interpolate(known, ti));
}

/** Lineárna interpolácia po dĺžke z bodov (t, z) zoradených podľa t; mimo rozsahu krajná hodnota. */
function interpolate(known: readonly { t: number; z: number }[], t: number): number {
  const first = known[0] as { t: number; z: number };
  const last = known[known.length - 1] as { t: number; z: number };
  if (t <= first.t) return first.z;
  if (t >= last.t) return last.z;
  for (let i = 0; i + 1 < known.length; i++) {
    const a = known[i] as { t: number; z: number };
    const b = known[i + 1] as { t: number; z: number };
    if (t <= b.t) return b.t - a.t < 1e-12 ? b.z : a.z + ((b.z - a.z) * (t - a.t)) / (b.t - a.t);
  }
  return last.z;
}

/** Výška čiary v dĺžke `t` od začiatku (z výšok vrcholov `lineHeights`). */
export function heightAlong(
  lengths: readonly number[],
  heights: readonly number[],
  t: number,
): number {
  return interpolate(
    lengths.map((ti, i) => ({ t: ti, z: heights[i] as number })),
    t,
  );
}

/** Rez meračkou v priečnom reze: x = odsadenie vpravo od osi [m], z = lokálna výška (undefined = bez výšky). */
export interface SurveyCut {
  /** priesečníky čiar s rovinou rezu */
  crossings: { x: number; z: number | undefined }[];
  /** zamerané body v blízkosti roviny rezu */
  points: { x: number; z: number | undefined }[];
}

/**
 * Meračka v priečnom reze (ADR 0021): priesečníky čiar so zvislou rovinou cez `origin` s vodorovnou normálou vpravo
 * `normal` (jednotková) do vzdialenosti `halfWidth` od osi a zamerané body do `reach` od roviny. Výška priesečníka
 * je z výšok vrcholov čiary (`lineHeights`).
 */
export function surveyCut(
  surveys: readonly Survey[],
  origin: Vec2,
  normal: Vec2,
  halfWidth: number,
  reach: number,
): SurveyCut {
  const crossings: SurveyCut['crossings'] = [];
  const points: SurveyCut['points'] = [];
  // smer roviny rezu je kolmý na normálu; d = vzdialenosť od roviny, u = odsadenie v rovine
  const local = (p: { x: number; y: number }) => {
    const dx = p.x - origin.x;
    const dy = p.y - origin.y;
    return { u: dx * normal.x + dy * normal.y, d: dx * normal.y - dy * normal.x };
  };
  for (const survey of surveys) {
    for (const line of survey.lines) {
      const heights = lineHeights(line.points);
      const lengths = lineLengths(line.points);
      const pts = line.points.map(local);
      const segments = line.closed ? pts.length : pts.length - 1;
      const found: number[] = [];
      for (let i = 0; i < segments; i++) {
        const j = (i + 1) % pts.length;
        const a = pts[i] as { u: number; d: number };
        const b = pts[j] as { u: number; d: number };
        if ((a.d > 0 && b.d > 0) || (a.d < 0 && b.d < 0) || a.d === b.d) continue;
        const k = a.d / (a.d - b.d);
        const u = a.u + k * (b.u - a.u);
        if (Math.abs(u) > halfWidth) continue;
        // pri uzavretej čiare je posledný úsek späť k prvému vrcholu
        const ta = lengths[i] as number;
        const pa = line.points[i] as Vertex;
        const pb = line.points[j] as Vertex;
        const t = ta + k * Math.hypot(pb.x - pa.x, pb.y - pa.y);
        let z: number | undefined;
        if (heights)
          z =
            j === 0
              ? (heights[i] as number) + k * ((heights[0] as number) - (heights[i] as number))
              : heightAlong(lengths, heights, t);
        // vrchol presne v rovine leží na dvoch úsekoch
        if (found.some((x) => Math.abs(x - u) < 1e-9)) continue;
        found.push(u);
        crossings.push({ x: u, z });
      }
    }
    for (const p of survey.points) {
      const q = local(p);
      if (Math.abs(q.d) <= reach && Math.abs(q.u) <= halfWidth) points.push({ x: q.u, z: p.z });
    }
  }
  return { crossings, points };
}
