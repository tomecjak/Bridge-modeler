import type { Vec3 } from '@bridge/geom';
import type { Tin } from '@bridge/terrain';

export interface TerrainBuffers {
  center: Vec3;
  /** polohy relatívne k stredu (float32 bez trasenia, ADR 0009) */
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  /** súradnice textúry mapy: u = (x − minX) / Δx, v = (y − minY) / Δy v obálke terénu */
  uv: Float32Array;
}

/**
 * Buffre siete terénu pre GPU: trojuholníky otočené proti smeru hodín pri pohľade zhora (LandXML môže mať
 * obe orientácie), hladké normály z priemeru normál susedných trojuholníkov.
 */
export function terrainBuffers(tin: Tin): TerrainBuffers {
  const p = tin.points;
  const n = p.length / 3;
  const b = tin.bounds;
  let zMin = Infinity;
  let zMax = -Infinity;
  for (let i = 2; i < p.length; i += 3) {
    zMin = Math.min(zMin, p[i] as number);
    zMax = Math.max(zMax, p[i] as number);
  }
  const center = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, z: (zMin + zMax) / 2 };
  const positions = new Float32Array(p.length);
  for (let i = 0; i < n; i++) {
    positions[3 * i] = (p[3 * i] as number) - center.x;
    positions[3 * i + 1] = (p[3 * i + 1] as number) - center.y;
    positions[3 * i + 2] = (p[3 * i + 2] as number) - center.z;
  }
  const indices = tin.triangles.slice();
  const acc = new Float64Array(p.length);
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k] as number;
    let bI = indices[k + 1] as number;
    let c = indices[k + 2] as number;
    const ux = (p[3 * bI] as number) - (p[3 * a] as number);
    const uy = (p[3 * bI + 1] as number) - (p[3 * a + 1] as number);
    const uz = (p[3 * bI + 2] as number) - (p[3 * a + 2] as number);
    const vx = (p[3 * c] as number) - (p[3 * a] as number);
    const vy = (p[3 * c + 1] as number) - (p[3 * a + 1] as number);
    const vz = (p[3 * c + 2] as number) - (p[3 * a + 2] as number);
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    if (nz < 0) {
      [bI, c] = [c, bI];
      indices[k + 1] = bI;
      indices[k + 2] = c;
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    for (const v of [a, bI, c]) {
      acc[3 * v] = (acc[3 * v] as number) + nx;
      acc[3 * v + 1] = (acc[3 * v + 1] as number) + ny;
      acc[3 * v + 2] = (acc[3 * v + 2] as number) + nz;
    }
  }
  const uv = new Float32Array(2 * n);
  const dx = b.maxX - b.minX || 1;
  const dy = b.maxY - b.minY || 1;
  for (let i = 0; i < n; i++) {
    uv[2 * i] = ((p[3 * i] as number) - b.minX) / dx;
    uv[2 * i + 1] = ((p[3 * i + 1] as number) - b.minY) / dy;
  }
  const normals = new Float32Array(p.length);
  for (let i = 0; i < n; i++) {
    const x = acc[3 * i] as number;
    const y = acc[3 * i + 1] as number;
    const z = acc[3 * i + 2] as number;
    const len = Math.hypot(x, y, z) || 1;
    normals[3 * i] = x / len;
    normals[3 * i + 1] = y / len;
    normals[3 * i + 2] = len === 1 && z === 0 ? 1 : z / len;
  }
  return { center, positions, normals, indices, uv };
}
