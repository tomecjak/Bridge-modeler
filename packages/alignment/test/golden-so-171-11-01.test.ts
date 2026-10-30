/**
 * Golden testy osi SO 171-11-01 proti výkazom Civil 3D (CLAUDE.md: poloha ≤ 1 mm, smerník ≤ 1e-5 rad).
 * Dáta sa neverzujú: pripraví ich `pnpm fixtures:convert` z `fixtures/inbox/`. Bez nich sa testy preskočia.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { angleDifference } from '@bridge/geom';
import { describe, expect, it } from 'vitest';
import { createAlignment, parseLandXml, suggestOrigin } from '../src/index.ts';

const dir = resolve(import.meta.dirname, '../../../fixtures/local/alignment/so-171-11-01');
const files = ['alignment.xml', 'stations.csv', 'profile.csv', 'geometry.csv'];
const available = files.every((f) => existsSync(join(dir, f)));

const POSITION_TOLERANCE = 1e-3;
const AZIMUTH_TOLERANCE = 1e-5;
const GRADE_TOLERANCE = 1e-6;

function readCsv(name: string): Record<string, string>[] {
  const [header, ...lines] = readFileSync(join(dir, name), 'utf8').trim().split('\n');
  const keys = (header as string).split(',');
  return lines.map((line) => {
    const values = line.split(',');
    return Object.fromEntries(keys.map((k, i) => [k, values[i] ?? '']));
  });
}

describe.skipIf(!available)('golden: SO 171-11-01 vs Civil 3D', () => {
  const parsed = available
    ? parseLandXml(readFileSync(join(dir, 'alignment.xml'), 'utf8'))
    : undefined;
  const data = parsed?.alignments[0];
  if (!data) return;
  const origin = suggestOrigin(data);
  const { alignment, issues } = createAlignment(data, origin);

  it('imports without errors; only the known 7″ kink in the Civil 3D data is reported', () => {
    expect(parsed?.issues).toEqual([]);
    // 0,042 m priamka medzi prechodnicami (prvok 4) nie je dotyčnicová: dir 353,297799° vs. koniec
    // prechodnice 353,299737° → zlom 3,4e-5 rad priamo v podkladoch (PLAN.md §7)
    expect(issues).toMatchObject([{ code: 'DirectionMismatch', index: 4, severity: 'warning' }]);
    expect(issues).toHaveLength(1);
  });

  it('matches 74 incremental stations in position (≤ 1 mm) and azimuth (≤ 1e-5 rad)', () => {
    const rows = readCsv('stations.csv');
    expect(rows.length).toBeGreaterThanOrEqual(20);
    let maxPos = 0;
    let maxAz = 0;
    for (const r of rows) {
      const s = Number(r.station) - alignment.staStart;
      const h = alignment.evaluateHorizontal(s);
      const dE = h.point.x + origin.x - Number(r.easting);
      const dN = h.point.y + origin.y - Number(r.northing);
      maxPos = Math.max(maxPos, Math.abs(dE), Math.abs(dN));
      maxAz = Math.max(maxAz, Math.abs(angleDifference(h.azimuth, Number(r.azimuth_rad))));
    }
    console.info(
      `SO 171-11-01 os: max |ΔE|,|ΔN| = ${(maxPos * 1000).toFixed(4)} mm, max Δazimut = ${maxAz.toExponential(2)} rad`,
    );
    expect(maxPos).toBeLessThanOrEqual(POSITION_TOLERANCE);
    expect(maxAz).toBeLessThanOrEqual(AZIMUTH_TOLERANCE);
  });

  it('matches element joints from the station and curve report', () => {
    const rows = readCsv('geometry.csv');
    const boundaries = alignment.horizontal.boundaries.map((s) => s + alignment.staStart);
    for (const r of rows) {
      const station = Number(r.station);
      // výkaz zaokrúhľuje staničenie aj súradnice na 1 mm
      const nearest = boundaries.reduce((a, b) =>
        Math.abs(b - station) < Math.abs(a - station) ? b : a,
      );
      expect(Math.abs(nearest - station)).toBeLessThanOrEqual(0.0005 + 1e-9);
      const h = alignment.evaluateHorizontal(nearest - alignment.staStart);
      expect(Math.abs(h.point.x + origin.x - Number(r.easting))).toBeLessThanOrEqual(0.0005 + 1e-6);
      expect(Math.abs(h.point.y + origin.y - Number(r.northing))).toBeLessThanOrEqual(
        0.0005 + 1e-6,
      );
    }
  });

  it('matches the vertical profile in elevation (≤ 1 mm) and grade (≤ 1e-6)', () => {
    const rows = readCsv('profile.csv');
    let maxZ = 0;
    let maxGrade = 0;
    rows.forEach((r, i) => {
      const s = Number(r.station) - alignment.staStart;
      const p = alignment.elevation(s);
      maxZ = Math.max(maxZ, Math.abs(p.z + origin.z - Number(r.elevation)));
      // Civil 3D uvádza sklon sečnice od predchádzajúceho riadku výkazu, nie dotyčnicový sklon
      const prev = rows[i - 1];
      if (prev && r.grade !== '') {
        const sPrev = Number(prev.station) - alignment.staStart;
        const chord = (p.z - alignment.elevation(sPrev).z) / (s - sPrev);
        maxGrade = Math.max(maxGrade, Math.abs(chord - Number(r.grade)));
      }
    });
    console.info(
      `SO 171-11-01 niveleta: max Δz = ${(maxZ * 1000).toFixed(4)} mm, max Δsklon = ${maxGrade.toExponential(2)}`,
    );
    expect(maxZ).toBeLessThanOrEqual(POSITION_TOLERANCE);
    expect(maxGrade).toBeLessThanOrEqual(GRADE_TOLERANCE);
  });
});

describe.skipIf(available)('golden: SO 171-11-01 (data missing)', () => {
  it.todo(
    'dodaj podklady do fixtures/inbox/ (SO 171-11-01.xml + výkazy Civil 3D) a spusti pnpm fixtures:convert',
  );
});

describe('golden: os 101-00 (záporné staničenia)', () => {
  it.todo(
    'potrebné: výkazy Civil 3D k osi 101-00 (prírastkové staničenie osi a nivelety, Station and Curve Report) podľa docs/navod-kontrolne-body-civil3d.md',
  );
});
