import type { Vec2, Vec3 } from '@bridge/geom';
import type { EdgeBeam, ModelIssue, Superstructure } from '@bridge/model';
import {
  type DeckSegment,
  type LawRef,
  type SamplingOptions,
  type SectionContext,
  type SuperstructureSection,
  type SupportResult,
  sampleEdgeBeam,
  sampleSuperstructure,
} from '@bridge/sections';
import type { GeometryKernel, LoftSection } from './kernel.ts';
import { mergeMeshes, type TriangleMesh } from './mesh.ts';

export interface SuperstructureMeshInput {
  ctx: SectionContext;
  superstructure: Superstructure;
  /** vyhodnotené podpery tejto NK (zlomy vzorkovania, šikmosť koncov) */
  supports: readonly SupportResult[];
  /** priebehy globálnych parametrov (ich zlomy sa vzorkujú presne) */
  globalLaws?: readonly LawRef[];
  sampling?: SamplingOptions;
}

export interface SuperstructureMesh {
  mesh: TriangleMesh;
  /** spojité staničenia vzoriek */
  stations: number[];
  /** uhly kríženia koncov [rad] (π/2 = kolmý koniec) */
  endAngles: { start: number; end: number };
  issues: ModelIssue[];
}

/**
 * Teleso NK ako sweep prierezov po osi mosta (Fáza 5) po úsekoch NK a priečnikov (ADR 0018). Prierezy rovnakej
 * topológie sa spoja do loftu, pri zmene topológie sa loft uzavrie a začne nový. Hranice úsekov sú rovnobežné s osou
 * krajnej opory alebo osou uloženia (rozhodnutie 2026-10-30): bod prierezu v priečnej polohe x končí na staničení
 * `s_hranice − x·cot α` (ADR 0008, lokálne priamy úsek).
 */
export function superstructureMesh<S>(
  kernel: GeometryKernel<S>,
  input: SuperstructureMeshInput,
): SuperstructureMesh {
  const samples = sampleSuperstructure(input.ctx, input.superstructure, input.supports, input);
  if (!('sections' in samples)) {
    const endAngles = { start: Math.PI / 2, end: Math.PI / 2 };
    return { mesh: mergeMeshes([]), stations: [], endAngles, issues: samples.issues };
  }
  const { stations, endAngles, issues } = samples;
  const meshes = samples.segments.flatMap((segment) => segmentMeshes(kernel, segment));
  return { mesh: mergeMeshes(meshes), stations, endAngles, issues };
}

/**
 * Teleso rímsy (ADR 0023) ako sweep jej prierezov vo vzorkách NK; konce sú rovnobežné s koncami NK (šikmé ako NK).
 * Problémy NK hlási NK, tu len problémy rímsy.
 */
export function edgeBeamMesh<S>(
  kernel: GeometryKernel<S>,
  input: SuperstructureMeshInput & { beam: EdgeBeam },
): { mesh: TriangleMesh; issues: ModelIssue[] } {
  const samples = sampleSuperstructure(input.ctx, input.superstructure, input.supports, input);
  if (!('sections' in samples)) return { mesh: mergeMeshes([]), issues: [] };
  const segment = sampleEdgeBeam(input.ctx, input.beam, samples);
  const seen = new Set<string>();
  const issues = segment.sections
    .flatMap((s) => s.issues)
    .filter((i) => {
      const key = JSON.stringify(i);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return { mesh: mergeMeshes(segmentMeshes(kernel, segment)), issues };
}

/** Lofty jedného úseku NK so šikmými hranicami (prierezy za hranicou sa pritiahnu na hraničnú plochu). */
function segmentMeshes<S>(kernel: GeometryKernel<S>, segment: DeckSegment): TriangleMesh[] {
  const { sections, sFrom, sTo } = segment;
  const first = sections[0];
  const last = sections[sections.length - 1];
  if (!first?.axis || !last?.axis) return [];

  const cot0 = cot(segment.startAngle);
  const cot1 = cot(segment.endAngle);
  const startFace = endFace(first, (x) => -x * cot0);
  const endFace_ = endFace(last, (x) => -x * cot1);

  const loftSections: (LoftSection | undefined)[] = sections.map((sec, k) => {
    if (!sec.axis || sec.loops.length === 0) return undefined;
    if (k === 0) return startFace(sec);
    if (k === sections.length - 1) return endFace_(sec);
    return {
      loops: sec.loops.map((l) => ({
        role: l.role,
        plane: l.polygon,
        points: l.polygon.map((p) => {
          // bod pred šikmým začiatkom alebo za šikmým koncom sa pritiahne na koncovú plochu
          if (sec.s < sFrom - p.x * cot0) return startFace.at(p);
          if (sec.s > sTo - p.x * cot1) return endFace_.at(p);
          return sec.toWorld(p);
        }),
      })),
    };
  });

  const meshes: TriangleMesh[] = [];
  let run: LoftSection[] = [];
  let signature = '';
  const flush = () => {
    if (run.length >= 2) meshes.push(kernel.tessellate(kernel.loft(run)));
    run = [];
  };
  loftSections.forEach((ls, k) => {
    const sig = ls ? topology(sections[k] as SuperstructureSection) : '';
    if (!ls || sig !== signature) flush();
    signature = sig;
    if (ls) run.push(ls);
  });
  flush();
  return meshes;
}

const cot = (a: number) => Math.cos(a) / Math.sin(a);

/**
 * Koncová plocha z prierezu na staničení konca: bod (x, y) sa posunie pozdĺž dotyčnice osi mosta
 * o `shift(x)` (vodorovne meraná dĺžka; so sklonom nivelety) — rovinná plocha.
 */
function endFace(section: SuperstructureSection, shift: (x: number) => number) {
  const t = section.axis?.frame.tangent ?? { x: 0, y: 1, z: 0 };
  const th = Math.hypot(t.x, t.y);
  const at = (p: Vec2): Vec3 => {
    const w = section.toWorld(p);
    const d = shift(p.x) / th;
    return { x: w.x + d * t.x, y: w.y + d * t.y, z: w.z + d * t.z };
  };
  const face = (sec: SuperstructureSection): LoftSection => ({
    loops: sec.loops.map((l) => ({ role: l.role, plane: l.polygon, points: l.polygon.map(at) })),
  });
  return Object.assign(face, { at });
}

const topology = (s: SuperstructureSection) =>
  s.loops.map((l) => `${l.name}:${l.role}:${l.polygon.length}`).join('|');
