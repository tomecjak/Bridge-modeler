/**
 * Čítanie HTML výkazov Civil 3D (anglická aj česká lokalizácia) do riadkov s číslami.
 * Formáty overené na výkazoch z 2026-10-29 (PLAN.md §7):
 * - staničenie `0+123.4567` (km + metre) alebo `1+23.456` (stovky + metre),
 * - súradnice `-1,069,538.1131m` (stĺpec „Y“ = Northing, „X“ = Easting),
 * - smer `S 126.4824.3992 (smv)` = severný azimut v DMS, alebo kvadrantový smerník `S 53° 11' 35.6008" E`.
 */

export interface StationRow {
  station: number;
  northing: number;
  easting: number;
  /** severný azimut [rad] */
  azimuth: number;
}

export interface ProfileRow {
  station: number;
  elevation: number;
  /** sklon [m/m]; prvý riadok výkazu ho nemá */
  grade: number | undefined;
  label: string;
}

export interface GeometryPointRow {
  label: string;
  station: number;
  northing: number;
  easting: number;
}

/** HTML → neprázdne textové bunky v poradí dokumentu. */
export function htmlToCells(html: string): string[] {
  const text = html
    .replace(/^﻿/, '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(tr|p|h\d|td|th|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
  return text
    .split(/\r?\n|\r/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l !== '');
}

const STATION = /^(-?)(\d+)\+(\d+)(\.\d+)?$/;

/** `0+123.4567` → 123.4567; `1+58.761` → 158.761 (podľa počtu číslic pred desatinnou bodkou). */
export function parseCivilStation(cell: string): number | undefined {
  const m = STATION.exec(cell);
  if (!m) return undefined;
  const [, sign, major, minor, fraction] = m as unknown as [
    string,
    string,
    string,
    string,
    string?,
  ];
  const unit = minor.length === 3 ? 1000 : minor.length === 2 ? 100 : undefined;
  if (unit === undefined) return undefined;
  const value = Number(major) * unit + Number(minor + (fraction ?? ''));
  return sign === '-' ? -value : value;
}

/** `-1,069,538.1131m` → −1069538.1131 */
export function parseCivilNumber(cell: string): number | undefined {
  const cleaned = cell.replace(/,/g, '').replace(/m$|%$/, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return undefined;
  return Number(cleaned);
}

/** `S 126.4824.3992 (smv)` → azimut v rad (stupne.minútysekundy, severný azimut). */
export function parsePackedDmsAzimuth(cell: string): number | undefined {
  const m = /^[A-Z]?\s*(\d+)\.(\d{2})(\d{2})\.?(\d*)/.exec(cell);
  if (!m) return undefined;
  const [, d, mm, ss, frac] = m as unknown as [string, string, string, string, string];
  const degrees = Number(d) + Number(mm) / 60 + Number(`${ss}.${frac || '0'}`) / 3600;
  return (degrees * Math.PI) / 180;
}

/** Kvadrantový smerník `S 53° 11' 35.6008" E` → severný azimut v rad. */
export function parseQuadrantBearing(cell: string): number | undefined {
  const m = /^([NS])\s*(\d+)°\s*(\d+)'\s*([\d.]+)"\s*([EW])$/.exec(cell);
  if (!m) return undefined;
  const [, ns, d, mm, ss, ew] = m as unknown as [string, string, string, string, string, string];
  const angle = Number(d) + Number(mm) / 60 + Number(ss) / 3600;
  const azimuth =
    ns === 'N' ? (ew === 'E' ? angle : 360 - angle) : ew === 'E' ? 180 - angle : 180 + angle;
  return (azimuth * Math.PI) / 180;
}

/** Výkaz prírastkového staničenia osi: staničenie, Y (N), X (E), smer dotyčnice. */
export function parseIncrementalStationReport(cells: string[]): StationRow[] {
  const rows: StationRow[] = [];
  for (let i = 0; i + 3 < cells.length; i++) {
    const station = parseCivilStation(cells[i] as string);
    if (station === undefined) continue;
    const northing = parseCivilNumber(cells[i + 1] as string);
    const easting = parseCivilNumber(cells[i + 2] as string);
    const azimuth = parsePackedDmsAzimuth(cells[i + 3] as string);
    if (northing === undefined || easting === undefined || azimuth === undefined) continue;
    rows.push({ station, northing, easting, azimuth });
    i += 3;
  }
  return rows;
}

/** Výkaz prírastkového staničenia nivelety: staničenie, výška, [sklon %], [označenie bodu]. */
export function parseProfileReport(cells: string[]): ProfileRow[] {
  const rows: ProfileRow[] = [];
  for (let i = 0; i + 1 < cells.length; i++) {
    const station = parseCivilStation(cells[i] as string);
    const elevation = station === undefined ? undefined : parseCivilNumber(cells[i + 1] as string);
    if (station === undefined || elevation === undefined) continue;
    let j = i + 2;
    let grade: number | undefined;
    const gradeCell = cells[j];
    if (gradeCell?.endsWith('%')) {
      grade = (parseCivilNumber(gradeCell) as number) / 100;
      j++;
    }
    let label = '';
    const next = cells[j];
    if (next !== undefined && parseCivilStation(next) === undefined) {
      label = next;
      j++;
    }
    rows.push({ station, elevation, grade, label });
    i = j - 1;
  }
  return rows;
}

const GEOMETRY_LABELS = new Set([
  'Start:',
  'End:',
  'TS:',
  'SC:',
  'CS:',
  'ST:',
  'PC:',
  'PT:',
  'POT:',
]);

/** Station and Curve Report: geometrické body so staničením (TS, SC, CS, ST, PC, PT …). */
export function parseStationAndCurveReport(cells: string[]): GeometryPointRow[] {
  const rows: GeometryPointRow[] = [];
  for (let i = 0; i + 3 < cells.length; i++) {
    const label = cells[i] as string;
    if (!GEOMETRY_LABELS.has(label)) continue;
    const station = parseCivilStation(cells[i + 1] as string);
    const northing = parseCivilNumber(cells[i + 2] as string);
    const easting = parseCivilNumber(cells[i + 3] as string);
    if (station === undefined || northing === undefined || easting === undefined) continue;
    rows.push({ label: label.replace(':', ''), station, northing, easting });
    i += 3;
  }
  return rows;
}

export type ReportKind = 'stations' | 'profile' | 'geometry';

/** Rozpozná typ výkazu podľa obsahu (názov súboru je ľubovoľný). */
export function detectReportKind(cells: string[]): ReportKind | undefined {
  const head = cells.slice(0, 40).join(' ');
  if (/Station and Curve Report/i.test(head)) return 'geometry';
  if (/PVI|výškového|Profile|Vertical/i.test(head)) return 'profile';
  if (/Směr tečny|Smer dotyčnice|Tangential Direction|Tangent Direction/i.test(cells.join(' '))) {
    return 'stations';
  }
  return undefined;
}
