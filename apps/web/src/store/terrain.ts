import type { Alignment } from '@bridge/alignment';
import { crossSection, profileAlong, type Tin, terrainTin } from '@bridge/terrain';
import { useMemo } from 'react';
import { useProject } from './projectStore.ts';

export interface TerrainTin {
  id: string;
  name: string;
  tin: Tin;
}

/** TIN všetkých terénov projektu; prepočíta sa len pri zmene terénov (immer zachová identitu). */
export function useTerrainTins(): TerrainTin[] {
  const terrains = useProject((s) => s.project.terrains);
  return useMemo(
    () => terrains.map((t) => ({ id: t.id, name: t.name, tin: terrainTin(t.data) })),
    [terrains],
  );
}

/** Terénne čiary pozdĺž osi cesty v staničení `s` a výškach v m n. m. (úseky na povrchu). */
export function terrainProfiles(
  tins: readonly TerrainTin[],
  alignment: Alignment,
): { id: string; runs: { s: number; z: number }[][] }[] {
  return tins.map(({ id, tin }) => ({
    id,
    runs: profileAlong(tin, alignment, 0, alignment.length).map((r) =>
      r.map((p) => ({ s: p.s, z: p.z + alignment.origin.z })),
    ),
  }));
}

/** Priečne terénne čiary na staničení `s`: x = odsadenie od osi cesty, y = výška v m n. m. */
export function terrainCrossSections(
  tins: readonly TerrainTin[],
  alignment: Alignment,
  s: number,
  halfWidth: number,
): { id: string; runs: { x: number; y: number }[][] }[] {
  return tins.map(({ id, tin }) => ({
    id,
    runs: crossSection(tin, alignment, s, -halfWidth, halfWidth).map((r) =>
      r.map((p) => ({ x: p.x, y: p.z + alignment.origin.z })),
    ),
  }));
}
