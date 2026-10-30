import { type Polygon2D, pointInPolygon, triangulatePolygon, type Vec3 } from '@bridge/geom';
import type { SceneObjectKind } from '@bridge/mesh';
import {
  AmbientLight,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  EdgesGeometry,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { MeshUpdate, RenderObject } from './mesh.worker.ts';

/** Uhol medzi plochami, nad ktorým sa hrana zvýrazní čiarou [°]. */
const EDGE_ANGLE = 30;

interface Theme {
  background: string;
  accent: string;
  edges: string;
  /** výplň rezu */
  cut: string;
}

/** Obrys prierezu NK pre uzáver rezu: body v rovine prierezu (triangulácia) a v lokálnych súradniciach. */
export interface CutLoop {
  role: 'outer' | 'void';
  plane: Polygon2D;
  points: readonly Vec3[];
}

export interface Cut {
  /** bod roviny a jednotková normála; zobrazí sa časť v smere normály (za rezom v smere staničenia) */
  origin: Vec3;
  normal: Vec3;
  /** obrysy prierezov NK v rovine rezu, po NK */
  sections: readonly (readonly CutLoop[])[];
}

/** Posun uzáveru rezu pred rovinu, aby ho rezová rovina neorezala [m]. */
const CAP_OFFSET = 0.002;

export interface Picked {
  kind: SceneObjectKind;
  id: string;
}

interface Entry {
  kind: SceneObjectKind;
  id: string;
  mesh: Mesh;
  edges: LineSegments;
}

/**
 * Imperatívny obal three.js scény (ADR 0009). Lokálne súradnice projektu, os z nahor. Každá sieť má vrcholy
 * relatívne k svojmu stredu a `position` = stred, takže matica model–pohľad sa skladá v double na CPU
 * a do GPU idú len malé čísla — pri priblížení nič netrasie.
 */
export class SceneView {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(40, 1, 0.01, 1e6);
  private readonly controls: OrbitControls;
  private readonly entries = new Map<string, Entry>();
  private readonly raycaster = new Raycaster();
  private readonly materials: Record<SceneObjectKind | 'selected', MeshStandardMaterial>;
  private readonly edgeMaterial: LineBasicMaterial;
  private readonly axisMaterial: LineBasicMaterial;
  private readonly capMaterial = new MeshBasicMaterial({ side: DoubleSide });
  private caps: Mesh[] = [];
  private axisLine: Line | undefined;
  private selectedKey: string | undefined;
  private clipping: Plane[] = [];
  private frame = 0;
  /** k čomu sa naposledy automaticky prispôsobil pohľad (model má prednosť pred osou) */
  private fitted: 'none' | 'axis' | 'model' = 'none';

  constructor(host: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.localClippingEnabled = true;
    host.appendChild(this.renderer.domElement);

    this.camera.up.set(0, 0, 1);
    this.camera.position.set(-100, -100, 80);
    this.scene.add(this.camera);
    this.scene.add(new AmbientLight(0xffffff, 1.1));
    const head = new DirectionalLight(0xffffff, 1.8);
    head.position.set(-0.4, 0.6, 1); // svetlo spojené s kamerou, mierne zhora zľava
    this.camera.add(head);

    this.materials = {
      superstructure: new MeshStandardMaterial({ color: 0xc4c0b6, roughness: 0.9 }),
      support: new MeshStandardMaterial({ color: 0xa8a399, roughness: 0.9 }),
      selected: new MeshStandardMaterial({ color: 0xc4c0b6, roughness: 0.9 }),
    };
    for (const m of Object.values(this.materials)) {
      m.side = DoubleSide; // pri reze rovinou je vidno aj vnútro
      m.polygonOffset = true; // hrany nad plochami
      m.polygonOffsetFactor = 1;
      m.polygonOffsetUnits = 1;
    }
    this.edgeMaterial = new LineBasicMaterial({ transparent: true, opacity: 0.55 });
    this.axisMaterial = new LineBasicMaterial({ color: 0xd97706 });

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.screenSpacePanning = true;
    this.controls.zoomToCursor = true;
    this.controls.addEventListener('change', () => this.requestRender());
  }

  setTheme(theme: Theme): void {
    this.scene.background = new Color(theme.background);
    this.materials.selected.color.set(theme.accent);
    this.capMaterial.color.set(theme.cut);
    this.edgeMaterial.color.set(theme.edges);
    this.requestRender();
  }

  resize(width: number, height: number): void {
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  /** Použije výsledok workera: nahradí zmenené objekty, odstráni zmiznuté, zoradí podľa modelu. */
  apply(update: MeshUpdate): void {
    for (const key of update.removed) this.remove(key);
    for (const o of update.changed) {
      this.remove(o.key);
      this.add(o);
    }
    if (this.fitted !== 'model' && this.entries.size > 0) this.fit();
    this.requestRender();
  }

  /** Os cesty ako 3D čiara; body v lokálnych súradniciach (posunuté k stredu kvôli presnosti). */
  setAxis(points: readonly { x: number; y: number; z: number }[]): void {
    if (this.axisLine) {
      this.scene.remove(this.axisLine);
      this.axisLine.geometry.dispose();
      this.axisLine = undefined;
    }
    if (points.length >= 2) {
      const c = center(points);
      const arr = new Float32Array(points.length * 3);
      points.forEach((p, i) => {
        arr[3 * i] = p.x - c.x;
        arr[3 * i + 1] = p.y - c.y;
        arr[3 * i + 2] = p.z - c.z;
      });
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(arr, 3));
      this.axisLine = new Line(g, this.axisMaterial);
      this.axisLine.position.set(c.x, c.y, c.z);
      this.scene.add(this.axisLine);
      if (this.fitted === 'none' && this.entries.size === 0) this.fit();
    }
    this.requestRender();
  }

  setSelected(picked: Picked | undefined): void {
    const key = picked && `${picked.kind}:${picked.id}`;
    if (key === this.selectedKey) return;
    const prev = this.selectedKey ? this.entries.get(this.selectedKey) : undefined;
    if (prev) prev.mesh.material = this.materials[prev.kind];
    this.selectedKey = key;
    const next = key ? this.entries.get(key) : undefined;
    if (next) next.mesh.material = this.materials.selected;
    this.requestRender();
  }

  /** Rez rovinou: orezanie všetkých objektov a uzávery prierezov NK; `undefined` = bez rezu. */
  setCut(cut: Cut | undefined): void {
    for (const cap of this.caps) {
      this.scene.remove(cap);
      cap.geometry.dispose();
    }
    this.caps = [];
    const n = cut && new Vector3(cut.normal.x, cut.normal.y, cut.normal.z);
    this.clipping =
      cut && n ? [new Plane(n, -n.dot(new Vector3(cut.origin.x, cut.origin.y, cut.origin.z)))] : [];
    for (const m of [...Object.values(this.materials), this.edgeMaterial]) {
      m.clippingPlanes = this.clipping;
      m.needsUpdate = true;
    }
    for (const loops of cut?.sections ?? []) {
      const cap = capMesh(loops, cut?.normal ?? { x: 0, y: 0, z: 0 }, this.capMaterial);
      if (!cap) continue;
      this.caps.push(cap);
      this.scene.add(cap);
    }
    this.requestRender();
  }

  /** Objekt pod kurzorom (súradnice v pixeloch voči plátnu). */
  pick(x: number, y: number): Picked | undefined {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const meshes = [...this.entries.values()].map((e) => e.mesh);
    const hits = this.raycaster
      .intersectObjects(meshes, false)
      .filter((h) => this.clipping.every((p) => p.distanceToPoint(h.point) >= 0));
    const hit = hits[0];
    if (!hit) return undefined;
    const entry = [...this.entries.values()].find((e) => e.mesh === hit.object);
    return entry && { kind: entry.kind, id: entry.id };
  }

  /** Pohľad na vybraný objekt, inak na celý model (alebo os, ak model nie je), šikmo zhora. */
  fit(): void {
    const box = new Box3();
    const selected = this.selectedKey ? this.entries.get(this.selectedKey) : undefined;
    for (const e of selected ? [selected] : this.entries.values()) box.expandByObject(e.mesh);
    if (box.isEmpty() && this.axisLine) box.expandByObject(this.axisLine);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new Sphere());
    const r = Math.max(sphere.radius, 1);
    const distance = r / Math.sin(((this.camera.fov / 2) * Math.PI) / 180);
    // podpera je pod NK → takmer vodorovný pohľad zboku, inak šikmo zhora
    const dir = new Vector3(-0.55, -0.65, selected?.kind === 'support' ? 0.08 : 0.5).normalize();
    this.controls.target.copy(sphere.center);
    this.camera.position.copy(sphere.center).addScaledVector(dir, distance * 1.05);
    this.controls.update();
    if (!selected) this.fitted = this.entries.size > 0 ? 'model' : 'axis';
    this.requestRender();
  }

  get objectCount(): number {
    return this.entries.size;
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    for (const key of [...this.entries.keys()]) this.remove(key);
    this.setAxis([]);
    this.setCut(undefined);
    this.capMaterial.dispose();
    this.controls.dispose();
    for (const m of [...Object.values(this.materials), this.edgeMaterial, this.axisMaterial]) {
      m.dispose();
    }
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  requestRender(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.renderer.render(this.scene, this.camera);
    });
  }

  private add(o: RenderObject): void {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(o.buffers.positions, 3));
    g.setAttribute('normal', new BufferAttribute(o.buffers.normals, 3));
    g.setIndex(new BufferAttribute(o.buffers.indices, 1));
    g.computeBoundingSphere();
    const selected = o.key === this.selectedKey;
    const mesh = new Mesh(g, selected ? this.materials.selected : this.materials[o.kind]);
    const c = o.buffers.center;
    mesh.position.set(c.x, c.y, c.z);
    const edges = new LineSegments(new EdgesGeometry(g, EDGE_ANGLE), this.edgeMaterial);
    mesh.add(edges);
    this.scene.add(mesh);
    this.entries.set(o.key, { kind: o.kind, id: o.id, mesh, edges });
  }

  private remove(key: string): void {
    const e = this.entries.get(key);
    if (!e) return;
    this.scene.remove(e.mesh);
    e.mesh.geometry.dispose();
    e.edges.geometry.dispose();
    this.entries.delete(key);
  }
}

function center(points: readonly Vec3[]) {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of points) {
    min.x = Math.min(min.x, p.x);
    min.y = Math.min(min.y, p.y);
    min.z = Math.min(min.z, p.z);
    max.x = Math.max(max.x, p.x);
    max.y = Math.max(max.y, p.y);
    max.z = Math.max(max.z, p.z);
  }
  return { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 };
}

/** Uzáver rezu jednej NK: vonkajšie obrysy s dutinami, triangulované v rovine prierezu, mierne pred rovinou. */
function capMesh(
  loops: readonly CutLoop[],
  normal: Vec3,
  material: MeshBasicMaterial,
): Mesh | undefined {
  const outers = loops.filter((l) => l.role === 'outer');
  const voids = loops.filter((l) => l.role === 'void');
  const points: Vec3[] = [];
  const indices: number[] = [];
  for (const outer of outers) {
    const holes = voids.filter((v) => v.plane[0] && pointInPolygon(v.plane[0], outer.plane));
    const base = points.length;
    const tris = triangulatePolygon(
      outer.plane,
      holes.map((h) => h.plane),
    );
    points.push(...outer.points, ...holes.flatMap((h) => h.points));
    indices.push(...tris.map((i) => i + base));
  }
  if (indices.length === 0) return undefined;
  const c = center(points);
  const arr = new Float32Array(points.length * 3);
  points.forEach((p, i) => {
    arr[3 * i] = p.x - c.x + CAP_OFFSET * normal.x;
    arr[3 * i + 1] = p.y - c.y + CAP_OFFSET * normal.y;
    arr[3 * i + 2] = p.z - c.z + CAP_OFFSET * normal.z;
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(arr, 3));
  g.setIndex(indices);
  const mesh = new Mesh(g, material);
  mesh.position.set(c.x, c.y, c.z);
  return mesh;
}
