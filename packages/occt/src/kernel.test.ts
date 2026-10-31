import { type Polygon2D, vec2, vec3 } from '@bridge/geom';
import { type LoftSection, MeshKernel, meshBounds, meshVolume } from '@bridge/mesh';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { normalizeStepHeader, OcctGeometryKernel } from './kernel.ts';

let kernel: OcctGeometryKernel;
beforeAll(async () => {
  kernel = await OcctGeometryKernel.create();
});

/** Obdĺžnikový prierez kolmý na os y v polohe y, šírka b, výška h (spodok z = 0), voliteľne s dutinou. */
function section(y: number, b: number, h: number, hole?: number): LoftSection {
  const rect = (w: number, z0: number, z1: number): Polygon2D => [
    vec2(-w / 2, z0),
    vec2(w / 2, z0),
    vec2(w / 2, z1),
    vec2(-w / 2, z1),
  ];
  const to3 = (p: Polygon2D) => p.map((q) => vec3(q.x, y, q.y));
  const outer = rect(b, 0, h);
  const loops: LoftSection['loops'][number][] = [
    { role: 'outer', plane: outer, points: to3(outer) },
  ];
  if (hole) {
    const v = [...rect(hole, (h - hole) / 2, (h + hole) / 2)].reverse();
    loops.push({ role: 'void', plane: v, points: to3(v) });
  }
  return { loops };
}

describe('OcctGeometryKernel', () => {
  it('lofts tapered sections with voids to the same volume as the mesh kernel', () => {
    const sections = [section(0, 4, 2, 1), section(5, 3, 2, 1), section(9, 3, 1.5, 0.5)];
    const exact = kernel.loft(sections);
    const mesh = new MeshKernel();
    expect(kernel.volume(exact)).toBeCloseTo(meshVolume(mesh.tessellate(mesh.loft(sections))), 9);
    expect(meshVolume(kernel.tessellate(exact))).toBeCloseTo(kernel.volume(exact), 9);
  });

  it('builds prisms with a folded top as one solid like the mesh kernel', () => {
    const left: Polygon2D = [vec2(0, 0), vec2(2, 0), vec2(2, 3), vec2(0, 3)];
    const right: Polygon2D = [vec2(2, 0), vec2(5, 0), vec2(5, 3), vec2(2, 3)];
    // horná plocha zalomená v x = 2 (stúpa doľava aj doprava), spodok vodorovný
    const top = (p: { x: number }) => 4 + Math.abs(p.x - 2) * 0.1;
    const exact = kernel.prism([left, right], () => 1, top);
    const mesh = new MeshKernel();
    const expected = meshVolume(mesh.tessellate(mesh.prism([left, right], () => 1, top)));
    expect(kernel.volume(exact)).toBeCloseTo(expected, 9);
    // spoločná stena častí v telese nie je → jedno teleso
    expect(kernel.volume(kernel.union([exact]))).toBeCloseTo(expected, 9);
  });

  it('cuts by a plane on the side of its normal, unites and subtracts solids', () => {
    const box = kernel.prism(
      [vec2(0, 0), vec2(4, 0), vec2(4, 2), vec2(0, 2)],
      () => 0,
      () => 1,
    );
    expect(
      kernel.volume(kernel.cut(box, { origin: vec3(1, 0, 0), normal: vec3(1, 0, 0) })),
    ).toBeCloseTo(2, 9);
    const other = kernel.prism(
      [vec2(3, 0), vec2(6, 0), vec2(6, 2), vec2(3, 2)],
      () => 0,
      () => 1,
    );
    expect(kernel.volume(kernel.union([box, other]))).toBeCloseTo(12, 9);
    expect(kernel.volume(kernel.subtract(box, other))).toBeCloseTo(6, 9);
  });

  it('tessellates far from the origin without losing precision', () => {
    const x0 = 1234.5678;
    const box = kernel.prism(
      [vec2(x0, 0), vec2(x0 + 1, 0), vec2(x0 + 1, 1), vec2(x0, 1)],
      () => 300,
      () => 301.25,
    );
    const b = meshBounds(kernel.tessellate(box));
    expect(b?.min.x).toBeCloseTo(x0, 9);
    expect(b?.max.z).toBeCloseTo(301.25, 9);
  });

  it('writes named solids to a deterministic STEP that reads back with the same volumes', () => {
    // zápis STEP v OCCT vypisuje štatistiku prenosu; balík je bez typov DOM/Node → konzola cez globalThis
    const output = (globalThis as unknown as { console: { log: (...args: unknown[]) => void } })
      .console;
    const quiet = vi.spyOn(output, 'log').mockImplementation(() => undefined);
    try {
      const a = kernel.prism(
        [vec2(0, 0), vec2(2, 0), vec2(2, 1), vec2(0, 1)],
        () => 0,
        () => 1,
      );
      const b = kernel.prism(
        [vec2(5, 0), vec2(6, 0), vec2(6, 1), vec2(5, 1)],
        () => 0,
        () => 3,
      );
      const solids = [
        { name: 'NK 1 (nk)', solid: a },
        { name: 'Pilier P2 (p2)', solid: b },
      ];
      const offset = vec3(-460000, -1240000, 0);
      const step = kernel.exportStep(solids, offset);
      expect(kernel.exportStep(solids, offset)).toBe(step);
      expect(step).toContain("FILE_NAME('");
      expect(step).toContain("'2000-01-01T00:00:00'");
      expect(step).toContain("PRODUCT('NK 1 (nk)'");
      expect(step).toContain("PRODUCT('Pilier P2 (p2)'");
      expect(kernel.stepVolumes(step).sort()).toEqual([expect.closeTo(2, 6), expect.closeTo(3, 6)]);
      // súradnice v súbore sú v metroch v S-JTSK (nie milimetre ani tisíciny)
      const xs = [...step.matchAll(/CARTESIAN_POINT\('',\(([-\d.E+]+),([-\d.E+]+)/g)].map((m) => [
        Number(m[1]),
        Number(m[2]),
      ]);
      expect(Math.min(...xs.map((p) => p[0] as number))).toBeCloseTo(-460000, 6);
      // pôvodná chyba mm ↔ m dala súradnice v tisícinách (≈ −460); body umiestnenia plôch môžu byť pri 0
      expect(xs.some((p) => Math.abs((p[0] as number) + 459994) < 1e-6)).toBe(true);
      expect(xs.filter((p) => (p[0] as number) < -400 && (p[0] as number) > -500)).toEqual([]);
      expect(step).not.toContain('.MILLI.');
      expect(Math.min(...xs.map((p) => p[1] as number))).toBeCloseTo(-1240000, 6);
      expect(step).toContain('SI_UNIT($,.METRE.)');
    } finally {
      quiet.mockRestore();
    }
  });
});

describe('normalizeStepHeader', () => {
  it('replaces only the time stamp in FILE_NAME', () => {
    expect(normalizeStepHeader("FILE_NAME('Model','2026-10-31T14:05:20',('Author'),());")).toBe(
      "FILE_NAME('Model','2000-01-01T00:00:00',('Author'),());",
    );
  });
});
