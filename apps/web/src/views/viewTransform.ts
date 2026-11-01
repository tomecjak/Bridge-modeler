import type { Vec2 } from '@bridge/geom';

/** Pohľad 2D: stred vo svetových súradniciach a mierky [px/m] (sy ≠ sx pri prevýšení profilu). */
export interface View {
  cx: number;
  cy: number;
  sx: number;
  sy: number;
}

/** Úsek osi v spojitom staničení [m]. */
export interface SRange {
  sFrom: number;
  sTo: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Svet (y nahor) → obrazovka (y nadol). */
export const worldToScreen = (v: View, size: Size, p: Vec2): Vec2 => ({
  x: (p.x - v.cx) * v.sx + size.width / 2,
  y: size.height / 2 - (p.y - v.cy) * v.sy,
});

export const screenToWorld = (v: View, size: Size, p: Vec2): Vec2 => ({
  x: v.cx + (p.x - size.width / 2) / v.sx,
  y: v.cy + (size.height / 2 - p.y) / v.sy,
});

/** Svetová obálka viditeľného výrezu (napr. pre mapový podklad pôdorysu). */
export function visibleBounds(v: View, size: Size): Bounds {
  const a = screenToWorld(v, size, { x: 0, y: size.height });
  const b = screenToWorld(v, size, { x: size.width, y: 0 });
  return { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y };
}

/** Pohľad, ktorý zobrazí celé `bounds` s okrajom `padding` px; `aspect` = sy / sx (prevýšenie). */
export function fitView(bounds: Bounds, size: Size, padding = 24, aspect = 1): View {
  const bw = Math.max(bounds.maxX - bounds.minX, 1e-6);
  const bh = Math.max(bounds.maxY - bounds.minY, 1e-6);
  const sx = Math.max(
    1e-9,
    Math.min((size.width - 2 * padding) / bw, (size.height - 2 * padding) / (bh * aspect)),
  );
  return {
    cx: (bounds.minX + bounds.maxX) / 2,
    cy: (bounds.minY + bounds.maxY) / 2,
    sx,
    sy: sx * aspect,
  };
}

/** Priblíženie okolo bodu obrazovky — svetový bod pod kurzorom ostane na mieste. */
export function zoomAt(v: View, size: Size, screen: Vec2, factor: number): View {
  const w = screenToWorld(v, size, screen);
  const sx = v.sx * factor;
  const sy = v.sy * factor;
  return {
    sx,
    sy,
    cx: w.x - (screen.x - size.width / 2) / sx,
    cy: w.y - (size.height / 2 - screen.y) / sy,
  };
}

/** Posun pohľadu o vektor v pixeloch obrazovky. */
export const pan = (v: View, dx: number, dy: number): View => ({
  ...v,
  cx: v.cx - dx / v.sx,
  cy: v.cy + dy / v.sy,
});

/** Najmenší „pekný“ krok 1, 2, 5 × 10ⁿ, ktorý je ≥ `minimum`. */
export function niceStep(minimum: number): number {
  const exponent = Math.floor(Math.log10(minimum));
  const base = 10 ** exponent;
  for (const m of [1, 2, 5, 10]) {
    if (m * base >= minimum - 1e-12 * base) return m * base;
  }
  return 10 * base;
}

export function boundsOf(points: readonly Vec2[]): Bounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Rozsah pohľadu okolo úseku `from`–`to` (napr. oblasť mosta) s okrajom 15 % dĺžky, najmenej `minMargin`,
 * orezaný na `min`–`max` (rozsah osi).
 */
export function focusRange(
  range: { from: number; to: number },
  min: number,
  max: number,
  minMargin = 20,
): { from: number; to: number } {
  const a = Math.min(range.from, range.to);
  const b = Math.max(range.from, range.to);
  const margin = Math.max(minMargin, 0.15 * (b - a));
  return { from: Math.max(min, a - margin), to: Math.min(max, b + margin) };
}
