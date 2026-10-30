import type { Vec2 } from '@bridge/geom';

/** Najnižší priesečník zvislej priamky x = `x` s polygónmi (napr. spodok NK pod bodom prierezu). */
export function lowestCrossing(
  polygons: readonly (readonly Vec2[])[],
  x: number,
): number | undefined {
  let lowest: number | undefined;
  for (const poly of polygons) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i] as Vec2;
      const b = poly[(i + 1) % poly.length] as Vec2;
      if ((a.x - x) * (b.x - x) > 0 || a.x === b.x) continue;
      const y = a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
      if (lowest === undefined || y < lowest) lowest = y;
    }
  }
  return lowest;
}
