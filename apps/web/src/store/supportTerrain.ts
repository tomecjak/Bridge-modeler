import type { ProjectFile, TerrainData } from '@bridge/model';
import { resolveSupportTerrain } from '@bridge/sections';
import { type Tin, terrainTin } from '@bridge/terrain';
import type { Draft } from 'immer';
import { alignmentsOf, parametersOf } from './modelCache.ts';

// TIN podľa identity dát terénu (immer zachová nezmenené terény)
const tins = new WeakMap<TerrainData, Tin>();

function tinOf(data: TerrainData): Tin {
  let tin = tins.get(data);
  if (!tin) {
    tin = terrainTin(data);
    tins.set(data, tin);
  }
  return tin;
}

/**
 * Zosúladenie terénu v strede podpier s terénom projektu po príkaze (ADR 0019, 0020): povrchy s príznakom pre
 * založenie, pri viacerých najvyšší v bode. Úprava draftu zapíše `foundation.terrain`; undefined, ak je projekt
 * v súlade.
 */
export function syncSupportTerrain(
  project: ProjectFile,
): ((draft: Draft<ProjectFile>) => void) | undefined {
  const origin = project.crs.origin;
  if (!origin || project.supports.length === 0) return undefined;
  const forFoundation = project.terrains.filter((t) => t.foundation);
  if (
    forFoundation.length === 0 &&
    project.supports.every((s) => s.foundation.terrain === undefined)
  )
    return undefined;
  const surfaces = forFoundation.map((t) => tinOf(t.data));
  const terrainAt = (x: number, y: number) => {
    let best: number | undefined;
    for (const tin of surfaces) {
      const z = tin.elevationAt(x, y);
      if (z !== undefined && (best === undefined || z > best)) best = z;
    }
    return best;
  };
  const changes = resolveSupportTerrain({
    alignments: alignmentsOf(project, origin),
    parameters: parametersOf(project.parameters),
    bridgeAxes: project.bridgeAxes,
    profiles: project.profiles,
    planLines: project.planLines,
    superstructures: project.superstructures,
    bearingLines: project.bearingLines,
    supports: project.supports,
    terrainAt,
    z0: origin.z,
  });
  if (changes.length === 0) return undefined;
  return (draft) => {
    for (const c of changes) {
      const support = draft.supports.find((s) => s.id === c.id);
      if (!support) continue;
      if (c.terrain === undefined) delete support.foundation.terrain;
      else support.foundation.terrain = c.terrain;
    }
  };
}
