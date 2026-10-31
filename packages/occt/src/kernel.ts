import { type Polygon2D, type Vec2, type Vec3, vec3 } from '@bridge/geom';
import type { GeometryKernel, LoftSection, TriangleMesh } from '@bridge/mesh';
import { type InitOptions, OcctKernel, type ShapeHandle } from 'occt-wasm';

/** Odchýlka tetivy pri tesselácii presných telies [m] (rovnaká tolerancia ako vzorkovanie NK, ADR 0009). */
export const OCCT_DEFLECTION = 0.002;
/** Vnútorná jednotka occt-wasm pri importe / exporte STEP je milimeter. */
const MM_PER_M = 1000;
const MILLIMETRE_UNIT = 'SI_UNIT(.MILLI.,.METRE.)';
/** Tolerancia zošitia stien hranola [m]. */
const SEW_TOLERANCE = 1e-6;

/** Teleso podľa mena do súboru STEP (meno „názov (id)“ z modelu, princíp 7). */
export interface NamedSolid {
  name: string;
  solid: ShapeHandle;
}

/**
 * OpenCascade (occt-wasm, ADR 0014) za rozhraním `GeometryKernel`: presný priamkový loft medzi prierezmi, hranol
 * zošitý z rovinných stien, booleovské operácie, objem, tesselácia a STEP s menami telies. Telesá sú handly
 * v aréne jadra; `releaseAll` ich uvoľní (napr. pred novým výpočtom scény).
 */
export class OcctGeometryKernel implements GeometryKernel<ShapeHandle> {
  readonly name = 'OpenCascade';

  private readonly oc: OcctKernel;

  private constructor(oc: OcctKernel) {
    this.oc = oc;
  }

  /** Načíta WASM (v prehliadači z vlastnej URL — LGPL, samostatný súbor) a vytvorí jadro. */
  static async create(options?: InitOptions): Promise<OcctGeometryKernel> {
    return new OcctGeometryKernel(await OcctKernel.init(options));
  }

  private polygonWire(points: readonly Vec3[]): ShapeHandle {
    const edges = points.map((p, i) =>
      this.oc.makeLineEdge(p, points[(i + 1) % points.length] as Vec3),
    );
    return this.oc.makeWire(edges);
  }

  loft(sections: readonly LoftSection[]): ShapeHandle {
    const first = sections[0];
    if (!first) throw new Error('Loft potrebuje aspoň dva prierezy.');
    const solids = first.loops.map((loop, l) => ({
      role: loop.role,
      solid: this.outward(
        this.oc.loft(
          sections.map((s) => this.polygonWire(s.loops[l]?.points ?? [])),
          true,
          true,
        ),
      ),
    }));
    const outers = solids.filter((s) => s.role === 'outer').map((s) => s.solid);
    const voids = solids.filter((s) => s.role === 'void').map((s) => s.solid);
    const body = outers.length === 1 ? (outers[0] as ShapeHandle) : this.oc.fuseAll(outers);
    return voids.length > 0 ? this.oc.cutAll(body, voids) : body;
  }

  prism(
    outline: Polygon2D | readonly Polygon2D[],
    bottom: (p: Vec2) => number,
    top: (p: Vec2) => number,
  ): ShapeHandle {
    const pieces = (isPolygonList(outline) ? outline : [outline]) as readonly Polygon2D[];
    const solids = pieces.map((piece) => this.prismPiece(piece, bottom, top));
    return solids.length === 1 ? (solids[0] as ShapeHandle) : this.oc.fuseAll(solids);
  }

  /** Hranol jednej časti: spodná a horná stena (rovinné na časti) a zvislé bočné steny, zošité do telesa. */
  private prismPiece(
    piece: Polygon2D,
    bottom: (p: Vec2) => number,
    top: (p: Vec2) => number,
  ): ShapeHandle {
    const lo = piece.map((p) => vec3(p.x, p.y, bottom(p)));
    const hi = piece.map((p) => vec3(p.x, p.y, top(p)));
    const faces = [...this.faces(lo), ...this.faces(hi)];
    for (let i = 0; i < piece.length; i++) {
      const j = (i + 1) % piece.length;
      // bok nulovej výšky na oboch koncoch vynechá; trojuholník, ak je nulová len jedna strana
      faces.push(...this.faces([lo[i], lo[j], hi[j], hi[i]] as Vec3[]));
    }
    return this.outward(this.oc.sewAndSolidify(faces, SEW_TOLERANCE));
  }

  /**
   * Stena z mnohouholníka bez opakovaných bodov: rovinná, inak nerovinná plocha, inak vejár trojuholníkov
   * (napr. horná plocha časti, ktorá nie je presne rovinná).
   */
  private faces(points: readonly Vec3[]): ShapeHandle[] {
    const pts = points.filter((p, k) => k === 0 || !samePoint(p, points[k - 1] as Vec3));
    while (pts.length > 2 && samePoint(pts[0] as Vec3, pts[pts.length - 1] as Vec3)) pts.pop();
    if (pts.length < 3) return [];
    try {
      return [this.oc.makeFace(this.polygonWire(pts))];
    } catch {
      try {
        return [this.oc.makeNonPlanarFace(this.polygonWire(pts))];
      } catch {
        const a = pts[0] as Vec3;
        return pts.slice(1, -1).map((b, k) => this.oc.buildTriFace(a, b, pts[k + 2] as Vec3));
      }
    }
  }

  /** Teleso s normálami von (zošité steny môžu dať obrátenú orientáciu = záporný objem). */
  private outward(solid: ShapeHandle): ShapeHandle {
    return this.oc.getVolume(solid) < 0 ? this.oc.reverseShape(solid) : solid;
  }

  /**
   * Sieť telesa v lokálnych súradniciach (double): teleso sa pred tesseláciou posunie k stredu svojej obálky,
   * lebo OCCT vracia polohy vo float32 (ADR 0014).
   */
  tessellate(solid: ShapeHandle): TriangleMesh {
    const b = this.oc.getBoundingBox(solid);
    const c = vec3((b.xmin + b.xmax) / 2, (b.ymin + b.ymax) / 2, (b.zmin + b.zmax) / 2);
    const moved = this.oc.translate(solid, -c.x, -c.y, -c.z);
    const mesh = this.oc.tessellate(moved, {
      linearDeflection: OCCT_DEFLECTION,
      angularDeflection: 0.2,
    });
    this.oc.release(moved);
    const positions = new Float64Array(mesh.positions.length);
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] = (mesh.positions[i] as number) + c.x;
      positions[i + 1] = (mesh.positions[i + 1] as number) + c.y;
      positions[i + 2] = (mesh.positions[i + 2] as number) + c.z;
    }
    return { positions, normals: mesh.normals.slice(), indices: mesh.indices.slice() };
  }

  cut(solid: ShapeHandle, plane: { origin: Vec3; normal: Vec3 }): ShapeHandle {
    // polpriestor vypĺňa stranu, kam smeruje normála → odreže sa práve tá
    const half = this.oc.halfSpace(plane.origin, plane.normal);
    const out = this.oc.cut(solid, half);
    this.oc.release(half);
    return out;
  }

  union(solids: readonly ShapeHandle[]): ShapeHandle {
    if (solids.length === 1) return solids[0] as ShapeHandle;
    return this.oc.fuseAll([...solids]);
  }

  subtract(solid: ShapeHandle, tool: ShapeHandle): ShapeHandle {
    return this.oc.cut(solid, tool);
  }

  volume(solid: ShapeHandle): number {
    return this.oc.getVolume(solid);
  }

  /** Obálka telesa (presná). */
  bounds(solid: ShapeHandle): { min: Vec3; max: Vec3 } {
    const b = this.oc.getBoundingBox(solid);
    return { min: vec3(b.xmin, b.ymin, b.zmin), max: vec3(b.xmax, b.ymax, b.zmax) };
  }

  /**
   * STEP (AP214, metre) s pomenovanými telesami, posunutými o `offset` (napr. lokálny počiatok → S-JTSK).
   * occt-wasm berie vnútorné jednotky ako milimetre: súbor sa zapíše „v mm“ bez prepočtu (čísla = metre modelu)
   * a jednotka dĺžky sa v ňom prepíše na meter. Zväčšenie na mm by v S-JTSK dalo súradnice ~1e9, pri ktorých
   * tolerancie OCCT už nestačia. Časová pečiatka v hlavičke sa nahradí pevnou (princíp 7).
   */
  exportStep(solids: readonly NamedSolid[], offset: Vec3 = vec3(0, 0, 0)): string {
    const doc = this.oc.createXCAFDocument();
    const temporary: ShapeHandle[] = [];
    try {
      for (const s of solids) {
        const moved = this.oc.translate(s.solid, offset.x, offset.y, offset.z);
        temporary.push(moved);
        doc.setName(doc.addShape(moved), s.name);
      }
      const step = doc.exportSTEP({ unit: 'mm', schema: 'AP214' });
      return normalizeStepHeader(step.replaceAll(MILLIMETRE_UNIT, 'SI_UNIT($,.METRE.)'));
    } finally {
      doc.close();
      for (const t of temporary) this.oc.release(t);
    }
  }

  /** Načíta STEP (kontrola spätného načítania) a vráti objemy telies v ňom [m³]. */
  stepVolumes(step: string): number[] {
    const shape = this.oc.importStep(step);
    const solids = this.oc.getSubShapes(shape, 'solid');
    // import vracia milimetre
    return solids.map((s) => this.oc.getVolume(s) / MM_PER_M ** 3);
  }

  /** Uvoľní všetky telesá v aréne jadra. */
  releaseAll(): void {
    this.oc.releaseAll();
  }
}

const isPolygonList = (o: Polygon2D | readonly Polygon2D[]): o is readonly Polygon2D[] =>
  Array.isArray(o[0]);

const samePoint = (a: Vec3, b: Vec3) =>
  Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9 && Math.abs(a.z - b.z) < 1e-9;

/** Pevná časová pečiatka a autor v `FILE_NAME` hlavičky STEP. */
export function normalizeStepHeader(step: string): string {
  return step.replace(
    /FILE_NAME\('([^']*)','[^']*'/,
    (_m, name: string) => `FILE_NAME('${name}','2000-01-01T00:00:00'`,
  );
}
