import type { Drawing } from '@bridge/drawing';
import type { Vec2 } from '@bridge/geom';
import { useEffect, useState } from 'react';
import { formatGrade, formatNumber } from '../format/number.ts';
import { sk } from '../i18n/sk.ts';

/** Polomer prichytávania na vrchol [px]. */
export const SNAP_PX = 10;

/** Vrcholy čiar výkresu a ďalších čiar (kandidáti na prichytenie pri meraní). */
export function drawingVertices(
  drawing: Drawing | undefined,
  extra: readonly (readonly Vec2[])[] = [],
): Vec2[] {
  const out: Vec2[] = [];
  for (const e of drawing?.entities ?? []) if (e.kind === 'polyline') out.push(...e.points);
  for (const line of extra) out.push(...line);
  return out;
}

/** Najbližší vrchol (svet) do `radius` px od bodu obrazovky `screen`; inak undefined. */
export function snapPoint(
  screen: Vec2,
  candidates: readonly Vec2[],
  toScreen: (p: Vec2) => Vec2,
  radius = SNAP_PX,
): Vec2 | undefined {
  let best: Vec2 | undefined;
  let bestD = radius;
  for (const c of candidates) {
    const q = toScreen(c);
    const d = Math.hypot(q.x - screen.x, q.y - screen.y);
    if (d <= bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/** Meranie v profile: vodorovná dĺžka (u), výškový rozdiel a sklon (pri nulovej dĺžke undefined). */
export function profileMeasure(a: Vec2, b: Vec2) {
  const length = b.x - a.x;
  const height = b.y - a.y;
  return { length, height, slope: Math.abs(length) > 1e-9 ? height / length : undefined };
}

/** Meranie v pôdoryse: vzdialenosť, ΔE, ΔN a azimut od severu v smere hodinových ručičiek [rad]. */
export function planMeasure(a: Vec2, b: Vec2) {
  const dE = b.x - a.x;
  const dN = b.y - a.y;
  const azimuth = (Math.atan2(dE, dN) + 2 * Math.PI) % (2 * Math.PI);
  return { distance: Math.hypot(dE, dN), dE, dN, azimuth };
}

export function formatProfileMeasure(a: Vec2, b: Vec2): string {
  const m = profileMeasure(a, b);
  const t = sk.measure;
  return [
    `${t.length} ${formatNumber(Math.abs(m.length), 3)} m`,
    `${t.height} ${formatNumber(m.height, 3)} m`,
    // sklon v smere rastúceho staničenia bez ohľadu na poradie bodov
    ...(m.slope === undefined ? [] : [`${t.slope} ${formatGrade(m.slope, 2)}`]),
  ].join('  ·  ');
}

export function formatPlanMeasure(a: Vec2, b: Vec2): string {
  const m = planMeasure(a, b);
  const t = sk.measure;
  return [
    `${t.distance} ${formatNumber(m.distance, 3)} m`,
    `ΔE ${formatNumber(m.dE, 3)}`,
    `ΔN ${formatNumber(m.dN, 3)}`,
    `${t.azimuth} ${formatNumber((m.azimuth * 180) / Math.PI, 4)}°`,
  ].join('  ·  ');
}

/** Bod merania pod kurzorom (prichytený na vrchol alebo voľný). */
export interface MeasureHover {
  point: Vec2;
  snapped: boolean;
}

/**
 * Stav nástroja Merať v pohľade (Fáza 10b): prvý klik začiatok, druhý koniec; ďalší klik začne nové meranie.
 * Merania sú dočasné; vypnutie nástroja (Esc) ich zahodí.
 */
export function useMeasure(active: boolean) {
  const [a, setA] = useState<Vec2>();
  const [b, setB] = useState<Vec2>();
  const [hover, setHover] = useState<MeasureHover>();
  useEffect(() => {
    if (active) return;
    setA(undefined);
    setB(undefined);
    setHover(undefined);
  }, [active]);
  return {
    a,
    b,
    hover,
    move: (h: MeasureHover | undefined) => setHover(h),
    click: (p: Vec2) => {
      if (!a || b) {
        setA(p);
        setB(undefined);
      } else {
        setB(p);
      }
    },
  };
}
