import { type Alignment, createAlignment } from '@bridge/alignment';
import type { Vec3 } from '@bridge/geom';
import {
  buildParameterSet,
  type CurveRef,
  type ModelIssue,
  type ProjectFile,
  type Superstructure,
} from '@bridge/model';
import {
  deckCrossbeams,
  evaluateBearingLine,
  evaluateObstacle,
  evaluateSupport,
  type LawRef,
  type SupportContext,
  type SupportResult,
} from '@bridge/sections';
import { clearanceMesh } from './clearance.ts';
import { type GeometryKernel, MeshKernel } from './kernel.ts';
import { meshBounds, type TriangleMesh } from './mesh.ts';
import { superstructureMesh } from './superstructure.ts';
import { supportMesh } from './supports.ts';

export type SceneObjectKind = 'superstructure' | 'support' | 'clearance';

export interface SceneObject {
  kind: SceneObjectKind;
  /** ID prvku v modeli */
  id: string;
  name: string;
  mesh: TriangleMesh;
  issues: ModelIssue[];
}

/** Siete z predchádzajúceho výpočtu podľa kľúča vstupov objektu. */
export interface SceneCache {
  entries: Map<string, { key: string; object: SceneObject }>;
}

export interface SceneUpdate {
  /** všetky objekty v stabilnom poradí (NK, potom podpery, v poradí modelu) */
  objects: SceneObject[];
  /** `kind:id` objektov, ktoré sa prepočítali */
  changed: string[];
  /** `kind:id` objektov, ktoré z modelu zmizli */
  removed: string[];
}

export const createSceneCache = (): SceneCache => ({ entries: new Map() });

export const sceneObjectKey = (kind: SceneObjectKind, id: string) => `${kind}:${id}`;

/**
 * 3D scéna projektu (Fáza 5): siete NK a podpier v lokálnych súradniciach. Objekt sa prepočíta, len ak sa
 * zmenili jeho vstupy (prvok, profil, os mosta, os cesty, počiatok, parametre; NK aj staničenia a šikmosť
 * jej podpier). Deterministické: rovnaký projekt → rovnaké siete.
 */
export function buildScene(
  project: ProjectFile,
  cache: SceneCache,
  kernel: GeometryKernel<unknown> = new MeshKernel(),
): SceneUpdate {
  const origin = project.crs.origin;
  const changed: string[] = [];
  const objects: SceneObject[] = [];
  const seen = new Set<string>();
  if (origin) {
    const alignments = lazy(() => buildAlignments(project, origin));
    const parameters = lazy(() => buildParameterSet(project.parameters));
    const ctx = lazy((): SupportContext => {
      const base: SupportContext = {
        alignments: alignments(),
        parameters: parameters(),
        bridgeAxes: project.bridgeAxes,
        profiles: project.profiles,
        superstructures: project.superstructures,
        bearingLines: project.bearingLines,
        planLines: project.planLines,
        surveys: project.surveys,
      };
      if (!project.bearingLines.some((l) => l.crossbeam)) return base;
      // pásy priečnikov (ADR 0018): prierez NK v páse, aj spodok NK nad ložiskami
      const lines = project.bearingLines.map((l) => evaluateBearingLine(base, l));
      return { ...base, crossbeams: deckCrossbeams(base, lines) };
    });
    /** vstupy priečnikov NK (osi a ich prierezy) pre kľúč cache; bez priečnikov prázdne */
    const crossbeamInputs = (sup: Superstructure | undefined) => {
      const own = project.bearingLines.filter((l) => l.superstructure === sup?.id);
      return own.some((l) => l.crossbeam)
        ? [own, own.map((l) => project.profiles.find((p) => p.id === l.crossbeam?.profile))]
        : [];
    };
    /** NK podľa id osi uloženia (podpera patrí NK cez os, ADR 0017) */
    const lineDeck = new Map(project.bearingLines.map((l) => [l.id, l.superstructure]));
    const globalLaws: LawRef[] = project.parameters.map((p) => ({ law: p.law, unit: p.unit }));
    const params = JSON.stringify(project.parameters);
    const base = (sup: Superstructure | undefined) => {
      const axis = project.bridgeAxes.find((a) => a.id === sup?.bridgeAxis);
      // krivky okrajov NK (osi z LandXML, čiary v pôdoryse), na ktoré sa odkazujú priebehy parametrov
      const curves = Object.values(sup?.parameterLaws ?? {}).flatMap((law) =>
        law.kind === 'edge' ? [curveData(project, law.curve)] : [],
      );
      return [
        origin,
        params,
        axis,
        project.alignments.find((a) => a.name === axis?.alignment),
        project.profiles.find((p) => p.id === sup?.profile),
        curves,
      ];
    };

    // podpery sú lacné a NK potrebuje ich staničenia a šikmosť → vyhodnotia sa vždy
    const results = lazy(() => project.supports.map((s) => evaluateSupport(ctx(), s)));
    const reuse = (kind: SceneObjectKind, id: string, key: string, make: () => SceneObject) => {
      const k = sceneObjectKey(kind, id);
      seen.add(k);
      const hit = cache.entries.get(k);
      if (hit && hit.key === key) {
        objects.push(hit.object);
        return;
      }
      const object = make();
      cache.entries.set(k, { key, object });
      objects.push(object);
      changed.push(k);
    };

    for (const sup of project.superstructures) {
      const own = () => results().filter((r) => r.superstructure === sup.id);
      const deckInputs = project.supports.some((s) => lineDeck.get(s.bearingLine) === sup.id)
        ? own().map((r) => [r.support.kind, r.s, r.crossingAngle, r.bearings.map((b) => b.s)])
        : [];
      const key = JSON.stringify([sup, ...base(sup), deckInputs, crossbeamInputs(sup)]);
      reuse('superstructure', sup.id, key, () => {
        const r = superstructureMesh(kernel, {
          ctx: ctx(),
          superstructure: sup,
          supports: own(),
          globalLaws,
        });
        return {
          kind: 'superstructure',
          id: sup.id,
          name: sup.name,
          mesh: r.mesh,
          issues: r.issues,
        };
      });
    }
    project.supports.forEach((support, i) => {
      const line = project.bearingLines.find((l) => l.id === support.bearingLine);
      const sup = project.superstructures.find((s) => s.id === line?.superstructure);
      const key = JSON.stringify([support, line, sup, ...base(sup), crossbeamInputs(sup)]);
      reuse('support', support.id, key, () => {
        const r = results()[i] as SupportResult;
        return {
          kind: 'support',
          id: support.id,
          name: support.name,
          mesh: supportMesh(kernel, r),
          issues: r.issues,
        };
      });
    });
    // voľné prierezy prekážok (ADR 0020): kľúč z prekážky, osí ciest, osí mostov, rozsahov NK a čiar
    for (const o of project.obstacles) {
      const names = new Set([
        ...(o.reference.type === 'station'
          ? [o.reference.alignment]
          : o.reference.curve.type === 'alignment'
            ? [o.reference.curve.name]
            : []),
        ...project.bridgeAxes.map((a) => a.alignment),
      ]);
      const key = JSON.stringify([
        o,
        origin,
        params,
        project.alignments.filter((a) => names.has(a.name)),
        project.bridgeAxes,
        project.superstructures.map((d) => [d.id, d.bridgeAxis, d.from, d.to]),
        o.reference.type === 'curve' && o.reference.curve.type !== 'alignment'
          ? curveData(project, o.reference.curve)
          : undefined,
      ]);
      reuse('clearance', o.id, key, () => {
        const r = evaluateObstacle(
          {
            alignments: alignments(),
            parameters: parameters(),
            bridgeAxes: project.bridgeAxes,
            superstructures: project.superstructures,
            planLines: project.planLines,
            surveys: project.surveys,
          },
          o,
        );
        return {
          kind: 'clearance',
          id: o.id,
          name: o.name,
          mesh: clearanceMesh(kernel, r),
          issues: r.issues,
        };
      });
    }
  }
  const removed = [...cache.entries.keys()].filter((k) => !seen.has(k));
  for (const k of removed) cache.entries.delete(k);
  return { objects, changed, removed };
}

function buildAlignments(project: ProjectFile, origin: Vec3): Map<string, Alignment> {
  return new Map(project.alignments.map((a) => [a.name, createAlignment(a, origin).alignment]));
}

function lazy<T>(make: () => T): () => T {
  let value: { v: T } | undefined;
  return () => {
    value ??= { v: make() };
    return value.v;
  };
}

/** Buffre pre GPU: polohy relatívne k stredu siete vo float32 (bez trasenia), stred v double. */
export interface RenderBuffers {
  center: Vec3;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

export function toRenderBuffers(mesh: TriangleMesh): RenderBuffers {
  const b = meshBounds(mesh);
  const center = b
    ? { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2, z: (b.min.z + b.max.z) / 2 }
    : { x: 0, y: 0, z: 0 };
  const p = mesh.positions;
  const positions = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    positions[i] = (p[i] as number) - center.x;
    positions[i + 1] = (p[i + 1] as number) - center.y;
    positions[i + 2] = (p[i + 2] as number) - center.z;
  }
  return { center, positions, normals: mesh.normals.slice(), indices: mesh.indices.slice() };
}

/** Dáta krivky (os z LandXML, čiara v pôdoryse alebo čiara meračky) do kľúča cache. */
function curveData(project: ProjectFile, ref: CurveRef) {
  if (ref.type === 'alignment') return project.alignments.find((a) => a.name === ref.name);
  if (ref.type === 'planLine') return project.planLines.find((l) => l.id === ref.id);
  return project.surveys.find((s) => s.id === ref.survey)?.lines.find((l) => l.id === ref.line);
}
