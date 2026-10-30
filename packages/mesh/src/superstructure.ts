import type { Vec2, Vec3 } from '@bridge/geom';
import type { IssueOwner, ModelIssue, Superstructure } from '@bridge/model';
import {
  evaluateSuperstructure,
  type SectionContext,
  type SuperstructureSection,
  type SupportResult,
} from '@bridge/sections';
import type { GeometryKernel, LoftSection } from './kernel.ts';
import { mergeMeshes, type TriangleMesh } from './mesh.ts';
import { DEFAULT_SAMPLING, type LawRef, type SamplingOptions, sampleStations } from './sampling.ts';

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
 * Teleso NK ako sweep prierezov po osi mosta (Fáza 5). Prierezy rovnakej topológie sa spoja do loftu,
 * pri zmene topológie sa loft uzavrie a začne nový. Konce NK sú rovnobežné s osou krajnej opory (rozhodnutie
 * 2026-10-30): bod prierezu v priečnej polohe x končí na staničení `s_konca − x·cot α` (ADR 0008, lokálne priamy úsek).
 */
export function superstructureMesh<S>(
  kernel: GeometryKernel<S>,
  input: SuperstructureMeshInput,
): SuperstructureMesh {
  const { ctx, superstructure: sup } = input;
  const owner: IssueOwner = { kind: 'superstructure', name: sup.name };
  let endAngles = { start: Math.PI / 2, end: Math.PI / 2 };
  const empty = (issues: ModelIssue[]): SuperstructureMesh => ({
    mesh: mergeMeshes([]),
    stations: [],
    endAngles,
    issues: issues.map((i) => ({ owner, ...i })),
  });

  const axis = ctx.bridgeAxes.find((a) => a.id === sup.bridgeAxis);
  const alignment = axis ? ctx.alignments.get(axis.alignment) : undefined;
  const profile = ctx.profiles.find((p) => p.id === sup.profile);
  if (!axis || !alignment || !profile) return empty(evaluateSuperstructure(ctx, sup, 0).issues);
  const sFrom = alignment.stationing.fromDisplay(sup.from);
  const sTo = alignment.stationing.fromDisplay(sup.to);
  if (sFrom === undefined || sTo === undefined || !(sTo > sFrom)) {
    return empty([
      { code: 'StationNotOnAlignment', station: sFrom === undefined ? sup.from : sup.to },
    ]);
  }
  endAngles = endCrossingAngles(input.supports, sFrom, sTo);

  const units = new Map(profile.parameters.map((p) => [p.name, p.unit]));
  const laws: LawRef[] = [
    ...Object.entries(sup.parameterLaws).map(([name, law]) => ({
      law,
      unit: units.get(name) ?? 'none',
    })),
    { law: axis.horizontalOffset, unit: 'length' },
    { law: axis.verticalOffset, unit: 'length' },
    ...(input.globalLaws ?? []),
  ];
  const probes = [sFrom, (sFrom + sTo) / 2, sTo].map((s) => evaluateSuperstructure(ctx, sup, s));
  const reach = Math.max(
    0,
    ...probes.flatMap((p) =>
      [...p.loops.flatMap((l) => l.polygon.map((q) => Math.abs(q.x)))].map(
        (x) => x + Math.abs(p.axis?.horizontalOffset ?? 0),
      ),
    ),
  );
  const breaks = input.supports.flatMap((r) => [r.s, ...r.bearings.map((b) => b.s)]);
  const stations = sampleStations(
    {
      alignment,
      sFrom,
      sTo,
      laws,
      scope: (station) => {
        const values = ctx.parameters.evaluateAt(station).values;
        return (n) => values.get(n);
      },
      breaks: breaks.filter((s) => Number.isFinite(s)),
      reach,
    },
    input.sampling ?? DEFAULT_SAMPLING,
  );

  const sections = stations.map((s) => evaluateSuperstructure(ctx, sup, s));
  const issues = unique(sections.flatMap((s) => s.issues));
  const first = sections[0];
  const last = sections[sections.length - 1];
  if (!first?.axis || !last?.axis) return { ...empty([]), stations, issues };

  const cot0 = cot(endAngles.start);
  const cot1 = cot(endAngles.end);
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
  return { mesh: mergeMeshes(meshes), stations, endAngles, issues };
}

const cot = (a: number) => Math.cos(a) / Math.sin(a);

/** Uhly kríženia koncov NK: krajná podpera, ak je to opora bližšie k danému koncu; inak kolmý koniec. */
function endCrossingAngles(
  supports: readonly SupportResult[],
  sFrom: number,
  sTo: number,
): { start: number; end: number } {
  const sorted = supports.filter((r) => Number.isFinite(r.s)).sort((a, b) => a.s - b.s);
  const angle = (r: SupportResult | undefined, nearStart: boolean) =>
    r &&
    r.support.kind === 'abutment' &&
    r.s - sFrom < sTo - r.s === nearStart &&
    Math.sin(r.crossingAngle) > 1e-3
      ? r.crossingAngle
      : Math.PI / 2;
  return { start: angle(sorted[0], true), end: angle(sorted[sorted.length - 1], false) };
}

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

function unique(issues: readonly ModelIssue[]): ModelIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const k = JSON.stringify(i);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
