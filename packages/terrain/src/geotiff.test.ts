import { writeArrayBuffer } from 'geotiff';
import { describe, expect, it } from 'vitest';
import { readGeoTiff } from './geotiff.ts';

/** GeoTIFF 6 × 4 buniek po 1 m, ľavý horný roh (-500000, -1200000), výška = 300 + stĺpec + 10 · riadok zhora. */
function tiff(options: { epsg?: number; x?: number; y?: number; nodata?: boolean } = {}) {
  const width = 6;
  const height = 4;
  const values = Array.from({ length: width * height }, (_, k) => {
    const row = Math.floor(k / width);
    const col = k % width;
    return options.nodata && row === 0 && col === 0 ? -9999 : 300 + col + 10 * row;
  });
  // DMR je float32
  return writeArrayBuffer(Float32Array.from(values), {
    width,
    height,
    ModelPixelScale: [1, 1, 0],
    ModelTiepoint: [0, 0, 0, options.x ?? -500000, options.y ?? -1200000, 0],
    BitsPerSample: [32],
    SampleFormat: [3],
    GTModelTypeGeoKey: 1,
    GTRasterTypeGeoKey: 1,
    ProjectedCSTypeGeoKey: options.epsg ?? 5514,
    ...(options.nodata ? { GDAL_NODATA: '-9999' } : {}),
  });
}

describe('readGeoTiff', () => {
  it('reads cell centres with rows from south to north', async () => {
    const { raster, issues } = await readGeoTiff(tiff());
    expect(issues).toEqual([]);
    expect(raster?.width).toBe(6);
    expect(raster?.height).toBe(4);
    expect(raster?.x0).toBe(-499999.5);
    // najjužnejší riadok (v súbore posledný) má stred 3,5 m pod horným okrajom
    expect(raster?.y0).toBe(-1200003.5);
    expect(raster?.dx).toBe(1);
    expect(raster?.dy).toBe(1);
    expect(raster?.z[0]).toBe(330);
    expect(raster?.z[3 * 6 + 5]).toBe(305);
  });

  it('reads only the window covering the bounds', async () => {
    const { raster } = await readGeoTiff(tiff(), {
      minX: -499997.8,
      minY: -1200002.2,
      maxX: -499996.2,
      maxY: -1200001.1,
    });
    expect(raster?.width).toBe(2);
    expect(raster?.height).toBe(2);
    expect(raster?.x0).toBe(-499997.5);
    expect(raster?.y0).toBe(-1200002.5);
    expect(raster?.z[0]).toBe(322);
  });

  it('passes the GDAL nodata value and accepts JTSK03', async () => {
    const { raster, issues } = await readGeoTiff(tiff({ nodata: true, epsg: 8353 }));
    expect(issues).toEqual([]);
    expect(raster?.nodata).toBe(-9999);
  });

  it('reports typed errors for other CRS, positive coordinates, empty windows and broken files', async () => {
    expect((await readGeoTiff(tiff({ epsg: 32634 }))).issues[0]).toMatchObject({
      code: 'UnsupportedCrs',
      epsg: 32634,
    });
    expect((await readGeoTiff(tiff({ x: 500000, y: 1200000 }))).issues[0]?.code).toBe(
      'CoordinateSystemMismatch',
    );
    expect(
      (await readGeoTiff(tiff(), { minX: 0, minY: 0, maxX: 1, maxY: 1 })).issues[0]?.code,
    ).toBe('OutsideCorridor');
    expect((await readGeoTiff(new ArrayBuffer(16))).issues[0]?.code).toBe('InvalidGeoTiff');
  });
});
