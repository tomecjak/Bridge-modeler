import { type Alignment, type AlignmentData, createAlignment } from '@bridge/alignment';
import type { Vec3 } from '@bridge/geom';
import {
  type BridgeAxis,
  buildParameterSet,
  type Parameter,
  type ParameterSet,
  type ProjectFile,
} from '@bridge/model';
import { type AxisLength, bridgeAxisLength, resolveDeckEnds } from '@bridge/sections';
import type { Draft } from 'immer';

// cache podľa identity: immer zdieľa nezmenené časti projektu, takže sa prepočíta len to, čo sa zmenilo
const alignments = new WeakMap<Vec3, WeakMap<AlignmentData, Alignment>>();
const parameterSets = new WeakMap<readonly Parameter[], ParameterSet>();
const measures = new WeakMap<BridgeAxis, WeakMap<Alignment, WeakMap<ParameterSet, AxisLength>>>();

function alignmentOf(origin: Vec3, data: AlignmentData): Alignment {
  let byData = alignments.get(origin);
  if (!byData) {
    byData = new WeakMap();
    alignments.set(origin, byData);
  }
  let a = byData.get(data);
  if (!a) {
    a = createAlignment(data, origin).alignment;
    byData.set(data, a);
  }
  return a;
}

function parametersOf(list: readonly Parameter[]): ParameterSet {
  let set = parameterSets.get(list);
  if (!set) {
    set = buildParameterSet(list);
    parameterSets.set(list, set);
  }
  return set;
}

function measureOf(axis: BridgeAxis, alignment: Alignment, parameters: ParameterSet): AxisLength {
  let byAlignment = measures.get(axis);
  if (!byAlignment) {
    byAlignment = new WeakMap();
    measures.set(axis, byAlignment);
  }
  let byParameters = byAlignment.get(alignment);
  if (!byParameters) {
    byParameters = new WeakMap();
    byAlignment.set(alignment, byParameters);
  }
  let m = byParameters.get(parameters);
  if (!m) {
    m = bridgeAxisLength(axis, alignment, parameters);
    byParameters.set(parameters, m);
  }
  return m;
}

/**
 * Zosúladenie koncov NK s oporami po príkaze (ADR 0018): úprava draftu, ktorá zapíše odvodené od / do; undefined, ak
 * je projekt v súlade.
 */
export function syncDeckEnds(
  project: ProjectFile,
): ((draft: Draft<ProjectFile>) => void) | undefined {
  const origin = project.crs.origin;
  if (!origin || project.superstructures.length === 0 || project.bearingLines.length === 0)
    return undefined;
  const parameters = parametersOf(project.parameters);
  const changes = resolveDeckEnds({
    superstructures: project.superstructures,
    bearingLines: project.bearingLines,
    supports: project.supports,
    bridgeAxes: project.bridgeAxes,
    alignments: new Map(
      project.alignments.map((d) => {
        const a = alignmentOf(origin, d);
        return [a.name, a];
      }),
    ),
    parameters,
    measure: (axis, alignment) => measureOf(axis, alignment, parameters),
  });
  if (changes.length === 0) return undefined;
  return (draft) => {
    for (const c of changes) {
      const deck = draft.superstructures.find((d) => d.id === c.id);
      if (!deck) continue;
      deck.from = c.from;
      deck.to = c.to;
    }
  };
}
