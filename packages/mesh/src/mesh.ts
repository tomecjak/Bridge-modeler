import { cross3, length3, sub3, type Vec3 } from '@bridge/geom';

/**
 * Trojuholníková sieť v lokálnych súradniciach projektu (ADR 0003): polohy v double, normály a indexy pre GPU.
 * Trojuholníky sú orientované proti smeru hodinových ručičiek pri pohľade zvonku telesa.
 */
export interface TriangleMesh {
  positions: Float64Array;
  normals: Float32Array;
  indices: Uint32Array;
}

/** Plocha trojuholníka, pod ktorou sa trojuholník považuje za degenerovaný a vynechá sa [m²]. */
export const DEGENERATE_AREA = 1e-12;

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

/** Postupné skladanie siete z vrcholov a trojuholníkov. */
export class MeshBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly indices: number[] = [];

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  vertex(p: Vec3, n: Vec3): number {
    this.positions.push(p.x, p.y, p.z);
    this.normals.push(n.x, n.y, n.z);
    return this.vertexCount - 1;
  }

  position(i: number): Vec3 {
    return {
      x: this.positions[3 * i] as number,
      y: this.positions[3 * i + 1] as number,
      z: this.positions[3 * i + 2] as number,
    };
  }

  /** Pridá trojuholník, ak nie je degenerovaný; vráti, či bol pridaný. */
  triangle(a: number, b: number, c: number): boolean {
    const pa = this.position(a);
    const area = length3(cross3(sub3(this.position(b), pa), sub3(this.position(c), pa))) / 2;
    if (!(area > DEGENERATE_AREA)) return false;
    this.indices.push(a, b, c);
    return true;
  }

  /** Rovinný mnohouholník s jednou normálou pre všetky trojuholníky (vrcholy sa nezdieľajú s okolím). */
  face(points: readonly Vec3[], triangles: readonly number[], normal: Vec3): void {
    const base = points.map((p) => this.vertex(p, normal));
    for (let i = 0; i < triangles.length; i += 3) {
      this.triangle(
        base[triangles[i] as number] as number,
        base[triangles[i + 1] as number] as number,
        base[triangles[i + 2] as number] as number,
      );
    }
  }

  build(): TriangleMesh {
    return {
      positions: Float64Array.from(this.positions),
      normals: Float32Array.from(this.normals),
      indices: Uint32Array.from(this.indices),
    };
  }
}

/** Spojí siete do jednej (poradie vstupov sa zachová). */
export function mergeMeshes(meshes: readonly TriangleMesh[]): TriangleMesh {
  const nv = meshes.reduce((a, m) => a + m.positions.length, 0);
  const ni = meshes.reduce((a, m) => a + m.indices.length, 0);
  const out: TriangleMesh = {
    positions: new Float64Array(nv),
    normals: new Float32Array(nv),
    indices: new Uint32Array(ni),
  };
  let v = 0;
  let i = 0;
  for (const m of meshes) {
    out.positions.set(m.positions, v);
    out.normals.set(m.normals, v);
    for (let k = 0; k < m.indices.length; k++)
      out.indices[i + k] = (m.indices[k] as number) + v / 3;
    v += m.positions.length;
    i += m.indices.length;
  }
  return out;
}

export function meshBounds(mesh: TriangleMesh): Bounds | undefined {
  const p = mesh.positions;
  if (p.length === 0) return undefined;
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i] as number;
    const y = p[i + 1] as number;
    const z = p[i + 2] as number;
    if (x < min.x) min.x = x;
    if (y < min.y) min.y = y;
    if (z < min.z) min.z = z;
    if (x > max.x) max.x = x;
    if (y > max.y) max.y = y;
    if (z > max.z) max.z = z;
  }
  return { min, max };
}

/** Objem uzavretej siete (divergenčná veta); kladný pri správnej orientácii trojuholníkov. */
export function meshVolume(mesh: TriangleMesh): number {
  const p = mesh.positions;
  const idx = mesh.indices;
  // relatívne k prvému vrcholu, aby veľké súradnice nestratili presnosť
  const ox = p[0] ?? 0;
  const oy = p[1] ?? 0;
  const oz = p[2] ?? 0;
  let sum = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]].map((i) => 3 * (i as number)) as [
      number,
      number,
      number,
    ];
    const ax = (p[a] as number) - ox;
    const ay = (p[a + 1] as number) - oy;
    const az = (p[a + 2] as number) - oz;
    const bx = (p[b] as number) - ox;
    const by = (p[b + 1] as number) - oy;
    const bz = (p[b + 2] as number) - oz;
    const cx = (p[c] as number) - ox;
    const cy = (p[c + 1] as number) - oy;
    const cz = (p[c + 2] as number) - oz;
    sum += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return sum / 6;
}
