import { type Alignment, type AlignmentData, createAlignment } from '@bridge/alignment';
import type { Vec3 } from '@bridge/geom';
import {
  type BridgeAxis,
  buildParameterSet,
  type Parameter,
  type ParameterSet,
  type ProjectFile,
} from '@bridge/model';
import { type AxisLength, bridgeAxisLength } from '@bridge/sections';

// cache podľa identity pre normalizátory store: immer zdieľa nezmenené časti projektu, takže sa prepočíta len to,
// čo sa zmenilo
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

/** Osi cesty projektu podľa mena (počiatok musí byť nastavený). */
export function alignmentsOf(project: ProjectFile, origin: Vec3): Map<string, Alignment> {
  return new Map(
    project.alignments.map((d) => {
      const a = alignmentOf(origin, d);
      return [a.name, a];
    }),
  );
}

export function parametersOf(list: readonly Parameter[]): ParameterSet {
  let set = parameterSets.get(list);
  if (!set) {
    set = buildParameterSet(list);
    parameterSets.set(list, set);
  }
  return set;
}

export function measureOf(
  axis: BridgeAxis,
  alignment: Alignment,
  parameters: ParameterSet,
): AxisLength {
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
