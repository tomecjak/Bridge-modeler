import type { Vec3 } from '@bridge/geom';
import type { TerrainSurface } from '@bridge/model';
import {
  type Corridor,
  type CorridorOptions,
  clipGrid,
  clipTin,
  type ParsedSurface,
  parseSurfaces,
  type TerrainIssue,
} from '@bridge/terrain';

/** Povrch zo súboru, ktorý sa dá importovať (pred orezaním na koridor). */
export type TerrainCandidate =
  | { kind: 'landxml'; name: string; surface: ParsedSurface }
  | { kind: 'geotiff'; name: string; buffer: ArrayBuffer };

export interface TerrainFile {
  fileName: string;
  candidates: TerrainCandidate[];
  issues: TerrainIssue[];
}

const isGeoTiff = (name: string) => /\.tiff?$/i.test(name);

/** Podporovaný súbor terénu (LandXML alebo GeoTIFF)? */
export const isTerrainFile = (name: string) => isGeoTiff(name) || /\.(xml|landxml)$/i.test(name);

/** Načíta súbor terénu: povrchy z LandXML alebo jeden raster GeoTIFF (číta sa až pri importe). */
export async function readTerrainFile(file: File): Promise<TerrainFile> {
  if (isGeoTiff(file.name)) {
    const name = file.name.replace(/\.tiff?$/i, '');
    return {
      fileName: file.name,
      candidates: [{ kind: 'geotiff', name, buffer: await file.arrayBuffer() }],
      issues: [],
    };
  }
  const parsed = parseSurfaces(await file.text());
  return {
    fileName: file.name,
    candidates: parsed.surfaces.map((surface) => ({
      kind: 'landxml',
      name: surface.name,
      surface,
    })),
    issues: parsed.issues,
  };
}

/** Oreže vybraný povrch na koridor a vytvorí terén projektu; `undefined`, ak v koridore nič nie je. */
export async function buildTerrain(
  candidate: TerrainCandidate,
  corridor: Corridor,
  options: CorridorOptions,
  origin: Vec3,
  id: string,
): Promise<{ terrain?: TerrainSurface; issues: TerrainIssue[] }> {
  const base = { id, name: candidate.name, corridor: { ...options } };
  if (candidate.kind === 'landxml') {
    const data = clipTin(candidate.surface, corridor, origin);
    return data ? { terrain: { ...base, source: 'landxml', data }, issues: [] } : { issues: [] };
  }
  // geotiff.js sa načíta až tu (samostatný chunk, ADR 0011)
  const { readGeoTiff } = await import('@bridge/terrain/geotiff');
  const b = corridor.bounds;
  const read = await readGeoTiff(candidate.buffer, {
    minX: b.minX + origin.x,
    minY: b.minY + origin.y,
    maxX: b.maxX + origin.x,
    maxY: b.maxY + origin.y,
  });
  if (!read.raster) return { issues: read.issues };
  const data = clipGrid(read.raster, corridor, origin);
  return data ? { terrain: { ...base, source: 'geotiff', data }, issues: [] } : { issues: [] };
}

/** Počet bodov a trojuholníkov / buniek uloženého terénu (pre zobrazenie). */
export function terrainSize(t: TerrainSurface): { points: number; cells: number } {
  if (t.data.kind === 'tin') {
    return { points: t.data.points.length / 3, cells: t.data.triangles.length / 3 };
  }
  const points = t.data.runs.reduce((a, r) => a + r.z.length, 0);
  return { points, cells: points };
}
