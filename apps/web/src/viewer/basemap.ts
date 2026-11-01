import { childNamed, parseXml, type XmlNode } from '@bridge/alignment';

/** Mapový podklad na teréne (ADR 0011, doplnok) — ako v Mini-IFC-tools (tomecjak). */
export type BasemapKind = 'none' | 'ortofoto' | 'mapa';

/** Poradie volieb podkladu vo výberoch (3D aj pôdorys). */
export const BASEMAP_KINDS: readonly BasemapKind[] = ['none', 'ortofoto', 'mapa'];

export interface BasemapSource {
  label: string;
  attribution: string;
  url: string;
  format: 'image/jpeg' | 'image/png';
  /** len vrstvy s týmto titulom (ortofoto bez obrysov snímok) */
  pick?: string;
  /** všetky koncové vrstvy v poradí služby (mapa ZBGIS má obsah v ~150 vrstvách) */
  leaves?: boolean;
}

export const BASEMAPS: Record<Exclude<BasemapKind, 'none'>, BasemapSource> = {
  ortofoto: {
    label: 'Ortofotomozaika ZBGIS',
    attribution: '© GKÚ Bratislava, NLC',
    url: 'https://zbgisws.skgeodesy.sk/zbgis_ortofoto_wms/service.svc/get',
    format: 'image/jpeg',
    pick: 'Ortofoto',
  },
  mapa: {
    label: 'Mapa ZBGIS',
    attribution: '© GKÚ Bratislava',
    url: 'https://zbgisws.skgeodesy.sk/zbgis_wms_featureinfo/service.svc/get',
    format: 'image/png',
    leaves: true,
  },
};

/** Najdlhšia strana obrázka mapy [px]. */
export const MAX_IMAGE = 2048;

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Rozmery obrázka pre obálku: dlhšia strana `max` px, kratšia úmerne (aspoň 64 px). */
export function imageSize(b: Box, max = MAX_IMAGE): { width: number; height: number } {
  const dx = b.maxX - b.minX;
  const dy = b.maxY - b.minY;
  return dx >= dy
    ? { width: max, height: Math.max(64, Math.round((max * dy) / dx)) }
    : { width: Math.max(64, Math.round((max * dx) / dy)), height: max };
}

/** WMS 1.3.0 GetMap v S-JTSK — EPSG:5514 má poradie osí východ, sever: BBOX = minE, minN, maxE, maxN. */
export function getMapUrl(
  src: BasemapSource,
  layers: readonly string[],
  crs: string,
  b: Box,
  size: { width: number; height: number },
): string {
  const q = [
    'SERVICE=WMS',
    'VERSION=1.3.0',
    'REQUEST=GetMap',
    'STYLES=',
    'TRANSPARENT=FALSE',
    `LAYERS=${encodeURIComponent(layers.join(','))}`,
    `CRS=${encodeURIComponent(crs)}`,
    `BBOX=${[b.minX, b.minY, b.maxX, b.maxY].map((v) => v.toFixed(3)).join(',')}`,
    `WIDTH=${size.width}`,
    `HEIGHT=${size.height}`,
    `FORMAT=${encodeURIComponent(src.format)}`,
  ];
  return `${src.url}${src.url.includes('?') ? '&' : '?'}${q.join('&')}`;
}

export const capabilitiesUrl = (src: BasemapSource) =>
  `${src.url}${src.url.includes('?') ? '&' : '?'}SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0`;

const text = (n: XmlNode | undefined) => n?.text.trim() ?? '';
const layersOf = (n: XmlNode) => n.children.filter((c) => c.name === 'Layer');

/**
 * Z GetCapabilities: mená vrstiev na najvyššej úrovni, kde nejaké sú (nepomenované skupiny sa prechádzajú do hĺbky),
 * s voľbami `pick` / `leaves`, a CRS — EPSG:5514, ak ho služba uvádza, inak ESRI:102067.
 */
export function parseCapabilities(
  xml: string,
  src: Pick<BasemapSource, 'pick' | 'leaves'>,
): { layers: string[]; crs: string } {
  const root = parseXml(xml).find((n) => n.name === 'WMS_Capabilities');
  const capability = root && childNamed(root, 'Capability');
  const top = capability && childNamed(capability, 'Layer');
  const layers: string[] = [];
  const crs: string[] = [];
  const walk = (l: XmlNode) => {
    for (const c of l.children) if (c.name === 'CRS') crs.push(text(c));
    const name = text(childNamed(l, 'Name'));
    const kids = layersOf(l);
    if (name && !(src.leaves && kids.length > 0)) {
      if (!src.pick || text(childNamed(l, 'Title')) === src.pick) layers.push(name);
      return;
    }
    if (src.leaves) {
      kids.forEach(walk);
      return;
    }
    const before = layers.length;
    for (const k of kids) if (text(childNamed(k, 'Name'))) walk(k);
    if (layers.length === before) for (const k of kids) if (!text(childNamed(k, 'Name'))) walk(k);
  };
  if (top) walk(top);
  const code =
    crs.includes('EPSG:5514') || crs.length === 0
      ? 'EPSG:5514'
      : crs.includes('EPSG:102067')
        ? 'EPSG:102067'
        : 'EPSG:5514';
  return { layers, crs: code };
}

const capabilities = new Map<string, Promise<{ layers: string[]; crs: string }>>();

/** Vrstvy služby (GetCapabilities sa pýta raz za reláciu). */
function serviceLayers(src: BasemapSource) {
  let p = capabilities.get(src.url);
  if (!p) {
    p = fetch(capabilitiesUrl(src))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((xml) => {
        const caps = parseCapabilities(xml, src);
        if (caps.layers.length === 0) throw new Error('služba neuvádza vrstvy');
        return caps;
      });
    capabilities.set(src.url, p);
    p.catch(() => capabilities.delete(src.url));
  }
  return p;
}

/** Adresa obrázka mapy pre obálku v EPSG:5514 s rozmermi `size` (výrez pôdorysu, obálka terénu v 3D). */
export async function basemapUrl(
  src: BasemapSource,
  b: Box,
  size: { width: number; height: number },
): Promise<string> {
  const caps = await serviceLayers(src);
  return getMapUrl(src, caps.layers, caps.crs, b, size);
}

/** Načíta obrázok mapy; `cors` treba len pre textúru vo WebGL, obrázok v SVG ho nepotrebuje. */
export function loadImage(url: string, cors: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (cors) image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('obrázok mapy sa nenačítal'));
    image.src = url;
  });
}

/** Obrázok mapy pre obálku v EPSG:5514 (CORS — bez neho by sa nedal použiť ako textúra). */
export async function loadBasemap(src: BasemapSource, b: Box): Promise<HTMLImageElement> {
  return loadImage(await basemapUrl(src, b, imageSize(b)), true);
}
