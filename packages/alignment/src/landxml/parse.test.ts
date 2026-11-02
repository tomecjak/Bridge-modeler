import { describe, expect, it } from 'vitest';
import { landXmlDirectionToAzimuth, parseLandXml } from './parse.ts';

const UNITS_METRIC = `<Units><Metric linearUnit="meter" angularUnit="decimal degrees" directionUnit="decimal degrees"/></Units>`;

function doc(body: string, units = UNITS_METRIC): string {
  return `<?xml version="1.0"?>
<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2" version="1.2">
  ${units}
  <Alignments>${body}</Alignments>
</LandXML>`;
}

// Syntetické úseky (posunutá geometria typickej cesty), body v poradí N E.
const LINE = `<Line dir="323.193222434209" length="6.377599850333">
  <Start>-1012538.113144636154 -603210.888138766633</Start>
  <End>-1012541.934081502724 -603205.781846441212</End>
</Line>`;
const SPIRAL = `<Spiral length="90.000000180596" radiusEnd="290.000000025116" radiusStart="INF" rot="ccw" spiType="clothoid">
  <Start>-1012541.934081502724 -603205.781846441212</Start>
  <PI>-1012577.926623557461 -603157.681485808571</PI>
  <End>-1012592.004234542605 -603131.111509643611</End>
</Spiral>`;
const CURVE = `<Curve rot="ccw" crvType="arc" length="62.383779214729" radius="290.000000025125">
  <Start>-1012592.004234542605 -603131.111509643611</Start>
  <Center>-1012335.750232215039 -602995.340060856775</Center>
  <End>-1012615.079913407564 -603073.281893139007</End>
</Curve>`;
const PROFILE = `<Profile name="P">
  <ProfAlign name="Niveleta">
    <PVI>0. 294.4541336</PVI>
    <ParaCurve length="55.813078448657">60.372 293.621</ParaCurve>
    <CircCurve length="40" radius="5000">100 294</CircCurve>
    <PVI>158.761 295.15</PVI>
  </ProfAlign>
</Profile>`;

function alignment(geom: string, extra = '', attrs = 'staStart="0."'): string {
  return `<Alignment name="A1" length="158.761158" ${attrs}><CoordGeom>${geom}</CoordGeom>${extra}</Alignment>`;
}

describe('landXmlDirectionToAzimuth', () => {
  it('converts LandXML direction (CCW from east) to azimuth (CW from north)', () => {
    // Overené na reálnej osi: LandXML dir 323,193222° ↔ výkaz Civil 3D „S 126.4824.3992“.
    const az = landXmlDirectionToAzimuth((323.193222434209 * Math.PI) / 180);
    const civil = ((126 + 48 / 60 + 24.3992 / 3600) * Math.PI) / 180;
    expect(Math.abs(az - civil)).toBeLessThan(1e-9);
  });
});

describe('parseLandXml', () => {
  it('reads elements in order and swaps N E into x = E, y = N', () => {
    const { alignments, issues } = parseLandXml(doc(alignment(LINE + SPIRAL + CURVE, PROFILE)));
    expect(issues).toEqual([]);
    expect(alignments).toHaveLength(1);
    const a = alignments[0];
    expect(a?.name).toBe('A1');
    expect(a?.staStart).toBe(0);
    expect(a?.horizontal.map((e) => e.kind)).toEqual(['line', 'spiral', 'arc']);
    const line = a?.horizontal[0];
    expect(line?.start).toEqual({
      x: Number('-603210.888138766633'),
      y: Number('-1012538.113144636154'),
    });
  });

  it('reads spiral parameters with INF radius as null and start azimuth from PI', () => {
    const { alignments } = parseLandXml(doc(alignment(SPIRAL)));
    const s = alignments[0]?.horizontal[0];
    expect(s?.kind).toBe('spiral');
    if (s?.kind !== 'spiral') return;
    expect(s.radiusStart).toBeNull();
    expect(s.radiusEnd).toBeCloseTo(290, 6);
    expect(s.rotation).toBe('ccw');
    const dx = Number('-603157.681485808571') - Number('-603205.781846441212');
    const dy = Number('-1012577.926623557461') - Number('-1012541.934081502724');
    expect(s.startAzimuth).toBeCloseTo((Math.atan2(dx, dy) + 2 * Math.PI) % (2 * Math.PI), 12);
  });

  it('reads arc center, radius and rotation', () => {
    const { alignments } = parseLandXml(doc(alignment(CURVE)));
    const c = alignments[0]?.horizontal[0];
    expect(c).toMatchObject({ kind: 'arc', rotation: 'ccw', radius: 290.000000025125 });
  });

  it('reads the vertical profile with parabolic and circular curves', () => {
    const { alignments } = parseLandXml(doc(alignment(LINE, PROFILE)));
    expect(alignments[0]?.profiles).toEqual([
      {
        name: 'Niveleta',
        pvis: [
          { station: 0, elevation: 294.4541336 },
          {
            station: 60.372,
            elevation: 293.621,
            curve: { kind: 'parabolic', length: 55.813078448657 },
          },
          { station: 100, elevation: 294, curve: { kind: 'circular', length: 40, radius: 5000 } },
          { station: 158.761, elevation: 295.15 },
        ],
      },
    ]);
  });

  it('reads superelevation of curves and warns about invalid values without failing the alignment', () => {
    const se = `<Superelevation staStart="20" staEnd="60"><BeginRunoutSta>5</BeginRunoutSta>
      <BeginRunoffSta>10</BeginRunoffSta><FullSuperSta>20</FullSuperSta><FullSuperelev>-4.</FullSuperelev>
      <RunoffSta>60</RunoffSta><StartofRunoutSta>70</StartofRunoutSta><EndofRunoutSta>75</EndofRunoutSta>
      </Superelevation><Superelevation staStart="80" staEnd="90"><FullSuperelev>x</FullSuperelev></Superelevation>
      <Superelevation staEnd="95"/>`;
    const { alignments, issues } = parseLandXml(doc(alignment(LINE, se)));
    expect(alignments[0]?.superelevation).toEqual([
      {
        staStart: 20,
        staEnd: 60,
        beginRunout: 5,
        beginRunoff: 10,
        fullSuper: 20,
        fullSuperelev: -4,
        runoff: 60,
        startOfRunout: 70,
        endOfRunout: 75,
      },
      { staStart: 80, staEnd: 90 },
    ]);
    expect(issues.map((i) => [i.severity, i.code])).toEqual([
      ['warning', 'InvalidValue'],
      ['warning', 'InvalidValue'],
    ]);
    // os bez klopenia pole nemá
    expect(parseLandXml(doc(alignment(LINE))).alignments[0]?.superelevation).toBeUndefined();
  });

  it('reads station equations', () => {
    const eq = '<StaEquation staInternal="120" staBack="1120" staAhead="1100"/>';
    const { alignments } = parseLandXml(doc(alignment(LINE, eq, 'staStart="1000"')));
    expect(alignments[0]?.staStart).toBe(1000);
    expect(alignments[0]?.stationEquations).toEqual([
      { staInternal: 120, staBack: 1120, staAhead: 1100 },
    ]);
  });

  it('converts grads and radians in direction attributes', () => {
    const spiral = `<Spiral length="10" radiusStart="INF" radiusEnd="100" rot="cw" spiType="clothoid" dirStart="100">
      <Start>-1000 -2000</Start><End>-1000 -1990</End></Spiral>`;
    const grads = `<Units><Metric linearUnit="meter" angularUnit="grads" directionUnit="grads"/></Units>`;
    const { alignments, issues } = parseLandXml(doc(alignment(spiral), grads));
    expect(issues).toEqual([]);
    const s = alignments[0]?.horizontal[0];
    // 100 gon od +E proti smeru hodín = sever → azimut 0
    expect(s?.kind === 'spiral' && s.startAzimuth).toBeCloseTo(0, 12);
  });

  it('rejects positive (classic S-JTSK) coordinates', () => {
    const line = `<Line length="10"><Start>1069538 617210</Start><End>1069548 617210</End></Line>`;
    const { alignments, issues } = parseLandXml(doc(alignment(line)));
    expect(alignments).toEqual([]);
    expect(issues).toMatchObject([{ code: 'CoordinateSystemMismatch', severity: 'error' }]);
  });

  it('rejects unsupported spiral types', () => {
    const spiral = SPIRAL.replace('clothoid', 'cubic');
    const { alignments, issues } = parseLandXml(doc(alignment(spiral)));
    expect(alignments).toEqual([]);
    expect(issues).toMatchObject([
      { code: 'UnsupportedSpiralType', spiralType: 'cubic', index: 0, alignment: 'A1' },
    ]);
  });

  it('rejects unsupported horizontal elements and vertical curves', () => {
    const chain = '<Chain>1 2</Chain>';
    expect(parseLandXml(doc(alignment(chain))).issues).toMatchObject([
      { code: 'UnsupportedElement', element: 'Chain' },
    ]);
    const unsym = PROFILE.replace(
      '<CircCurve length="40" radius="5000">100 294</CircCurve>',
      '<UnsymParaCurve lengthIn="10" lengthOut="20">100 294</UnsymParaCurve>',
    );
    expect(parseLandXml(doc(alignment(LINE, unsym))).issues).toMatchObject([
      { code: 'UnsupportedVerticalCurve', curveType: 'UnsymParaCurve' },
    ]);
  });

  it('reports invalid numbers with element and field', () => {
    const line = LINE.replace('length="6.377599850333"', 'length="abc"');
    expect(parseLandXml(doc(alignment(line))).issues).toMatchObject([
      { code: 'InvalidValue', element: 'Line', field: 'length', value: 'abc' },
    ]);
  });

  it('rejects imperial units', () => {
    const imperial = `<Units><Imperial linearUnit="USSurveyFoot" angularUnit="decimal degrees" directionUnit="decimal degrees"/></Units>`;
    expect(parseLandXml(doc(alignment(LINE), imperial)).issues).toMatchObject([
      { code: 'UnsupportedUnit', quantity: 'linear', unit: 'USSurveyFoot' },
    ]);
  });

  it('warns when units are missing and assumes meters and decimal degrees', () => {
    const { alignments, issues } = parseLandXml(doc(alignment(LINE), ''));
    expect(alignments).toHaveLength(1);
    expect(issues).toMatchObject([{ code: 'MissingUnits', severity: 'warning' }]);
  });

  it('reports invalid XML and files without alignments', () => {
    expect(parseLandXml('<LandXML><Alignments>').issues).toMatchObject([
      { code: 'InvalidXml', severity: 'error' },
    ]);
    expect(parseLandXml(doc('')).issues).toMatchObject([
      { code: 'NoAlignments', severity: 'error' },
    ]);
  });
});
