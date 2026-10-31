import type { Vec2 } from '@bridge/geom';
import type { ProfileDefinition, ProfileLoop } from '@bridge/model';

/** Krok mriežky prichytávania v editore prierezu [m] (10 mm). */
export const SNAP_GRID = 0.01;
/** Vzdialenosť na obrazovke, do ktorej sa bod zarovná s iným bodom [px]. */
export const SNAP_ALIGN_PX = 6;

export interface Snapped {
  point: Vec2;
  /** súradnice, na ktoré sa bod zarovnal s iným bodom (vodiace čiary) */
  guides: { x?: number; y?: number };
}

/**
 * Prichytenie polohy v editore prierezu: zarovnanie zvislo / vodorovne s iným bodom (do `SNAP_ALIGN_PX` pri mierke
 * `scale` px/m), inak na mriežku 10 mm. Súradnice sú posunuté (referenčný bod v 0,0).
 */
export function snapPoint(p: Vec2, others: readonly Vec2[], scale: number): Snapped {
  const tol = SNAP_ALIGN_PX / scale;
  const near = (v: number, pick: (q: Vec2) => number) => {
    let best: number | undefined;
    for (const q of others) {
      const d = Math.abs(pick(q) - v);
      if (d <= tol && (best === undefined || d < Math.abs(best - v))) best = pick(q);
    }
    return best;
  };
  const gx = near(p.x, (q) => q.x);
  const gy = near(p.y, (q) => q.y);
  const grid = (v: number) => Math.round(v / SNAP_GRID) * SNAP_GRID;
  return {
    point: { x: gx ?? grid(p.x), y: gy ?? grid(p.y) },
    guides: { ...(gx !== undefined ? { x: gx } : {}), ...(gy !== undefined ? { y: gy } : {}) },
  };
}

/** Voľné meno bodu `P1`, `P2`, … */
export function nextPointName(def: ProfileDefinition, prefix = 'P'): string {
  const used = new Set(def.points.map((p) => p.name));
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/** Zmení výrazy bodu. */
export const setPointExpressions = (
  def: ProfileDefinition,
  name: string,
  expr: { x: string; y: string },
): ProfileDefinition => ({
  ...def,
  points: def.points.map((p) => (p.name === name ? { ...p, ...expr } : p)),
});

/** Pridá bod na koniec (môže odkazovať na všetky skoršie body). */
export const addPoint = (
  def: ProfileDefinition,
  name: string,
  expr: { x: string; y: string },
): ProfileDefinition => ({ ...def, points: [...def.points, { name, ...expr }] });

/**
 * Odstráni bod aj z obrysov; obrys s menej ako 3 bodmi zanikne. Referenčný bod sa neodstraňuje. Odkazy z výrazov
 * iných bodov ostanú a ohlási ich vyhodnotenie profilu.
 */
export function removePoint(def: ProfileDefinition, name: string): ProfileDefinition {
  if (name === def.referencePoint) return def;
  const loops = def.loops
    .map((l) => ({ ...l, points: l.points.filter((n) => n !== name) }))
    .filter((l) => l.points.length >= 3);
  return { ...def, points: def.points.filter((p) => p.name !== name), loops };
}

/** Pridá obrys alebo dutinu z bodov v poradí klikania (smer otočí vyhodnotenie s upozornením). */
export function addLoop(
  def: ProfileDefinition,
  points: readonly string[],
  role: ProfileLoop['role'],
): ProfileDefinition {
  const prefix = role === 'outer' ? 'obrys' : 'dutina';
  const used = new Set(def.loops.map((l) => l.name));
  let name = prefix;
  for (let n = 2; used.has(name); n++) name = `${prefix} ${n}`;
  return { ...def, loops: [...def.loops, { name, role, points: [...points] }] };
}
