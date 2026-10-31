import { describe, expect, it } from 'vitest';
import { downloadDmr, type FetchLike, ZBGIS_DMR_URL } from './zbgis.ts';

/** Telo formulára (bez DOM typov) → mapa parametrov. */
function form(body: string): Map<string, string> {
  return new Map(
    body.split('&').map((kv) => {
      const [k, v] = kv.split('=') as [string, string];
      return [k, decodeURIComponent(v ?? '')];
    }),
  );
}

const height = (x: number, y: number) => 300 + 0.01 * (x + 500000) - 0.02 * (y + 1200000);

interface ServerOptions {
  /** bod bez dát (služba pri ňom dávku ukončí) */
  noData?: (x: number, y: number) => boolean;
  /** polygóny pokrytia; `null` = query zlyhá */
  cover?: number[][][] | null;
  fail?: boolean;
}

/** Falošná služba ZBGIS: `identify` vráti výšky v poradí bodov a skončí pri prvom bode bez dát. */
function server(options: ServerOptions = {}) {
  const calls = { identify: [] as number[], active: 0, maxActive: 0 };
  const fetch: FetchLike = async (url, init) => {
    if (url.includes('/0/query')) {
      if (options.cover === null) return { ok: false, status: 500, json: async () => ({}) };
      const rings = options.cover ?? [
        [
          [-501000, -1201000],
          [-499000, -1201000],
          [-499000, -1199000],
          [-501000, -1199000],
          [-501000, -1201000],
        ],
      ];
      return { ok: true, status: 200, json: async () => ({ features: [{ geometry: { rings } }] }) };
    }
    expect(url).toBe(`${ZBGIS_DMR_URL}/identify`);
    expect(init?.method).toBe('POST');
    calls.active++;
    calls.maxActive = Math.max(calls.maxActive, calls.active);
    await Promise.resolve(); // ostatné dávky sa medzitým rozbehnú
    calls.active--;
    if (options.fail) return { ok: false, status: 503, json: async () => ({}) };
    const params = form(init?.body ?? '');
    expect(params.get('geometryType')).toBe('esriGeometryMultipoint');
    expect(params.get('layers')).toBe('all:3');
    const pts = (JSON.parse(params.get('geometry') ?? '{}') as { points: [number, number][] })
      .points;
    calls.identify.push(pts.length);
    const results: { geometry: { x: number; y: number }; attributes: Record<string, string> }[] =
      [];
    for (const [x, y] of pts) {
      if (options.noData?.(x, y)) break;
      results.push({
        geometry: { x: x + 1e-9, y: y - 1e-9 },
        attributes: { 'Stretch.Pixel Value': height(x, y).toFixed(6) },
      });
    }
    return { ok: true, status: 200, json: async () => ({ results }) };
  };
  return { fetch, calls };
}

const bounds = { minX: -500050.3, minY: -1200030.7, maxX: -499950.2, maxY: -1199970.1 };
const everywhere = () => true;

describe('downloadDmr', () => {
  it('samples cell centres of the DMR grid in batches of at most 2000 points, 4 at a time', async () => {
    const { fetch, calls } = server();
    const progress: number[] = [];
    const { raster, issues } = await downloadDmr(bounds, everywhere, {
      fetch,
      onProgress: (done) => progress.push(done),
    });
    expect(issues).toEqual([]);
    expect(raster?.x0).toBe(-500050.5);
    expect(raster?.y0).toBe(-1200030.5);
    expect(raster?.dx).toBe(1);
    const w = raster?.width ?? 0;
    const h = raster?.height ?? 0;
    expect(w * h).toBe(calls.identify.reduce((a, b) => a + b, 0));
    expect(Math.max(...calls.identify)).toBeLessThanOrEqual(2000);
    expect(calls.maxActive).toBeLessThanOrEqual(4);
    expect(calls.maxActive).toBeGreaterThan(1);
    expect(progress.at(-1)).toBe(w * h);
    const z = raster?.z ?? [];
    expect(z[0]).toBeCloseTo(height(-500050.5, -1200030.5), 5);
    expect(z[w * h - 1]).toBeCloseTo(height(-500050.5 + (w - 1), -1200030.5 + (h - 1)), 5);
  });

  it('continues after a point without data and leaves it empty', async () => {
    const hole = (x: number, y: number) => x === -500000.5 && y === -1200000.5;
    const { fetch } = server({ noData: hole });
    const { raster } = await downloadDmr(bounds, everywhere, { fetch });
    const r = raster as NonNullable<typeof raster>;
    const at = (x: number, y: number) => r.z[(y - r.y0) * r.width + (x - r.x0)] as number;
    expect(at(-500000.5, -1200000.5)).toBeNaN();
    expect(at(-499999.5, -1200000.5)).toBeCloseTo(height(-499999.5, -1200000.5), 5);
    expect(Array.from(r.z).filter((v) => Number.isNaN(v))).toHaveLength(1);
  });

  it('sends only points in the corridor and inside the coverage', async () => {
    const cover = [
      [
        [-500000, -1201000],
        [-499000, -1201000],
        [-499000, -1199000],
        [-500000, -1199000],
        [-500000, -1201000],
      ],
    ];
    const { fetch, calls } = server({ cover });
    const strip = (_x: number, y: number) => Math.abs(y + 1200000) < 5;
    const { raster } = await downloadDmr(bounds, strip, { fetch });
    const sent = calls.identify.reduce((a, b) => a + b, 0);
    // pás 10 m (riadky −1 200 004,5 … −1 199 995,5) × východná polovica (x > −500 000)
    expect(sent).toBe(10 * 50);
    expect(Array.from(raster?.z ?? []).filter((v) => Number.isFinite(v))).toHaveLength(sent);
  });

  it('coarsens the grid above the point limit', async () => {
    const { fetch } = server({ cover: null });
    const { raster } = await downloadDmr(bounds, everywhere, { fetch, maxPoints: 2000 });
    expect(raster?.dx).toBe(2);
    expect((raster?.width ?? 0) * (raster?.height ?? 0)).toBeLessThanOrEqual(2000);
  });

  it('reports typed problems: outside coverage, service failure, cancellation', async () => {
    expect((await downloadDmr(bounds, everywhere, server({ cover: [] }))).issues[0]?.code).toBe(
      'OutsideCoverage',
    );
    expect((await downloadDmr(bounds, everywhere, server({ fail: true }))).issues[0]).toMatchObject(
      {
        code: 'ServiceUnavailable',
        detail: 'HTTP 503',
      },
    );
    expect(
      (await downloadDmr(bounds, everywhere, { ...server(), isCancelled: () => true })).issues[0]
        ?.code,
    ).toBe('Cancelled');
    expect(
      (await downloadDmr(bounds, everywhere, server({ noData: () => true }))).issues[0]?.code,
    ).toBe('NoData');
  });
});
