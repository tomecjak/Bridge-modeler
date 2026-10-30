import { describe, expect, it } from 'vitest';
import { importLandXml } from './importLandXml.ts';

const units = `<Units><Metric linearUnit="meter" angularUnit="decimal degrees" directionUnit="decimal degrees"/></Units>`;
const line = (n: number) =>
  `<Line length="100"><Start>${n} -600000</Start><End>${n + 100} -600000</End></Line>`;

describe('importLandXml', () => {
  it('builds alignments with a shared origin and keeps per-alignment issues', () => {
    const xml = `<LandXML>${units}<Alignments>
      <Alignment name="A" length="100"><CoordGeom>${line(-1000000)}</CoordGeom></Alignment>
      <Alignment name="B" length="101"><CoordGeom>${line(-1000200)}</CoordGeom></Alignment>
      <Alignment name="C" length="1"><CoordGeom><Chain/></CoordGeom></Alignment>
    </Alignments></LandXML>`;
    const r = importLandXml('test.xml', xml);
    expect(r.origin).toEqual({ x: -600000, y: -1000000, z: 0 });
    expect(r.alignments.map((a) => a.data.name)).toEqual(['A', 'B']);
    expect(r.alignments[1]?.issues).toMatchObject([{ code: 'LengthMismatch' }]);
    expect(r.issues).toMatchObject([{ code: 'UnsupportedElement', alignment: 'C' }]);
  });

  it('returns file-level errors for invalid input', () => {
    const r = importLandXml('bad.xml', 'not xml');
    expect(r.alignments).toEqual([]);
    expect(r.issues[0]?.severity).toBe('error');
  });
});
