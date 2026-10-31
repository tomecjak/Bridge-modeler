import { childNamed, childrenNamed, parseXml, type XmlNode } from '@bridge/alignment';
import type { TerrainIssue } from './issues.ts';

/** Povrch z LandXML v súradniciach EPSG:5514 (x = E, y = N, z = H), body v poradí zo súboru. */
export interface ParsedSurface {
  name: string;
  points: Float64Array;
  triangles: Uint32Array;
}

/**
 * Načíta povrchy TIN z LandXML (`Surfaces/Surface/Definition`). Body `P` sú v poradí „N E Z“ (CLAUDE.md),
 * plochy `F` s atribútom `i="1"` (neviditeľné, diery) sa vynechajú. Nič nevyhadzuje.
 */
export function parseSurfaces(xml: string): { surfaces: ParsedSurface[]; issues: TerrainIssue[] } {
  const issues: TerrainIssue[] = [];
  let roots: XmlNode[];
  try {
    roots = parseXml(xml);
  } catch (e) {
    issues.push({
      severity: 'error',
      code: 'InvalidXml',
      detail: e instanceof Error ? e.message : String(e),
    });
    return { surfaces: [], issues };
  }
  const root = roots.find((n) => n.name === 'LandXML');
  if (!root) {
    issues.push({
      severity: 'error',
      code: 'InvalidXml',
      detail: 'missing <LandXML> root element',
    });
    return { surfaces: [], issues };
  }
  const system = childNamed(root, 'Units')?.children[0];
  const linear = system?.attributes.linearUnit ?? 'meter';
  if (system && (system.name !== 'Metric' || linear !== 'meter')) {
    issues.push({ severity: 'error', code: 'UnsupportedUnit', unit: linear || system.name });
    return { surfaces: [], issues };
  }
  const nodes = childrenNamed(root, 'Surfaces').flatMap((s) => childrenNamed(s, 'Surface'));
  if (nodes.length === 0) issues.push({ severity: 'error', code: 'NoSurfaces' });
  const surfaces: ParsedSurface[] = [];
  for (const node of nodes) {
    const s = readSurface(node, issues);
    if (s) surfaces.push(s);
  }
  return { surfaces, issues };
}

function readSurface(node: XmlNode, issues: TerrainIssue[]): ParsedSurface | undefined {
  const name = node.attributes.name ?? '';
  const error = (issue: TerrainIssue) => {
    issues.push({ ...issue, surface: name });
    return undefined;
  };
  const def = childNamed(node, 'Definition');
  const surfType = def?.attributes.surfType ?? 'TIN';
  if (!def || surfType.toUpperCase() !== 'TIN') {
    return error({ severity: 'error', code: 'UnsupportedSurfaceType', surfType });
  }

  const coords: number[] = [];
  const index = new Map<string, number>();
  for (const p of childNamed(def, 'Pnts')?.children ?? []) {
    if (p.name !== 'P') continue;
    const v = p.text.trim().split(/\s+/).map(Number);
    if (v.length < 3 || v.some((x) => !Number.isFinite(x))) {
      return error({ severity: 'error', code: 'InvalidValue', element: 'P', value: p.text });
    }
    const [north, east, z] = v as [number, number, number];
    index.set(p.attributes.id ?? String(index.size + 1), coords.length / 3);
    coords.push(east, north, z);
  }
  const triangles: number[] = [];
  for (const f of childNamed(def, 'Faces')?.children ?? []) {
    if (f.name !== 'F' || f.attributes.i === '1') continue;
    const ids = f.text.trim().split(/\s+/);
    if (ids.length !== 3) {
      return error({ severity: 'error', code: 'InvalidValue', element: 'F', value: f.text });
    }
    for (const id of ids) {
      const k = index.get(id);
      if (k === undefined) return error({ severity: 'error', code: 'UnknownPoint', id });
      triangles.push(k);
    }
  }
  if (triangles.length === 0) return error({ severity: 'error', code: 'EmptySurface' });
  // EPSG:5514 má na Slovensku záporné E aj N (ADR 0003)
  const x = coords[0] as number;
  const y = coords[1] as number;
  if (!(x < 0 && y < 0)) {
    return error({ severity: 'error', code: 'CoordinateSystemMismatch', x, y });
  }
  return { name, points: Float64Array.from(coords), triangles: Uint32Array.from(triangles) };
}
