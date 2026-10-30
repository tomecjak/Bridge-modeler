/**
 * Prevedie podklady z `fixtures/inbox/` na golden dáta v `fixtures/local/alignment/<názov>/` (neverzované).
 *
 *   pnpm fixtures:convert [<inbox>] [<cieľ>] [<názov>]
 *
 * Výstup: alignment.xml (kópia LandXML), stations.csv, profile.csv, geometry.csv.
 */
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  detectReportKind,
  htmlToCells,
  parseIncrementalStationReport,
  parseProfileReport,
  parseStationAndCurveReport,
} from './civil-reports.ts';

const root = resolve(import.meta.dirname, '../..');
const inbox = resolve(process.argv[2] ?? join(root, 'fixtures/inbox'));
const name = process.argv[4] ?? 'so-171-11-01';
const target = resolve(process.argv[3] ?? join(root, 'fixtures/local/alignment', name));

const files = readdirSync(inbox);
const xml = files.find((f) => f.toLowerCase().endsWith('.xml') && f.includes('171-11-01'));
if (!xml) throw new Error(`V ${inbox} chýba LandXML osi SO 171-11-01.`);

mkdirSync(target, { recursive: true });
copyFileSync(join(inbox, xml), join(target, 'alignment.xml'));

const n = (v: number | undefined) => (v === undefined ? '' : String(v));
const written: string[] = ['alignment.xml'];

for (const file of files.filter((f) => f.toLowerCase().endsWith('.html'))) {
  const cells = htmlToCells(readFileSync(join(inbox, file), 'utf8'));
  const kind = detectReportKind(cells);
  let csv: string;
  if (kind === 'stations') {
    const rows = parseIncrementalStationReport(cells);
    csv = [
      'station,northing,easting,azimuth_rad',
      ...rows.map((r) => [r.station, r.northing, r.easting, r.azimuth].join(',')),
    ].join('\n');
  } else if (kind === 'profile') {
    const rows = parseProfileReport(cells);
    csv = [
      'station,elevation,grade,label',
      ...rows.map((r) => [r.station, r.elevation, n(r.grade), JSON.stringify(r.label)].join(',')),
    ].join('\n');
  } else if (kind === 'geometry') {
    const rows = parseStationAndCurveReport(cells);
    csv = [
      'label,station,northing,easting',
      ...rows.map((r) => [r.label, r.station, r.northing, r.easting].join(',')),
    ].join('\n');
  } else {
    console.warn(`Preskakujem ${file}: neznámy typ výkazu.`);
    continue;
  }
  const out = `${kind}.csv`;
  writeFileSync(join(target, out), `${csv}\n`);
  written.push(`${out} (${csv.split('\n').length - 1} riadkov, z ${file})`);
}

console.log(`Golden dáta v ${target}:\n  ${written.join('\n  ')}`);
