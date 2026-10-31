import type { Vec2 } from '@bridge/geom';
import type { LayerId } from './layers.ts';

/** Čiara (otvorená) alebo uzavretý obrys v metroch. */
export interface PolylineEntity {
  kind: 'polyline';
  layer: LayerId;
  points: readonly Vec2[];
  closed: boolean;
  /** id objektu modelu (výber v pohľade) */
  owner?: string;
}

/** Jednoriadkový text; poloha je bod zarovnania na účarí. */
export interface TextEntity {
  kind: 'text';
  layer: LayerId;
  at: Vec2;
  text: string;
  /** výška písma [m] */
  height: number;
  /** natočenie proti smeru hodín [rad] */
  rotation: number;
  align: 'left' | 'center' | 'right';
  owner?: string;
}

export type Entity = PolylineEntity | TextEntity;

/**
 * 2D výkres (Fáza 6): entity v metroch (x vpravo, y nahor) a mierka, pre ktorú sú zvolené výšky textov a vzory čiar.
 * Generuje sa vždy nanovo z modelu; kóty, rámik a pečiatka sa dopĺňajú v AutoCADe.
 */
export interface Drawing {
  entities: Entity[];
  /** menovateľ mierky (200 = 1 : 200) */
  scale: number;
}

/** Výška písma 2,5 mm na papieri v metroch modelu. */
export const textHeight = (scale: number) => (2.5 * scale) / 1000;

/** Posunie výkres o (dx, dy), napr. z lokálnych súradníc do S-JTSK. */
export function translate(drawing: Drawing, dx: number, dy: number): Drawing {
  const move = (p: Vec2): Vec2 => ({ x: p.x + dx, y: p.y + dy });
  return {
    ...drawing,
    entities: drawing.entities.map((e) =>
      e.kind === 'polyline' ? { ...e, points: e.points.map(move) } : { ...e, at: move(e.at) },
    ),
  };
}

/** Obálka entít (texty len bodom zarovnania); `undefined` pre prázdny výkres. */
export function drawingBounds(
  drawing: Drawing,
): { minX: number; minY: number; maxX: number; maxY: number } | undefined {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const add = (p: Vec2) => {
    b.minX = Math.min(b.minX, p.x);
    b.minY = Math.min(b.minY, p.y);
    b.maxX = Math.max(b.maxX, p.x);
    b.maxY = Math.max(b.maxY, p.y);
  };
  for (const e of drawing.entities) {
    if (e.kind === 'polyline') e.points.forEach(add);
    else add(e.at);
  }
  return Number.isFinite(b.minX) ? b : undefined;
}

export const polyline = (
  layer: LayerId,
  points: readonly Vec2[],
  closed = false,
  owner?: string,
): PolylineEntity => ({
  kind: 'polyline',
  layer,
  points,
  closed,
  ...(owner === undefined ? {} : { owner }),
});
