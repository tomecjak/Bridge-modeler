import { describe, expect, it } from 'vitest';
import { BASEMAPS, getMapUrl, imageSize, parseCapabilities } from './basemap.ts';

const caps = `<?xml version="1.0"?>
<WMS_Capabilities version="1.3.0" xmlns="http://www.opengis.net/wms">
  <Capability>
    <Layer>
      <Title>Root</Title>
      <CRS>EPSG:4326</CRS>
      <CRS>EPSG:5514</CRS>
      <Layer>
        <Title>Skupina</Title>
        <Layer><Name>1</Name><Title>Ortofoto</Title></Layer>
        <Layer><Name>2</Name><Title>Obrysy snímok</Title></Layer>
        <Layer>
          <Name>3</Name><Title>Cesty</Title>
          <Layer><Name>4</Name><Title>Diaľnice</Title></Layer>
          <Layer><Name>5</Name><Title>Cesty I. triedy</Title></Layer>
        </Layer>
      </Layer>
    </Layer>
  </Capability>
</WMS_Capabilities>`;

describe('mapový podklad ZBGIS', () => {
  it('picks the orthophoto layer by title and all leaf layers for the base map', () => {
    expect(parseCapabilities(caps, { pick: 'Ortofoto' })).toEqual({
      layers: ['1'],
      crs: 'EPSG:5514',
    });
    expect(parseCapabilities(caps, { leaves: true }).layers).toEqual(['1', '2', '4', '5']);
  });

  it('falls back to ESRI:102067 when the service lists S-JTSK only that way', () => {
    const esri = caps.replace('EPSG:5514', 'EPSG:102067');
    expect(parseCapabilities(esri, {}).crs).toBe('EPSG:102067');
  });

  it('builds a WMS 1.3.0 GetMap in S-JTSK with east/north axis order', () => {
    const box = { minX: -460100, minY: -1240080, maxX: -459900, maxY: -1239980 };
    const size = imageSize(box);
    expect(size).toEqual({ width: 2048, height: 1024 });
    const url = getMapUrl(BASEMAPS.ortofoto, ['1'], 'EPSG:5514', box, size);
    expect(url).toContain('REQUEST=GetMap');
    expect(url).toContain('CRS=EPSG%3A5514');
    expect(url).toContain('BBOX=-460100.000,-1240080.000,-459900.000,-1239980.000');
    expect(url).toContain('WIDTH=2048&HEIGHT=1024');
    expect(url).toContain('FORMAT=image%2Fjpeg');
  });

  it('keeps the long side at 2048 px for a tall area', () => {
    expect(imageSize({ minX: 0, minY: 0, maxX: 10, maxY: 1000 })).toEqual({
      width: 64,
      height: 2048,
    });
  });
});
