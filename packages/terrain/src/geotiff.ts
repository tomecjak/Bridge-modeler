import { fromArrayBuffer } from 'geotiff';
import type { Raster } from './corridor.ts';
import type { TerrainIssue } from './issues.ts';
import type { Bounds2 } from './tin.ts';

/** Kódy CRS, ktoré sa berú ako EPSG:5514 (ADR 0011: JTSK03 = JTSK). */
const ACCEPTED_EPSG = new Set([5514, 8353]);

/**
 * Načíta raster výšok z GeoTIFF (DMR 5.0, ADR 0011) cez geotiff.js. Číta sa len okno pokrývajúce `bounds`
 * (EPSG:5514); výsledok má riadky od juhu na sever a súradnice stredov buniek. Nič nevyhadzuje.
 */
export async function readGeoTiff(
  buffer: ArrayBuffer,
  bounds?: Bounds2,
): Promise<{ raster?: Raster; issues: TerrainIssue[] }> {
  const fail = (issue: TerrainIssue) => ({ issues: [issue] });
  try {
    const image = await (await fromArrayBuffer(buffer)).getImage();
    const keys = image.getGeoKeys() ?? {};
    const epsg = Number(keys.ProjectedCSTypeGeoKey);
    if (Number.isFinite(epsg) && epsg !== 32767 && !ACCEPTED_EPSG.has(epsg)) {
      return fail({ severity: 'error', code: 'UnsupportedCrs', epsg });
    }
    const [ox, oy] = image.getOrigin() as [number, number];
    const [rx, ry] = image.getResolution() as [number, number];
    const width = image.getWidth();
    const height = image.getHeight();
    // PixelIsArea (predvolené): pôvod je roh bunky; PixelIsPoint: pôvod je stred bunky
    const half = Number(keys.GTRasterTypeGeoKey) === 2 ? 0 : 0.5;
    const cx = (col: number) => ox + (col + half) * rx;
    const cy = (row: number) => oy + (row + half) * ry;
    if (!(cx(0) < 0 && cy(0) < 0)) {
      return fail({ severity: 'error', code: 'CoordinateSystemMismatch', x: cx(0), y: cy(0) });
    }

    let [col0, row0, col1, row1] = [0, 0, width, height];
    if (bounds) {
      const cols = [(bounds.minX - ox) / rx, (bounds.maxX - ox) / rx];
      const rows = [(bounds.minY - oy) / ry, (bounds.maxY - oy) / ry];
      col0 = Math.max(0, Math.floor(Math.min(...cols)));
      col1 = Math.min(width, Math.ceil(Math.max(...cols)));
      row0 = Math.max(0, Math.floor(Math.min(...rows)));
      row1 = Math.min(height, Math.ceil(Math.max(...rows)));
      if (col1 <= col0 || row1 <= row0) return fail({ severity: 'error', code: 'OutsideCorridor' });
    }
    const data = (await image.readRasters({
      window: [col0, row0, col1, row1],
      samples: [0],
      interleave: true,
    })) as ArrayLike<number>;
    const w = col1 - col0;
    const h = row1 - row0;
    // riadky v súbore idú zvyčajne od severu (ry < 0) → otočiť, aby riadok 0 bol najjužnejší
    const southFirst = ry > 0;
    const z = new Float64Array(w * h);
    for (let r = 0; r < h; r++) {
      const src = southFirst ? r : h - 1 - r;
      for (let c = 0; c < w; c++) z[r * w + c] = data[src * w + c] as number;
    }
    const nodata = image.getGDALNoData();
    return {
      raster: {
        x0: cx(col0),
        y0: cy(southFirst ? row0 : row1 - 1),
        dx: Math.abs(rx),
        dy: Math.abs(ry),
        width: w,
        height: h,
        z,
        nodata: nodata ?? undefined,
      },
      issues: [],
    };
  } catch (e) {
    return fail({
      severity: 'error',
      code: 'InvalidGeoTiff',
      detail: e instanceof Error ? e.message : String(e),
    });
  }
}
