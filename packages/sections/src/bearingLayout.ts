import type { Superstructure } from '@bridge/model';
import { lowestCrossing } from './crossing.ts';
import type { EvaluatedLoop } from './profile.ts';
import { evaluateSuperstructure, type SectionContext } from './superstructure.ts';

/** Spodná plocha prierezu NK (spodok trámu, dosky alebo komory) ako priečny rozsah [m]. */
export interface BottomFace {
  x0: number;
  x1: number;
}

/** Najväčší sklon hrany spodnej plochy (strmšie hrany sú steny trámov a nábehy). */
const MAX_SLOPE = 0.25;

/**
 * Spodné plochy prierezu (ADR 0019): hrany vonkajšieho obrysu otočené nadol (obrys je CCW → idú zľava doprava),
 * viditeľné zdola a ležiace na priamke najnižšej z nich v tolerancii `tolerance` [m]; konzoly a nábehy vypadnú.
 * Susedné hrany sa spoja. Plochy sú zoradené zľava doprava.
 */
export function bottomFaces(
  section: { loops: readonly EvaluatedLoop[] },
  tolerance = 0.01,
): BottomFace[] {
  const outer = section.loops.filter((l) => l.role === 'outer').map((l) => l.polygon);
  const edges = outer.flatMap((polygon) =>
    polygon.flatMap((a, i) => {
      const b = polygon[(i + 1) % polygon.length] ?? a;
      const dx = b.x - a.x;
      if (dx <= 1e-9 || Math.abs(b.y - a.y) > MAX_SLOPE * dx) return [];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const below = lowestCrossing(outer, mx);
      return below !== undefined && below >= my - 1e-6 ? [{ a, b, my }] : [];
    }),
  );
  if (edges.length === 0) return [];
  const lowest = edges.reduce((p, e) => (e.my < p.my ? e : p));
  const k = (lowest.b.y - lowest.a.y) / (lowest.b.x - lowest.a.x);
  const onLine = (p: { x: number; y: number }) =>
    Math.abs(lowest.a.y + k * (p.x - lowest.a.x) - p.y) <= tolerance;
  const faces = edges
    .filter((e) => onLine(e.a) && onLine(e.b))
    .map((e) => ({ x0: e.a.x, x1: e.b.x }))
    .sort((p, q) => p.x0 - q.x0);
  const merged: BottomFace[] = [];
  for (const f of faces) {
    const last = merged.at(-1);
    if (last && f.x0 <= last.x1 + 1e-6) last.x1 = Math.max(last.x1, f.x1);
    else merged.push({ ...f });
  }
  return merged;
}

const mm = (v: number) => Math.round(v * 1000) / 1000 || 0;

/**
 * Predvolené ložiská z prierezu NK (ADR 0019, odpoveď 20): jedna spodná plocha → dve ložiská v 1/4 šírky od okrajov,
 * viac plôch (trámy) → jedno pod stredom každej. Priečne polohy od osi NK [m] na mm.
 */
export function deckBearings(faces: readonly BottomFace[]): number[] {
  if (faces.length === 1) {
    const f = faces[0] as BottomFace;
    const quarter = (f.x1 - f.x0) / 4;
    return [mm(f.x0 + quarter), mm(f.x1 - quarter)];
  }
  return faces.map((f) => mm((f.x0 + f.x1) / 2));
}

/**
 * Predvolené ložiská NK na spojitom staničení `s` z hlavného prierezu NK (bez priečnika, ktorý by na koncovej osi
 * dal plný blok); prázdne, ak sa prierez nedá vyhodnotiť.
 */
export function deckBearingsAt(ctx: SectionContext, deck: Superstructure, s: number): number[] {
  const { crossbeams: _crossbeams, ...main } = ctx;
  const section = evaluateSuperstructure(main, deck, s);
  if (section.issues.some((i) => i.severity !== 'warning')) return [];
  return deckBearings(bottomFaces(section));
}
