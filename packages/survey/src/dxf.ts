import type { SurveyIssue } from './issues.ts';

/**
 * Čítačka ASCII DXF pre meračku (ADR 0021): hlavička (`$ACADVER`, `$DWGCODEPAGE`, `$INSUNITS`), tabuľka hladín
 * a entity modelového priestoru `POINT`, `TEXT`, `LINE`, `LWPOLYLINE`, `POLYLINE` / `VERTEX`, `INSERT` (len poloha).
 * Ostatné entity sa len spočítajú, bloky sa nerozkladajú. Súradnice sú vo WCS výkresu prepočítané na metre.
 */

/** Bod vo WCS výkresu [m]. */
export interface DxfPoint {
  x: number;
  y: number;
  z: number;
}

export interface DxfLayer {
  name: string;
  /** farba ACI bez znamienka */
  color: number;
  /** vypnutá (záporná farba) alebo zmrazená hladina */
  hidden: boolean;
}

export type DxfEntity =
  | { kind: 'point'; layer: string; at: DxfPoint }
  | {
      kind: 'text';
      layer: string;
      /** vkladací bod, pri zarovnanom texte bod zarovnania (kód 11) */
      at: DxfPoint;
      text: string;
      height: number;
      /** natočenie [rad] */
      rotation: number;
    }
  | {
      kind: 'line';
      layer: string;
      entity: 'LINE' | 'LWPOLYLINE' | 'POLYLINE';
      points: DxfPoint[];
      closed: boolean;
    }
  | { kind: 'insert'; layer: string; at: DxfPoint; block: string };

export interface DxfDrawing {
  /** `$ACADVER`, napr. AC1018 (AutoCAD 2004) */
  version: string | undefined;
  /** kódovanie textov (windows-1250, utf-8, …); undefined, ak text dekódoval volajúci */
  encoding: string | undefined;
  /** prepočet jednotiek výkresu (`$INSUNITS`) na metre */
  unitScale: number;
  /** hladiny v poradí tabuľky, za nimi hladiny použité entitami, ktoré v tabuľke chýbajú */
  layers: DxfLayer[];
  entities: DxfEntity[];
  /** preskočené entity modelového priestoru podľa typu (ELLIPSE, HATCH, MTEXT, mriežka POLYLINE, …) */
  skipped: Record<string, number>;
  /** oblúkové úseky polyline (bulge) nahradené priamkou */
  bulges: number;
}

export interface DxfResult {
  drawing: DxfDrawing | undefined;
  issues: SurveyIssue[];
}

interface Group {
  code: number;
  value: string;
}

interface DxfRecord {
  type: string;
  groups: Group[];
}

/** TextDecoder je v prehliadači, vo Web Workeri aj v Node; balík nemá typy DOM, preto lokálny typ. */
type Decoder = new (label: string) => { decode(input: Uint8Array): string };
const TextDecoderImpl = (globalThis as unknown as { TextDecoder: Decoder }).TextDecoder;

const BINARY_SENTINEL = 'AutoCAD Binary DXF';
/** hlavička s `$ACADVER` a `$DWGCODEPAGE` je na začiatku súboru */
const HEAD_BYTES = 65536;

/** `$INSUNITS` → metre: 4 mm, 5 cm, 6 m (0 = bez jednotiek → predpoklad m). */
const UNIT_SCALE: Record<number, number> = { 4: 0.001, 5: 0.01, 6: 1 };

/** Kódovanie podľa `$DWGCODEPAGE` (ANSI_1250 → windows-1250); neznáme ako AutoCAD predvolene windows-1252. */
export function codepageEncoding(page: string | undefined): string {
  const n = Number(/^ANSI_(\d+)$/i.exec(page?.trim() ?? '')?.[1] ?? 1252);
  if ((n >= 1250 && n <= 1258) || n === 874) return `windows-${n}`;
  return 'windows-1252';
}

const headerValue = (head: string, name: string, code: number) =>
  new RegExp(`\\${name}\\s*\\r?\\n\\s*${code}\\s*\\r?\\n([^\\r\\n]*)`).exec(head)?.[1]?.trim();

/** Kódovanie textov: DXF od AutoCADu 2007 (AC1021) je v UTF-8, staršie podľa `$DWGCODEPAGE`. */
export function detectEncoding(head: string): string {
  const version = headerValue(head, '$ACADVER', 1);
  if (version && /^AC\d{4}$/.test(version) && version >= 'AC1021') return 'utf-8';
  return codepageEncoding(headerValue(head, '$DWGCODEPAGE', 3));
}

/** Riadiace kódy textu: %%d °, %%p ±, %%c ⌀, %%% %, %%nnn znak, %%u / %%o sa vynechajú; \U+XXXX znak Unicode. */
export function decodeDxfText(s: string): string {
  return s
    .replace(/\\U\+([0-9a-fA-F]{4})/g, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    )
    .replace(/%%(\d{3}|[dpcuo%])/gi, (_, c: string) => {
      const k = c.toLowerCase();
      if (k === 'd') return '°';
      if (k === 'p') return '±';
      if (k === 'c') return '⌀';
      if (k === '%') return '%';
      if (k === 'u' || k === 'o') return '';
      return String.fromCharCode(Number(k));
    });
}

function readRecords(text: string): DxfRecord[] | SurveyIssue {
  const lines = text.split(/\r\n|\r|\n/);
  const records: DxfRecord[] = [];
  let current: DxfRecord | undefined;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const codeText = (lines[i] ?? '').trim();
    const value = lines[i + 1] ?? '';
    const code = Number(codeText);
    if (codeText === '' || !Number.isInteger(code))
      return {
        severity: 'error',
        code: 'MalformedDxf',
        line: i + 1,
        detail: `group code "${codeText}"`,
      };
    if (code === 0) {
      if (value.trim() === 'EOF') break;
      current = { type: value.trim(), groups: [] };
      records.push(current);
    } else current?.groups.push({ code, value });
  }
  return records;
}

const group = (r: DxfRecord, code: number) => r.groups.find((g) => g.code === code);
const str = (r: DxfRecord, code: number) => group(r, code)?.value.trim();
function num(r: DxfRecord, code: number, fallback = 0): number {
  const g = group(r, code);
  const v = g ? Number(g.value.trim()) : Number.NaN;
  return Number.isFinite(v) ? v : fallback;
}

/** Hodnoty premenných hlavičky (`9 $MENO`, za ním skupiny hodnoty). */
function headerVariables(section: DxfRecord): Map<string, Group[]> {
  const vars = new Map<string, Group[]>();
  let current: Group[] | undefined;
  for (const g of section.groups) {
    if (g.code === 9) {
      current = [];
      vars.set(g.value.trim(), current);
    } else current?.push(g);
  }
  return vars;
}

/**
 * Prevod z OCS (súradnicový systém objektu, normála `n`) do WCS — „arbitrary axis algorithm“ z referencie DXF.
 * Pri normále (0, 0, 1) je prevod identita.
 */
function ocsToWcs(n: DxfPoint): (p: DxfPoint) => DxfPoint {
  const len = Math.hypot(n.x, n.y, n.z);
  if (len === 0 || (n.x === 0 && n.y === 0 && n.z > 0)) return (p) => p;
  const N = { x: n.x / len, y: n.y / len, z: n.z / len };
  const limit = 1 / 64;
  // Ax = Wy × N, alebo Wz × N
  let ax =
    Math.abs(N.x) < limit && Math.abs(N.y) < limit
      ? { x: N.z, y: 0, z: -N.x }
      : { x: -N.y, y: N.x, z: 0 };
  const al = Math.hypot(ax.x, ax.y, ax.z);
  ax = { x: ax.x / al, y: ax.y / al, z: ax.z / al };
  // Ay = N × Ax
  const ay = {
    x: N.y * ax.z - N.z * ax.y,
    y: N.z * ax.x - N.x * ax.z,
    z: N.x * ax.y - N.y * ax.x,
  };
  return (p) => ({
    x: p.x * ax.x + p.y * ay.x + p.z * N.x,
    y: p.x * ax.y + p.y * ay.y + p.z * N.y,
    z: p.x * ax.z + p.y * ay.z + p.z * N.z,
  });
}

const extrusion = (r: DxfRecord): DxfPoint => ({
  x: num(r, 210),
  y: num(r, 220),
  z: num(r, 230, 1),
});

const pointAt = (r: DxfRecord, code: number): DxfPoint => ({
  x: num(r, code),
  y: num(r, code + 10),
  z: num(r, code + 20),
});

/** POLYLINE: 3D sieť (16) a mnohostenová sieť (64) sa preskočia; 8 = 3D polyline vo WCS. */
const POLYLINE_MESH = 16 | 64;
const POLYLINE_3D = 8;
/** VERTEX: riadiaci bod splajnu sa vynechá */
const VERTEX_SPLINE_FRAME = 16;

/**
 * Načíta ASCII DXF zo súboru (bajty, kódovanie podľa hlavičky) alebo z už dekódovaného textu.
 * Binárny DXF a nepodporované jednotky sú chyba; bez jednotiek sa predpokladajú metre.
 */
export function parseDxf(input: Uint8Array | string): DxfResult {
  let text: string;
  let encoding: string | undefined;
  if (typeof input === 'string') text = input;
  else {
    const head = new TextDecoderImpl('windows-1252').decode(input.subarray(0, HEAD_BYTES));
    if (head.startsWith(BINARY_SENTINEL))
      return { drawing: undefined, issues: [{ severity: 'error', code: 'BinaryDxf' }] };
    encoding = detectEncoding(head);
    text = new TextDecoderImpl(encoding).decode(input);
  }
  if (text.startsWith(BINARY_SENTINEL))
    return { drawing: undefined, issues: [{ severity: 'error', code: 'BinaryDxf' }] };

  const records = readRecords(text);
  if (!Array.isArray(records)) return { drawing: undefined, issues: [records] };

  const issues: SurveyIssue[] = [];
  let version: string | undefined;
  let units = 0;
  const layers: DxfLayer[] = [];
  const entityRecords: DxfRecord[] = [];
  let section: string | undefined;
  for (const r of records) {
    if (r.type === 'SECTION') {
      section = str(r, 2);
      if (section === 'HEADER') {
        const vars = headerVariables(r);
        version = vars
          .get('$ACADVER')
          ?.find((g) => g.code === 1)
          ?.value.trim();
        const u = Number(
          vars
            .get('$INSUNITS')
            ?.find((g) => g.code === 70)
            ?.value.trim() ?? 0,
        );
        units = Number.isFinite(u) ? u : 0;
      }
    } else if (r.type === 'ENDSEC') section = undefined;
    else if (section === 'TABLES' && r.type === 'LAYER') {
      const color = num(r, 62, 7);
      layers.push({
        name: str(r, 2) ?? '0',
        color: Math.abs(color),
        hidden: color < 0 || (num(r, 70) & 1) === 1,
      });
    } else if (section === 'ENTITIES') entityRecords.push(r);
  }

  let unitScale = 1;
  if (units === 0) issues.push({ severity: 'warning', code: 'UnitsAssumed' });
  else {
    const scale = UNIT_SCALE[units];
    if (scale === undefined) {
      issues.push({ severity: 'error', code: 'UnsupportedUnits', units });
      return { drawing: undefined, issues };
    }
    unitScale = scale;
  }
  const scaled = (p: DxfPoint): DxfPoint => ({
    x: p.x * unitScale,
    y: p.y * unitScale,
    z: p.z * unitScale,
  });

  const entities: DxfEntity[] = [];
  const skipped: Record<string, number> = {};
  const skip = (type: string) => {
    skipped[type] = (skipped[type] ?? 0) + 1;
  };
  let bulges = 0;

  for (let i = 0; i < entityRecords.length; i++) {
    const r = entityRecords[i] as DxfRecord;
    // VERTEX a SEQEND bez POLYLINE (alebo za preskočenou sieťou) sa ignorujú
    if (r.type === 'VERTEX' || r.type === 'SEQEND') continue;
    // papierový priestor (výkresové listy, výrezy) nie je meračka
    if (str(r, 67) === '1') continue;
    const layer = str(r, 8) ?? '0';
    switch (r.type) {
      case 'POINT':
        entities.push({ kind: 'point', layer, at: scaled(pointAt(r, 10)) });
        break;
      case 'LINE':
        entities.push({
          kind: 'line',
          layer,
          entity: 'LINE',
          points: [scaled(pointAt(r, 10)), scaled(pointAt(r, 11))],
          closed: false,
        });
        break;
      case 'TEXT': {
        const toWcs = ocsToWcs(extrusion(r));
        const h = num(r, 72);
        const v = num(r, 73);
        // bod zarovnania platí pri zarovnaní iným než vľavo na základnej čiare; „aligned“ a „fit“ sú od bodu 10
        const aligned = (h === 0 && v === 0) || ((h === 3 || h === 5) && v === 0);
        const at = !aligned && group(r, 11) ? pointAt(r, 11) : pointAt(r, 10);
        entities.push({
          kind: 'text',
          layer,
          at: scaled(toWcs(at)),
          text: decodeDxfText(group(r, 1)?.value ?? ''),
          height: num(r, 40) * unitScale,
          rotation: (num(r, 50) * Math.PI) / 180,
        });
        break;
      }
      case 'LWPOLYLINE': {
        const toWcs = ocsToWcs(extrusion(r));
        const z = num(r, 38);
        const points: DxfPoint[] = [];
        for (const g of r.groups) {
          if (g.code === 10) points.push({ x: Number(g.value.trim()), y: 0, z });
          else if (g.code === 20) {
            const last = points.at(-1);
            if (last) last.y = Number(g.value.trim());
          } else if (g.code === 42 && Number(g.value.trim()) !== 0) bulges++;
        }
        entities.push({
          kind: 'line',
          layer,
          entity: 'LWPOLYLINE',
          points: points.map((p) => scaled(toWcs(p))),
          closed: (num(r, 70) & 1) === 1,
        });
        break;
      }
      case 'POLYLINE': {
        const flags = num(r, 70);
        const vertices: DxfRecord[] = [];
        while (entityRecords[i + 1]?.type === 'VERTEX') {
          i++;
          vertices.push(entityRecords[i] as DxfRecord);
        }
        if (flags & POLYLINE_MESH) {
          skip('POLYLINE');
          break;
        }
        const is3d = (flags & POLYLINE_3D) !== 0;
        const toWcs = is3d ? (p: DxfPoint) => p : ocsToWcs(extrusion(r));
        const elevation = num(r, 30);
        const points: DxfPoint[] = [];
        for (const vx of vertices) {
          if (num(vx, 70) & VERTEX_SPLINE_FRAME) continue;
          if (num(vx, 42) !== 0) bulges++;
          const p = pointAt(vx, 10);
          points.push(scaled(toWcs(is3d ? p : { ...p, z: elevation })));
        }
        entities.push({
          kind: 'line',
          layer,
          entity: 'POLYLINE',
          points,
          closed: (flags & 1) === 1,
        });
        break;
      }
      case 'INSERT':
        entities.push({
          kind: 'insert',
          layer,
          at: scaled(ocsToWcs(extrusion(r))(pointAt(r, 10))),
          block: str(r, 2) ?? '',
        });
        break;
      default:
        skip(r.type);
    }
  }

  const known = new Set(layers.map((l) => l.name));
  for (const e of entities)
    if (!known.has(e.layer)) {
      known.add(e.layer);
      layers.push({ name: e.layer, color: 7, hidden: false });
    }
  if (entities.length === 0) issues.push({ severity: 'error', code: 'NoEntities' });
  return {
    drawing: { version, encoding, unitScale, layers, entities, skipped, bulges },
    issues,
  };
}
