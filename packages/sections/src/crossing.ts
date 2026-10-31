import type { Vec2 } from '@bridge/geom';

/** Najnižší priesečník zvislej priamky x = `x` s polygónmi (napr. spodok NK pod bodom prierezu). */
export function lowestCrossing(
  polygons: readonly (readonly Vec2[])[],
  x: number,
): number | undefined {
  return extremeCrossing(polygons, x, (y, best) => y < best);
}

/** Najvyšší priesečník zvislej priamky x = `x` s polygónmi (napr. horný povrch NK nad bodom prierezu). */
export function highestCrossing(
  polygons: readonly (readonly Vec2[])[],
  x: number,
): number | undefined {
  return extremeCrossing(polygons, x, (y, best) => y > best);
}

function extremeCrossing(
  polygons: readonly (readonly Vec2[])[],
  x: number,
  better: (y: number, best: number) => boolean,
): number | undefined {
  let best: number | undefined;
  for (const poly of polygons) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i] as Vec2;
      const b = poly[(i + 1) % poly.length] as Vec2;
      if ((a.x - x) * (b.x - x) > 0 || a.x === b.x) continue;
      const y = a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
      if (best === undefined || better(y, best)) best = y;
    }
  }
  return best;
}
