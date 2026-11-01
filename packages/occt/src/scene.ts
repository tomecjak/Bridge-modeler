import { createAlignment } from '@bridge/alignment';
import { type Vec2, type Vec3, vec2, vec3 } from '@bridge/geom';
import {
  clipToSlab,
  type LoftSection,
  mergeMeshes,
  type SceneObjectKind,
  type TriangleMesh,
} from '@bridge/mesh';
import { buildParameterSet, type ModelIssue, type ProjectFile } from '@bridge/model';
import {
  BEARING_PLAN_SIZE,
  deckCrossbeams,
  evaluateBearingLine,
  evaluateSupport,
  type LawRef,
  type SuperstructureSection,
  type SupportContext,
  type SupportResult,
  sampleSuperstructure,
  supportParts,
  transverseOffset,
} from '@bridge/sections';
import type { ShapeHandle } from 'occt-wasm';
import type { NamedSolid, OcctGeometryKernel } from './kernel.ts';

export interface ExactObject {
  kind: SceneObjectKind;
  id: string;
  name: string;
  /** telesá do STEP (podpera: driek / časti opory a zvlášť ložiská) */
  solids: NamedSolid[];
  mesh: TriangleMesh;
  issues: ModelIssue[];
}

/** Presah loftu za koniec NK pred orezaním rovinou konca [m] (nad posun krajného bodu x · cot α). */
const END_OVERRUN = 0.5;

/**
 * Presná scéna projektu cez OpenCascade (Fáza 8c, ADR 0014): NK ako loft cez vzorky prierezov s presahom za konce,
 * orezaný zvislou rovinou konca (rovnobežnou s osou krajnej opory, inak kolmou na os mosta); podpera ako zjednotenie
 * jej častí, od ktorého sa odčíta NK, ak doň zasahuje (vrch piliera po podhľad NK); ložiská zvlášť.
 * Doménový model sa nemení (princíp 6); poradie objektov je ako v `buildScene`.
 */
export function exactScene(project: ProjectFile, kernel: OcctGeometryKernel): ExactObject[] {
  const origin = project.crs.origin;
  if (!origin) return [];
  const base: SupportContext = {
    alignments: new Map(
      project.alignments.map((a) => [a.name, createAlignment(a, origin).alignment]),
    ),
    parameters: buildParameterSet(project.parameters),
    bridgeAxes: project.bridgeAxes,
    profiles: project.profiles,
    superstructures: project.superstructures,
    bearingLines: project.bearingLines,
    planLines: project.planLines,
  };
  // pásy priečnikov (ADR 0018): prierez NK v páse, aj spodok NK nad ložiskami
  const lines = project.bearingLines.map((l) => evaluateBearingLine(base, l));
  const ctx: SupportContext = { ...base, crossbeams: deckCrossbeams(base, lines) };
  const globalLaws: LawRef[] = project.parameters.map((p) => ({ law: p.law, unit: p.unit }));
  const results = project.supports.map((s) => evaluateSupport(ctx, s));

  const decks = new Map<string, ShapeHandle>();
  const objects: ExactObject[] = [];
  for (const sup of project.superstructures) {
    const own = results.filter((r) => r.superstructure === sup.id);
    const samples = sampleSuperstructure(ctx, sup, own, { globalLaws });
    const name = `${sup.name} (${sup.id})`;
    if (!('sections' in samples)) {
      objects.push(empty('superstructure', sup.id, sup.name, samples.issues));
      continue;
    }
    // úseky NK a priečnikov (ADR 0018) zjednotené do jedného telesa
    const pieces = samples.segments.flatMap(
      (g) => deckSolid(kernel, g.sections, { start: g.startAngle, end: g.endAngle }) ?? [],
    );
    const solid = pieces.length > 1 ? kernel.union(pieces) : pieces[0];
    if (!solid) {
      objects.push(empty('superstructure', sup.id, sup.name, samples.issues));
      continue;
    }
    decks.set(sup.id, solid);
    objects.push({
      kind: 'superstructure',
      id: sup.id,
      name: sup.name,
      solids: [{ name, solid }],
      mesh: kernel.tessellate(solid),
      issues: samples.issues,
    });
  }

  project.supports.forEach((support, i) => {
    const r = results[i] as SupportResult;
    const parts = supportParts(r);
    if (parts.length === 0) {
      objects.push(empty('support', support.id, support.name, r.issues));
      return;
    }
    let body = kernel.union(partSolids(kernel, r, parts));
    const deck = r.superstructure === undefined ? undefined : decks.get(r.superstructure);
    if (deck && overlaps(kernel.bounds(body), kernel.bounds(deck))) {
      body = kernel.subtract(body, deck);
    }
    const bearings = bearingSolids(kernel, r);
    const solids: NamedSolid[] = [
      { name: `${support.name} (${support.id})`, solid: body },
      ...bearings.map((solid, k) => ({
        name: `${support.name} – ložisko ${k + 1} (${support.id})`,
        solid,
      })),
    ];
    objects.push({
      kind: 'support',
      id: support.id,
      name: support.name,
      solids,
      mesh: mergeMeshes(solids.map((s) => kernel.tessellate(s.solid))),
      issues: r.issues,
    });
  });
  return objects;
}

const empty = (
  kind: SceneObjectKind,
  id: string,
  name: string,
  issues: ModelIssue[],
): ExactObject => ({ kind, id, name, solids: [], mesh: mergeMeshes([]), issues });

/** Prierez ako prierez loftu (body v lokálnych súradniciach), voliteľne posunutý o `shift` (presah za koniec). */
function loftSection(sec: SuperstructureSection, shift: Vec3 = vec3(0, 0, 0)): LoftSection {
  return {
    loops: sec.loops.map((l) => ({
      role: l.role,
      plane: l.polygon,
      points: l.polygon.map((p) => {
        const w = sec.toWorld(p);
        return vec3(w.x + shift.x, w.y + shift.y, w.z + shift.z);
      }),
    })),
  };
}

const topology = (s: SuperstructureSection) =>
  s.loops.map((l) => `${l.name}:${l.role}:${l.polygon.length}`).join('|');

/**
 * Teleso NK: lofty prierezov rovnakej topológie (ako v `superstructureMesh`), prvý a posledný s presahom pozdĺž
 * dotyčnice osi mosta, zjednotené a orezané rovinami koncov.
 */
function deckSolid(
  kernel: OcctGeometryKernel,
  sections: readonly SuperstructureSection[],
  endAngles: { start: number; end: number },
): ShapeHandle | undefined {
  const valid = sections.filter((s) => s.axis && s.loops.length > 0);
  const first = valid[0];
  const last = valid[valid.length - 1];
  if (!first?.axis || !last?.axis || valid.length < 2) return undefined;

  const reach = (sec: SuperstructureSection, angle: number) =>
    Math.max(0, ...sec.loops.flatMap((l) => l.polygon.map((p) => Math.abs(p.x)))) *
      Math.abs(Math.cos(angle) / Math.sin(angle)) +
    END_OVERRUN;
  const along = (sec: SuperstructureSection, d: number): Vec3 => {
    const t = sec.axis?.frame.tangent ?? vec3(0, 1, 0);
    const th = Math.hypot(t.x, t.y);
    return vec3((d * t.x) / th, (d * t.y) / th, (d * t.z) / th);
  };

  const runs: LoftSection[][] = [];
  let run: LoftSection[] = [];
  let signature = '';
  sections.forEach((sec) => {
    const ok = sec.axis && sec.loops.length > 0;
    const sig = ok ? topology(sec) : '';
    if (!ok || sig !== signature) {
      if (run.length >= 2) runs.push(run);
      run = [];
    }
    signature = sig;
    if (!ok) return;
    if (sec === first) run.push(loftSection(sec, along(sec, -reach(sec, endAngles.start))));
    run.push(loftSection(sec));
    if (sec === last) run.push(loftSection(sec, along(sec, reach(sec, endAngles.end))));
  });
  if (run.length >= 2) runs.push(run);
  if (runs.length === 0) return undefined;

  let deck = kernel.union(runs.map((r) => kernel.loft(r)));
  for (const [sec, angle, sign] of [
    [first, endAngles.start, -1],
    [last, endAngles.end, 1],
  ] as const) {
    const point = sec.axis?.point as Vec3;
    const t = along(sec, 1);
    // rovina konca: zvislá, obsahuje os opory (dotyčnica otočená o uhol kríženia proti smeru hodín)
    const d = vec2(
      t.x * Math.cos(angle) - t.y * Math.sin(angle),
      t.x * Math.sin(angle) + t.y * Math.cos(angle),
    );
    let n = vec3(d.y, -d.x, 0);
    if ((n.x * t.x + n.y * t.y) * sign < 0) n = vec3(-n.x, -n.y, 0);
    deck = kernel.cut(deck, { origin: point, normal: n });
  }
  return deck;
}

/** Hranoly častí podpery; plochy zalomené pri ložiskách sa delia na pásy (ako v `supportMesh`). */
function partSolids(
  kernel: OcctGeometryKernel,
  r: SupportResult,
  parts: ReturnType<typeof supportParts>,
): ShapeHandle[] {
  const xOf = (p: Vec2) => transverseOffset(r, p);
  const cuts = [...new Set(r.bearings.map((b) => b.x))].sort((a, b) => a - b);
  const slabs = [-Infinity, ...cuts, Infinity];
  return parts.map((part) => {
    const pieces = part.foldsAtBearings
      ? slabs
          .slice(1)
          .map((hi, i) => clipToSlab(part.plan, xOf, slabs[i] as number, hi))
          .filter((piece) => piece.length >= 3)
      : [part.plan];
    return kernel.prism(pieces, part.bottom, part.top);
  });
}

/** Ložiská ako kvádre od hornej hrany podpery po spodok NK (ako v `supportMesh`). */
function bearingSolids(kernel: OcctGeometryKernel, r: SupportResult): ShapeHandle[] {
  const d = r.direction;
  const across = vec2(d.y, -d.x);
  const h = BEARING_PLAN_SIZE / 2;
  return r.bearings
    .filter((b) => b.soffit - b.seat > 0)
    .map((b) => {
      const c = b.plan;
      const corner = (su: number, sv: number) =>
        vec2(c.x + su * h * d.x + sv * h * across.x, c.y + su * h * d.y + sv * h * across.y);
      return kernel.prism(
        [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)],
        () => b.seat,
        () => b.soffit,
      );
    });
}

const overlaps = (a: { min: Vec3; max: Vec3 }, b: { min: Vec3; max: Vec3 }) =>
  a.min.x <= b.max.x &&
  b.min.x <= a.max.x &&
  a.min.y <= b.max.y &&
  b.min.y <= a.max.y &&
  a.min.z <= b.max.z &&
  b.min.z <= a.max.z;

/** STEP celej presnej scény: telesá v poradí objektov, voliteľne posunuté do S-JTSK. */
export function exactSceneStep(
  kernel: OcctGeometryKernel,
  objects: readonly ExactObject[],
  offset?: Vec3,
): string {
  return kernel.exportStep(
    objects.flatMap((o) => o.solids),
    offset,
  );
}
