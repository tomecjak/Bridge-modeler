import type { Vec2 } from '@bridge/geom';
import type { LayerId } from './layers.ts';
import type { TextEntity } from './model.ts';

/**
 * Text čitateľný zdola alebo sprava: natočenie mimo (−90°, 90°] sa otočí o 180° a zarovnanie sa zrkadlí, takže text
 * ostane na tej istej strane bodu.
 */
export function readableText(
  layer: LayerId,
  at: Vec2,
  text: string,
  height: number,
  rotation: number,
  align: TextEntity['align'],
  owner?: string,
): TextEntity {
  let r = Math.atan2(Math.sin(rotation), Math.cos(rotation));
  let a = align;
  if (r > Math.PI / 2 + 1e-9 || r <= -Math.PI / 2 + 1e-9) {
    r = r > 0 ? r - Math.PI : r + Math.PI;
    a = align === 'left' ? 'right' : align === 'right' ? 'left' : 'center';
  }
  return {
    kind: 'text',
    layer,
    at,
    text,
    height,
    rotation: r + 0,
    align: a,
    ...(owner === undefined ? {} : { owner }),
  };
}
