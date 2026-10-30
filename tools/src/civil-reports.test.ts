import { describe, expect, it } from 'vitest';
import {
  detectReportKind,
  htmlToCells,
  parseCivilNumber,
  parseCivilStation,
  parseIncrementalStationReport,
  parsePackedDmsAzimuth,
  parseProfileReport,
  parseQuadrantBearing,
  parseStationAndCurveReport,
} from './civil-reports.ts';

const deg = (d: number) => (d * Math.PI) / 180;

describe('Civil 3D report values', () => {
  it('parses km and hundreds station formats', () => {
    expect(parseCivilStation('0+723.3528')).toBeCloseTo(723.3528, 9);
    expect(parseCivilStation('1+58.761')).toBeCloseTo(158.761, 9);
    expect(parseCivilStation('-1+296.6513')).toBeCloseTo(-1296.6513, 9);
    expect(parseCivilStation('PVI')).toBeUndefined();
  });

  it('parses numbers with thousands separators and units', () => {
    expect(parseCivilNumber('-1,069,538.1131m')).toBe(-1069538.1131);
    expect(parseCivilNumber('-1.380000%')).toBe(-1.38);
  });

  it('parses packed DMS north azimuth and quadrant bearings', () => {
    expect(parsePackedDmsAzimuth('S 126.4824.3992 (smv)')).toBeCloseTo(
      deg(126 + 48 / 60 + 24.3992 / 3600),
      14,
    );
    expect(parseQuadrantBearing(`S 53° 11' 35.6008" E`)).toBeCloseTo(
      deg(180 - (53 + 11 / 60 + 35.6008 / 3600)),
      14,
    );
    expect(parseQuadrantBearing(`N 10° 00' 00" W`)).toBeCloseTo(deg(350), 14);
  });
});

describe('Civil 3D reports', () => {
  it('reads an incremental station report', () => {
    const html = `<h1>Zpráva o přírůstkovém staničení trasy</h1><table>
      <tr><th>Staničení</th><th>Y</th><th>X</th><th>Směr tečny</th></tr>
      <tr><td>0+000.0000</td><td>-1,000,000.0000m</td><td>-600,000.0000m</td><td>S 90.0000.0000 (smv)</td></tr>
      <tr><td>0+010.0000</td><td>-1,000,000.0000m</td><td>-599,990.0000m</td><td>S 90.0000.0000 (smv)</td></tr></table>`;
    const cells = htmlToCells(html);
    expect(detectReportKind(cells)).toBe('stations');
    expect(parseIncrementalStationReport(cells)).toEqual([
      { station: 0, northing: -1000000, easting: -600000, azimuth: Math.PI / 2 },
      { station: 10, northing: -1000000, easting: -599990, azimuth: Math.PI / 2 },
    ]);
  });

  it('reads a profile report with optional grade and labels', () => {
    const cells = htmlToCells(`<p>Výškové vedení trasy</p><table>
      <tr><td>0+000.0000</td><td>294.4541m</td><td></td><td>PVI</td></tr>
      <tr><td>0+010.0000</td><td>294.3161m</td><td>-1.380000%</td><td></td></tr>
      <tr><td>0+032.4655</td><td>294.0061m</td><td>-1.380000%</td><td>PVC</td></tr></table>`);
    expect(detectReportKind(cells)).toBe('profile');
    expect(parseProfileReport(cells)).toEqual([
      { station: 0, elevation: 294.4541, grade: undefined, label: 'PVI' },
      { station: 10, elevation: 294.3161, grade: -0.0138, label: '' },
      { station: 32.4655, elevation: 294.0061, grade: -0.0138, label: 'PVC' },
    ]);
  });

  it('reads geometry points from a station and curve report', () => {
    const cells = htmlToCells(`<h1>Alignment Station and Curve Report</h1><table>
      <tr><td>TS:</td><td>0+06.378</td><td>-1069541.934</td><td>-617205.782</td></tr>
      <tr><td>SPI:</td><td>-1069577.927</td><td>-617157.681</td></tr>
      <tr><td>SC:</td><td>0+96.378</td><td>-1069592.004</td><td>-617131.112</td></tr></table>`);
    expect(detectReportKind(cells)).toBe('geometry');
    expect(parseStationAndCurveReport(cells)).toMatchObject([
      { label: 'TS', station: 6.378 },
      { label: 'SC', station: 96.378 },
    ]);
  });
});
