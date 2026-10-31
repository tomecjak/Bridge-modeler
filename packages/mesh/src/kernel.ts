import {
  add3,
  cross3,
  length3,
  normalize3,
  type Polygon2D,
  pointInPolygon,
  scale3,
  signedArea,
  sub3,
  triangulatePolygon,
  type Vec2,
  type Vec3,
  vec3,
} from '@bridge/geom';
import { MeshBuilder, type TriangleMesh } from './mesh.ts';

export interface LoftLoop {
  role: 'outer' | 'void';
  /** body obrysu v lokálnych súradniciach projektu */
  points: readonly Vec3[];
  /** tie isté body v rovine prierezu (x vpravo, y nahor) — orientácia a triangulácia uzáverov */
  plane: Polygon2D;
}

/** Prierez pre loft; všetky prierezy jedného loftu majú rovnaký počet obrysov a bodov v nich. */
export interface LoftSection {
  loops: readonly LoftLoop[];
}

/**
 * Geometrické jadro (princíp 6 v CLAUDE.md). Teleso `S` je pre jadro nepriehľadné; zobrazenie a výstupy
 * pracujú so sieťou z `tessellate`. MVP: `MeshKernel` (teleso = sieť), neskôr OpenCascade (WASM).
 */
export interface GeometryKernel<S> {
  readonly name: string;
  /** teleso medzi postupnosťou prierezov s rovnakou topológiou, s uzávermi na koncoch */
  loft(sections: readonly LoftSection[]): S;
  /**
   * Zvislý hranol nad pôdorysom, spodná a horná plocha dané výškou v každom bode pôdorysu. Pôdorys môže byť
   * rozdelený na časti (napr. medzi ložiskami), v ktorých je horná plocha rovinná; spoločné hrany častí
   * sa nestanú stenami.
   */
  prism(
    outline: Polygon2D | readonly Polygon2D[],
    bottom: (p: Vec2) => number,
    top: (p: Vec2) => number,
  ): S;
  tessellate(solid: S): TriangleMesh;
  /**
   * Presné operácie (ADR 0014) — len jadrá s B-rep telesami (OpenCascade). `MeshKernel` ich nemá a scéna
   * pri ňom ponechá aproximácie (ADR 0009).
   */
  /** odreže časť telesa na strane, kam smeruje normála roviny */
  cut?(solid: S, plane: { origin: Vec3; normal: Vec3 }): S;
  union?(solids: readonly S[]): S;
  subtract?(solid: S, tool: S): S;
  volume?(solid: S): number;
}

const UP = vec3(0, 0, 1);
const DOWN = vec3(0, 0, -1);

function triangleNormalSum(points: readonly Vec3[], tris: readonly number[]): Vec3 {
  let n = vec3(0, 0, 0);
  for (let i = 0; i < tris.length; i += 3) {
    const a = points[tris[i] as number] as Vec3;
    const b = points[tris[i + 1] as number] as Vec3;
    const c = points[tris[i + 2] as number] as Vec3;
    n = add3(n, cross3(sub3(b, a), sub3(c, a)));
  }
  return n;
}

/** Uzáver prierezu: každý vonkajší obrys s dutinami, ktoré v ňom ležia; `flip` otočí orientáciu (koniec loftu). */
function cap(builder: MeshBuilder, section: LoftSection, flip: boolean): void {
  const outers = section.loops.filter((l) => l.role === 'outer');
  const voids = section.loops.filter((l) => l.role === 'void');
  for (const outer of outers) {
    const holes = voids.filter((v) => v.plane[0] && pointInPolygon(v.plane[0], outer.plane));
    const tris = triangulatePolygon(
      outer.plane,
      holes.map((h) => h.plane),
    );
    if (flip) {
      for (let i = 0; i < tris.length; i += 3) {
        const t = tris[i + 1] as number;
        tris[i + 1] = tris[i + 2] as number;
        tris[i + 2] = t;
      }
    }
    const points = [...outer.points, ...holes.flatMap((h) => h.points)];
    const n = triangleNormalSum(points, tris);
    if (length3(n) === 0) continue;
    builder.face(points, tris, normalize3(n));
  }
}

/**
 * Plášť loftu: každá hrana obrysu má vlastný pás vrcholov (ostré hrany prierezu), normály sa priemerujú
 * len pozdĺž pásu (hladké v oblúku). Vonkajší obrys CCW a dutina CW v rovine prierezu → normály von z telesa.
 */
function loftSides(builder: MeshBuilder, sections: readonly LoftSection[], l: number): void {
  const first = sections[0]?.loops[l];
  if (!first) return;
  const m = first.points.length;
  const area = signedArea(first.plane);
  const reverse = first.role === 'outer' ? area < 0 : area > 0;
  const at = (k: number, i: number): Vec3 => {
    const pts = (sections[k] as LoftSection).loops[l]?.points as readonly Vec3[];
    return pts[reverse ? m - 1 - i : i] as Vec3;
  };
  const n = sections.length;
  for (let j = 0; j < m; j++) {
    const j1 = (j + 1) % m;
    // normály štvoruholníkov medzi prierezmi k a k+1
    const quad: Vec3[] = [];
    for (let k = 0; k + 1 < n; k++) {
      const a = at(k, j);
      const b = at(k, j1);
      const c = at(k + 1, j1);
      const d = at(k + 1, j);
      const q = add3(cross3(sub3(d, a), sub3(c, a)), cross3(sub3(c, a), sub3(b, a)));
      const len = length3(q);
      quad.push(len > 0 ? scale3(q, 1 / len) : vec3(0, 0, 0));
    }
    const base = builder.vertexCount;
    for (let k = 0; k < n; k++) {
      const s = add3(quad[k - 1] ?? vec3(0, 0, 0), quad[k] ?? vec3(0, 0, 0));
      const normal = length3(s) > 0 ? normalize3(s) : s;
      builder.vertex(at(k, j), normal);
      builder.vertex(at(k, j1), normal);
    }
    for (let k = 0; k + 1 < n; k++) {
      const a = base + 2 * k;
      const b = a + 1;
      const d = a + 2;
      const c = a + 3;
      builder.triangle(a, d, c);
      builder.triangle(a, c, b);
    }
  }
}

/** Jadro MVP: telesá sú priamo trojuholníkové siete. */
export class MeshKernel implements GeometryKernel<TriangleMesh> {
  readonly name = 'mesh';

  loft(sections: readonly LoftSection[]): TriangleMesh {
    const builder = new MeshBuilder();
    const first = sections[0];
    const last = sections[sections.length - 1];
    if (!first || !last || sections.length < 2) return builder.build();
    for (let l = 0; l < first.loops.length; l++) loftSides(builder, sections, l);
    cap(builder, first, false);
    cap(builder, last, true);
    return builder.build();
  }

  prism(
    outline: Polygon2D | readonly Polygon2D[],
    bottom: (p: Vec2) => number,
    top: (p: Vec2) => number,
  ): TriangleMesh {
    const builder = new MeshBuilder();
    const pieces = (isPolygon(outline) ? [outline] : outline)
      .filter((p) => p.length >= 3 && signedArea(p) !== 0)
      .map((p) => (signedArea(p) < 0 ? [...p].reverse() : p));
    // hrana, ktorú majú dve časti (opačne orientovanú), je vnútorná → bez steny
    const key = (a: Vec2, b: Vec2) => `${a.x},${a.y}|${b.x},${b.y}`;
    const edges = new Set<string>();
    for (const piece of pieces) {
      piece.forEach((a, i) => {
        edges.add(key(a, piece[(i + 1) % piece.length] as Vec2));
      });
    }
    for (const plan of pieces) {
      const lo = plan.map((p) => vec3(p.x, p.y, bottom(p)));
      const hi = plan.map((p) => vec3(p.x, p.y, top(p)));
      const m = plan.length;
      for (let i = 0; i < m; i++) {
        const i1 = (i + 1) % m;
        if (edges.has(key(plan[i1] as Vec2, plan[i] as Vec2))) continue;
        const e = sub3(lo[i1] as Vec3, lo[i] as Vec3);
        const len = Math.hypot(e.x, e.y);
        if (len === 0) continue;
        const n = vec3(e.y / len, -e.x / len, 0);
        const a = builder.vertex(lo[i] as Vec3, n);
        const b = builder.vertex(lo[i1] as Vec3, n);
        const c = builder.vertex(hi[i1] as Vec3, n);
        const d = builder.vertex(hi[i] as Vec3, n);
        builder.triangle(a, b, c);
        builder.triangle(a, c, d);
      }
      const tris = triangulatePolygon(plan);
      const flipped = tris.slice();
      for (let i = 0; i < flipped.length; i += 3) {
        flipped[i + 1] = tris[i + 2] as number;
        flipped[i + 2] = tris[i + 1] as number;
      }
      const flatBottom = lo.every((p) => p.z === (lo[0] as Vec3).z);
      if (flatBottom) builder.face(lo, flipped, DOWN);
      else facets(builder, lo, flipped);
      const flatTop = hi.every((p) => p.z === (hi[0] as Vec3).z);
      if (flatTop) builder.face(hi, tris, UP);
      else facets(builder, hi, tris);
    }
    return builder.build();
  }

  tessellate(solid: TriangleMesh): TriangleMesh {
    return solid;
  }
}

const isPolygon = (o: Polygon2D | readonly Polygon2D[]): o is Polygon2D =>
  o.length === 0 || !Array.isArray(o[0]);

/** Nerovinná plocha: každý trojuholník s vlastnou normálou. */
function facets(builder: MeshBuilder, points: readonly Vec3[], tris: readonly number[]): void {
  for (let i = 0; i < tris.length; i += 3) {
    const t = [tris[i], tris[i + 1], tris[i + 2]].map((k) => points[k as number] as Vec3);
    const n = triangleNormalSum(t, [0, 1, 2]);
    if (length3(n) === 0) continue;
    builder.face(t, [0, 1, 2], normalize3(n));
  }
}
