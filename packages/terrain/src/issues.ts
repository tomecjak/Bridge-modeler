/**
 * Typované problémy importu terénu. Neobsahujú texty — hlášky pre projektanta skladá UI.
 * `severity: 'error'` znamená, že povrch sa nedá použiť; `'warning'` je upozornenie.
 */
export type TerrainIssue = { severity: 'error' | 'warning'; surface?: string } & (
  | { code: 'InvalidXml'; detail: string }
  | { code: 'NoSurfaces' }
  | { code: 'UnsupportedUnit'; unit: string }
  | { code: 'UnsupportedSurfaceType'; surfType: string }
  | { code: 'InvalidValue'; element: string; value: string }
  | { code: 'UnknownPoint'; id: string }
  | { code: 'CoordinateSystemMismatch'; x: number; y: number }
  | { code: 'EmptySurface' }
  | { code: 'InvalidGeoTiff'; detail: string }
  | { code: 'UnsupportedCrs'; epsg: number }
  | { code: 'OutsideCorridor' }
);

export type TerrainIssueCode = TerrainIssue['code'];
