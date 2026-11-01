import { type Vec2, vec2, vec3 } from '@bridge/geom';
import { clearanceOutline, clearanceRegions, type ObstacleResult } from '@bridge/sections';
import type { GeometryKernel, LoftSection } from './kernel.ts';
import { mergeMeshes, type TriangleMesh } from './mesh.ts';

/**
 * Hranol voľného prierezu prekážky v okolí krížení (ADR 0020): obrys voľného prierezu v reze kolmo na os prekážky
 * vedený po osi s úrovňou spodku v každom bode. Bez úrovne alebo rozmerov prázdna sieť.
 */
export function clearanceMesh<S>(kernel: GeometryKernel<S>, r: ObstacleResult): TriangleMesh {
  const c = r.clearance;
  const empty: TriangleMesh = {
    positions: new Float64Array(),
    normals: new Float32Array(),
    indices: new Uint32Array(),
  };
  if (!c) return empty;
  const outline = clearanceOutline(c);
  const meshes = clearanceRegions(r).flatMap((region) => {
    const sections: LoftSection[] = region.flatMap((p, i) => {
      const level = r.levelAt(p.t);
      if (level === undefined) return [];
      const a = region[Math.max(0, i - 1)] as (typeof region)[number];
      const b = region[Math.min(region.length - 1, i + 1)] as (typeof region)[number];
      const dx = b.point.x - a.point.x;
      const dy = b.point.y - a.point.y;
      const len = Math.hypot(dx, dy) || 1;
      const n: Vec2 = vec2(dy / len, -dx / len); // vpravo od osi prekážky
      return [
        {
          loops: [
            {
              role: 'outer' as const,
              points: outline.map((q) =>
                vec3(p.point.x + q.x * n.x, p.point.y + q.x * n.y, level + q.y),
              ),
              plane: outline,
            },
          ],
        },
      ];
    });
    return sections.length >= 2 ? [kernel.tessellate(kernel.loft(sections))] : [];
  });
  return meshes.length > 0 ? mergeMeshes(meshes) : empty;
}
