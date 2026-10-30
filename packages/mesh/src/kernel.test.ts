import { type Polygon2D, signedArea, type Vec2, type Vec3, vec2, vec3 } from '@bridge/geom';
import { describe, expect, it } from 'vitest';
import { type LoftSection, MeshKernel } from './kernel.ts';
import { mergeMeshes, meshBounds, meshVolume, type TriangleMesh } from './mesh.ts';
import { sliceMesh } from './slice.ts';

const kernel = new MeshKernel();

const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  vec2(x0, y0),
  vec2(x1, y0),
  vec2(x1, y1),
  vec2(x0, y1),
];

/** Trám s dutinou v rovine prierezu (x vpravo, y nahor). */
const outer = rect(-3, -2, 3, 0);
const hole = rect(-1, -1.5, 1, -0.5).reverse();

/** Prierez na staničení s (os y = sever) — x prierezu na východ, y prierezu nahor. */
function sectionAt(s: number, loops = [outer, hole]): LoftSection {
  return {
    loops: loops.map((plane, i) => ({
      role: i === 0 ? 'outer' : 'void',
      plane,
      points: plane.map((p) => vec3(p.x, s, p.y)),
    })),
  };
}

/** Každá hrana je zdieľaná práve dvoma trojuholníkmi s opačnou orientáciou (podľa polôh vrcholov). */
function expectClosed(mesh: TriangleMesh) {
  const p = mesh.positions;
  const k = (i: number) => `${p[3 * i]},${p[3 * i + 1]},${p[3 * i + 2]}`;
  const edges = new Map<string, number>();
  for (let t = 0; t < mesh.indices.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = k(mesh.indices[t + e] as number);
      const b = k(mesh.indices[t + ((e + 1) % 3)] as number);
      edges.set(`${a}|${b}`, (edges.get(`${a}|${b}`) ?? 0) + 1);
    }
  }
  for (const [e, count] of edges) {
    const [a, b] = e.split('|');
    expect(edges.get(`${b}|${a}`), e).toBe(count);
  }
}

describe('MeshKernel.loft', () => {
  it('builds a closed, outward-oriented box girder between two sections', () => {
    const mesh = kernel.loft([sectionAt(0), sectionAt(10)]);
    expectClosed(mesh);
    expect(meshVolume(mesh)).toBeCloseTo((12 - 2) * 10, 9);
    expect(meshBounds(mesh)).toEqual({ min: vec3(-3, 0, -2), max: vec3(3, 10, 0) });
  });

  it('accepts loops in the opposite orientation', () => {
    const mesh = kernel.loft([
      sectionAt(0, [[...outer].reverse(), [...hole].reverse()]),
      sectionAt(5, [[...outer].reverse(), [...hole].reverse()]),
    ]);
    expectClosed(mesh);
    expect(meshVolume(mesh)).toBeCloseTo(10 * 5, 9);
  });

  it('gives sharp profile corners and normals smooth along the sweep', () => {
    const mesh = kernel.loft([
      sectionAt(0, [outer]),
      sectionAt(5, [outer]),
      sectionAt(10, [outer]),
    ]);
    // horná plocha (y prierezu = 0 → z = 0) má normálu nahor, spodná nadol
    const n = mesh.normals;
    const p = mesh.positions;
    for (let i = 0; i < p.length / 3; i++) {
      const len = Math.hypot(n[3 * i] as number, n[3 * i + 1] as number, n[3 * i + 2] as number);
      expect(len).toBeCloseTo(1, 6);
    }
    const ups = [];
    for (let i = 0; i < p.length / 3; i++) if (n[3 * i + 2] === 1) ups.push(p[3 * i + 2]);
    expect(ups.length).toBeGreaterThan(0);
    expect(ups.every((z) => z === 0)).toBe(true);
  });

  it('returns an empty mesh for fewer than two sections', () => {
    expect(kernel.loft([sectionAt(0)]).indices).toHaveLength(0);
  });
});

describe('MeshKernel.prism', () => {
  it('builds a closed column with a sloped top', () => {
    const outline = rect(0, 0, 2, 1);
    const mesh = kernel.prism(
      outline,
      () => 0,
      (p) => 5 + 0.5 * p.x,
    );
    expectClosed(mesh);
    expect(meshVolume(mesh)).toBeCloseTo(2 * 1 * (5 + 0.5), 9);
  });

  it('builds a circular column with a clockwise outline', () => {
    const n = 32;
    const circle: Polygon2D = Array.from({ length: n }, (_, i) => {
      const t = (-2 * Math.PI * i) / n;
      return vec2(Math.cos(t), Math.sin(t));
    });
    const mesh = kernel.prism(
      circle,
      () => -1,
      () => 3,
    );
    expectClosed(mesh);
    expect(meshVolume(mesh)).toBeCloseTo(-signedArea(circle) * 4, 9);
  });
});

describe('sliceMesh', () => {
  it('cuts the box girder into the outline and the void', () => {
    const mesh = kernel.loft([sectionAt(0), sectionAt(10)]);
    const loops = sliceMesh(mesh, { origin: vec3(0, 3.7, 0), normal: vec3(0, 1, 0) });
    expect(loops).toHaveLength(2);
    const areas = loops
      .map((l) => Math.abs(signedArea(l.map((q: Vec3) => vec2(q.x, q.z)))))
      .sort((a, b) => b - a);
    expect(areas[0]).toBeCloseTo(12, 9);
    expect(areas[1]).toBeCloseTo(2, 9);
    for (const q of loops.flat()) expect(q.y).toBeCloseTo(3.7, 12);
  });

  it('cuts exactly through a section of the loft', () => {
    const mesh = kernel.loft([
      sectionAt(0, [outer]),
      sectionAt(5, [outer]),
      sectionAt(10, [outer]),
    ]);
    const loops = sliceMesh(mesh, { origin: vec3(0, 5, 0), normal: vec3(0, 1, 0) });
    expect(loops).toHaveLength(1);
    expect(Math.abs(signedArea((loops[0] as Vec3[]).map((q) => vec2(q.x, q.z))))).toBeCloseTo(
      12,
      12,
    );
  });

  it('merges meshes and slices both parts', () => {
    const a = kernel.loft([sectionAt(0, [outer]), sectionAt(10, [outer])]);
    const b = kernel.prism(
      rect(-1, 4, 1, 6),
      () => -10,
      () => -2,
    );
    const merged = mergeMeshes([a, b]);
    expectClosed(merged);
    expect(meshVolume(merged)).toBeCloseTo(120 + 4 * 8, 9);
    expect(sliceMesh(merged, { origin: vec3(0, 5, 0), normal: vec3(0, 1, 0) })).toHaveLength(2);
  });
});
