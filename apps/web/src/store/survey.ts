import type { Alignment } from '@bridge/alignment';
import { type Vec2, type Vec3, vec2 } from '@bridge/geom';
import type { Survey } from '@bridge/model';
import { lineHeights, surveyCut } from '@bridge/sections';
import type { Tin } from '@bridge/terrain';
import { formatNumber } from '../format/number.ts';

/** Popis výšky bodu meračky [m n. m.]. */
const heightLabel = (z: number | undefined, z0: number) =>
  z === undefined ? undefined : formatNumber(z + z0, 2);

/** Meračky v pôdoryse: čiary a body s výškou (ADR 0021). */
export function planSurveys(surveys: readonly Survey[], z0: number) {
  return surveys.map((s) => ({
    id: s.id,
    lines: s.lines.map((l) => ({ points: l.points.map((p) => vec2(p.x, p.y)), closed: l.closed })),
    points: s.points.map((p) => ({ at: vec2(p.x, p.y), label: heightLabel(p.z, z0) })),
  }));
}

/** Pol šírky priečneho rezu a vzdialenosť bodov meračky od roviny rezu, ktoré sa ešte ukážu [m]. */
const SECTION_HALF_WIDTH = 60;
const SECTION_REACH = 1;

/**
 * Meračky v priečnom reze na spojitom staničení `s` (x = odsadenie od osi cesty vpravo, y = výška v m n. m.):
 * priesečníky čiar s výškou z vrcholov a body do 1 m od roviny rezu s popisom výšky.
 */
export function sectionSurveys(surveys: readonly Survey[], road: Alignment, s: number, z0: number) {
  const h = road.evaluateHorizontal(s);
  const n = vec2(Math.cos(h.azimuth), -Math.sin(h.azimuth)); // vpravo od osi
  return surveys.flatMap((survey) => {
    const cut = surveyCut([survey], h.point, n, SECTION_HALF_WIDTH, SECTION_REACH);
    const points = [
      ...cut.crossings.flatMap((c) =>
        c.z === undefined ? [] : [{ at: vec2(c.x, c.z + z0), label: undefined }],
      ),
      ...cut.points.flatMap((p) =>
        p.z === undefined ? [] : [{ at: vec2(p.x, p.z + z0), label: heightLabel(p.z, z0) }],
      ),
    ];
    return points.length > 0 ? [{ id: survey.id, points }] : [];
  });
}

/** Krok zhustenia čiary bez výšok pri položení na terén [m]. */
const DRAPE_STEP = 1;

/** Najvyššia výška terénov v bode (lokálne z) alebo undefined mimo terénu. */
function terrainAt(tins: readonly Tin[], p: Vec2): number | undefined {
  let best: number | undefined;
  for (const tin of tins) {
    const z = tin.elevationAt(p.x, p.y);
    if (z !== undefined && (best === undefined || z > best)) best = z;
  }
  return best;
}

/**
 * Meračky v 3D (lokálne súradnice): čiary s výškami vrcholov interpolovanými po dĺžke čiary; čiara bez výšok
 * zhustená po 1 m a položená na terén (predpoklad 2026-11-02, PLAN.md §7), mimo terénu sa preruší. Body s výškou.
 */
export function sceneSurveys(
  surveys: readonly Survey[],
  tins: readonly Tin[],
): { lines: Vec3[][]; points: Vec3[] } {
  const lines: Vec3[][] = [];
  const points: Vec3[] = [];
  for (const s of surveys) {
    for (const l of s.lines) {
      const ring = l.closed && l.points.length > 2 ? [...l.points, l.points[0] as Vec2] : l.points;
      const heights = lineHeights(ring);
      if (heights) {
        lines.push(ring.map((p, i) => ({ x: p.x, y: p.y, z: heights[i] as number })));
        continue;
      }
      let run: Vec3[] = [];
      for (let i = 0; i + 1 < ring.length; i++) {
        const a = ring[i] as Vec2;
        const b = ring[i + 1] as Vec2;
        const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / DRAPE_STEP));
        for (let k = i === 0 ? 0 : 1; k <= n; k++) {
          const p = vec2(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n);
          const z = terrainAt(tins, p);
          if (z === undefined) {
            if (run.length >= 2) lines.push(run);
            run = [];
          } else run.push({ x: p.x, y: p.y, z });
        }
      }
      if (run.length >= 2) lines.push(run);
    }
    for (const p of s.points) if (p.z !== undefined) points.push({ x: p.x, y: p.y, z: p.z });
  }
  return { lines, points };
}
