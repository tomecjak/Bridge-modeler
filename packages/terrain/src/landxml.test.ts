import { describe, expect, it } from 'vitest';
import { parseSurfaces } from './landxml.ts';

/** Povrch so štyrmi bodmi (štvorec 10 × 10 m) a dvoma plochami; súradnice vymyslené. */
function landXml(surfaces: string, units = '<Metric linearUnit="meter" areaUnit="squareMeter"/>') {
  return `<?xml version="1.0"?>
<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2" version="1.2">
  <Units>${units}</Units>
  <Surfaces>${surfaces}</Surfaces>
</LandXML>`;
}

const square = (name: string, extraFace = '') => `
<Surface name="${name}">
  <Definition surfType="TIN">
    <Pnts>
      <P id="1">-1200000 -600000 250.5</P>
      <P id="2">-1200000 -599990 251</P>
      <P id="3">-1199990 -599990 252</P>
      <P id="4">-1199990 -600000 251.5</P>
    </Pnts>
    <Faces>
      <F>1 2 3</F>
      <F>1 3 4</F>${extraFace}
    </Faces>
  </Definition>
</Surface>`;

describe('parseSurfaces', () => {
  it('reads points in N E Z order as x = E, y = N and the faces', () => {
    const { surfaces, issues } = parseSurfaces(landXml(square('EG')));
    expect(issues).toEqual([]);
    const s = surfaces[0];
    expect(s?.name).toBe('EG');
    expect([...(s?.points.slice(0, 6) ?? [])]).toEqual([
      -600000, -1200000, 250.5, -599990, -1200000, 251,
    ]);
    expect([...(s?.triangles ?? [])]).toEqual([0, 1, 2, 0, 2, 3]);
  });

  it('lists several surfaces and skips invisible faces', () => {
    const { surfaces } = parseSurfaces(
      landXml(square('EG') + square('FG', '\n      <F i="1">2 3 4</F>')),
    );
    expect(surfaces.map((s) => s.name)).toEqual(['EG', 'FG']);
    expect(surfaces[1]?.triangles.length).toBe(6);
  });

  it('reports typed errors for wrong units, coordinates, references and missing surfaces', () => {
    expect(
      parseSurfaces(landXml(square('A'), '<Imperial linearUnit="USSurveyFoot"/>')).issues[0]?.code,
    ).toBe('UnsupportedUnit');
    expect(
      parseSurfaces(
        landXml(
          square('A')
            .replaceAll('-1200000', '1200000')
            .replaceAll('-5999', '5999')
            .replaceAll('-600000', '600000'),
        ),
      ).issues[0],
    ).toMatchObject({
      code: 'CoordinateSystemMismatch',
      surface: 'A',
    });
    expect(parseSurfaces(landXml(square('A', '\n      <F>1 2 9</F>'))).issues[0]).toMatchObject({
      code: 'UnknownPoint',
      id: '9',
    });
    expect(parseSurfaces(landXml('')).issues[0]?.code).toBe('NoSurfaces');
    expect(parseSurfaces('<not xml').issues[0]?.code).toBe('InvalidXml');
    expect(
      parseSurfaces(landXml('<Surface name="G"><Definition surfType="grid"/></Surface>')).issues[0],
    ).toMatchObject({ code: 'UnsupportedSurfaceType', surfType: 'grid' });
  });
});
