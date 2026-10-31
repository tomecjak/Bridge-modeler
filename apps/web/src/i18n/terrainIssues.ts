import type { TerrainIssue } from '@bridge/terrain';
import { formatNumber } from '../format/number.ts';

/** Zrozumiteľná slovenská hláška k problému pri importe terénu. */
export function formatTerrainIssue(issue: TerrainIssue): string {
  const surface = issue.surface ? `Povrch „${issue.surface}“: ` : '';
  switch (issue.code) {
    case 'InvalidXml':
      return `Súbor nie je platné XML (${issue.detail}).`;
    case 'NoSurfaces':
      return 'Súbor neobsahuje žiadny povrch (Surfaces/Surface).';
    case 'UnsupportedUnit':
      return `Nepodporované jednotky dĺžky „${issue.unit}“; podporované sú metre.`;
    case 'UnsupportedSurfaceType':
      return `${surface}nepodporovaný typ povrchu „${issue.surfType}“; podporovaný je TIN.`;
    case 'InvalidValue':
      return `${surface}neplatná hodnota ${issue.element}: „${issue.value}“.`;
    case 'UnknownPoint':
      return `${surface}plocha odkazuje na neexistujúci bod „${issue.id}“.`;
    case 'CoordinateSystemMismatch':
      return `${surface}súradnice nie sú v S-JTSK EPSG:5514 (záporné E aj N): E = ${formatNumber(issue.x, 3)}, N = ${formatNumber(issue.y, 3)}.`;
    case 'EmptySurface':
      return `${surface}povrch nemá žiadne trojuholníky.`;
    case 'InvalidGeoTiff':
      return `Súbor nie je čitateľný GeoTIFF (${issue.detail}).`;
    case 'UnsupportedCrs':
      return `Raster je v súradnicovom systéme EPSG:${issue.epsg}; podporovaný je S-JTSK (EPSG:5514 alebo 8353).`;
    case 'OutsideCorridor':
      return 'Raster nepokrýva koridor okolo osi.';
  }
}
