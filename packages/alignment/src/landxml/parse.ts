import { normalizeAngle, sub2, type Vec2, vectorToAzimuth } from '@bridge/geom';
import type {
  AlignmentData,
  HorizontalElementData,
  PviData,
  Rotation,
  StationEquationData,
  SuperelevationData,
  VerticalProfileData,
} from '../data.ts';
import type { AlignmentIssue } from '../issues.ts';
import { childNamed, childrenNamed, parseXml, type XmlNode } from './xml.ts';

export interface LandXmlResult {
  alignments: AlignmentData[];
  issues: AlignmentIssue[];
}

/** LandXML smer (od +E proti smeru hodín) → smerník (od +N v smere hodín), ADR 0003. */
export const landXmlDirectionToAzimuth = (direction: number): number =>
  normalizeAngle(Math.PI / 2 - direction);

type AngleUnit = (value: number) => number;

const ANGLE_UNITS: Record<string, AngleUnit> = {
  'decimal degrees': (v) => (v * Math.PI) / 180,
  radians: (v) => v,
  grads: (v) => (v * Math.PI) / 200,
};

/** Zberač problémov pre jednu os; `failed` = os sa nedá použiť. */
class IssueSink {
  readonly issues: AlignmentIssue[] = [];
  private readonly alignment: string | undefined;
  constructor(alignment?: string) {
    this.alignment = alignment;
  }

  get failed(): boolean {
    return this.issues.some((i) => i.severity === 'error');
  }

  error(issue: DistributiveOmit<AlignmentIssue, 'severity' | 'alignment'>): undefined {
    this.issues.push({ ...issue, severity: 'error', ...this.scope() } as AlignmentIssue);
    return undefined;
  }

  warning(issue: DistributiveOmit<AlignmentIssue, 'severity' | 'alignment'>): void {
    this.issues.push({ ...issue, severity: 'warning', ...this.scope() } as AlignmentIssue);
  }

  private scope() {
    return this.alignment === undefined ? {} : { alignment: this.alignment };
  }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

interface Context {
  sink: IssueSink;
  direction: AngleUnit;
}

/** Načíta osi a nivelety z LandXML 1.2. Vráti všetky použiteľné osi a všetky zistené problémy. */
export function parseLandXml(xml: string): LandXmlResult {
  const sink = new IssueSink();
  let roots: XmlNode[];
  try {
    roots = parseXml(xml);
  } catch (e) {
    sink.error({ code: 'InvalidXml', detail: e instanceof Error ? e.message : String(e) });
    return { alignments: [], issues: sink.issues };
  }
  const root = roots.find((n) => n.name === 'LandXML');
  if (!root) {
    sink.error({ code: 'InvalidXml', detail: 'missing <LandXML> root element' });
    return { alignments: [], issues: sink.issues };
  }

  const direction = readUnits(root, sink);
  const nodes = childrenNamed(root, 'Alignments').flatMap((a) => childrenNamed(a, 'Alignment'));
  if (nodes.length === 0) sink.error({ code: 'NoAlignments' });
  if (!direction || sink.failed) return { alignments: [], issues: sink.issues };

  const alignments: AlignmentData[] = [];
  const issues = [...sink.issues];
  for (const node of nodes) {
    const alignmentSink = new IssueSink(node.attributes.name ?? '');
    const data = readAlignment(node, { sink: alignmentSink, direction });
    issues.push(...alignmentSink.issues);
    if (data && !alignmentSink.failed) alignments.push(data);
  }
  return { alignments, issues };
}

function readUnits(root: XmlNode, sink: IssueSink): AngleUnit | undefined {
  const units = childNamed(root, 'Units');
  const system = units?.children[0];
  if (!system) {
    sink.warning({ code: 'MissingUnits' });
    return ANGLE_UNITS['decimal degrees'];
  }
  const linear = system.attributes.linearUnit ?? '';
  if (system.name !== 'Metric' || linear !== 'meter') {
    return sink.error({ code: 'UnsupportedUnit', quantity: 'linear', unit: linear || system.name });
  }
  const directionUnit = system.attributes.directionUnit ?? 'decimal degrees';
  const direction = ANGLE_UNITS[directionUnit];
  if (!direction) {
    return sink.error({ code: 'UnsupportedUnit', quantity: 'direction', unit: directionUnit });
  }
  return direction;
}

function readAlignment(node: XmlNode, ctx: Context): AlignmentData | undefined {
  const name = node.attributes.name ?? '';
  const staStart = optionalNumber(node, 'staStart', ctx) ?? 0;
  const coordGeom = childNamed(node, 'CoordGeom');
  const horizontal = coordGeom ? readCoordGeom(coordGeom, ctx) : [];
  if (horizontal.length === 0 && !ctx.sink.failed) {
    ctx.sink.error({ code: 'InvalidValue', element: 'Alignment', field: 'CoordGeom', value: '' });
  }
  if (ctx.sink.failed) return undefined;
  if (!checkCoordinateSystem(horizontal, ctx)) return undefined;

  const declaredLength = optionalNumber(node, 'length', ctx);
  const length = declaredLength ?? horizontal.reduce((sum, e) => sum + e.length, 0);
  const stationEquations = childrenNamed(node, 'StaEquation')
    .map((eq) => readStationEquation(eq, ctx))
    .filter((eq): eq is StationEquationData => eq !== undefined)
    .sort((a, b) => a.staInternal - b.staInternal);
  const profiles = childrenNamed(node, 'Profile')
    .flatMap((p) => childrenNamed(p, 'ProfAlign'))
    .map((p) => readProfAlign(p, ctx))
    .filter((p): p is VerticalProfileData => p !== undefined);
  const superelevation = childrenNamed(node, 'Superelevation').flatMap((s) => {
    const r = readSuperelevation(s, ctx);
    return r ? [r] : [];
  });
  if (ctx.sink.failed) return undefined;
  return {
    name,
    staStart,
    length,
    horizontal,
    stationEquations,
    profiles,
    ...(superelevation.length > 0 ? { superelevation } : {}),
  };
}

/** Prvky klopenia LandXML 1.2 → polia `SuperelevationData` (ADR 0022). */
const SUPERELEVATION_FIELDS = {
  BeginRunoutSta: 'beginRunout',
  BeginRunoffSta: 'beginRunoff',
  FullSuperSta: 'fullSuper',
  FullSuperelev: 'fullSuperelev',
  RunoffSta: 'runoff',
  StartofRunoutSta: 'startOfRunout',
  EndofRunoutSta: 'endOfRunout',
} as const;

/**
 * Klopenie oblúka. Klopenie os nepokazí: neplatné číslo je upozornenie a pole sa vynechá, bez rozsahu
 * (staStart, staEnd) sa vynechá celý prvok.
 */
function readSuperelevation(node: XmlNode, ctx: Context): SuperelevationData | undefined {
  const number = (field: string, raw: string | undefined) => {
    const value = raw === undefined ? undefined : parseNumber(raw);
    if (value === undefined && raw !== undefined)
      ctx.sink.warning({ code: 'InvalidValue', element: 'Superelevation', field, value: raw });
    return value;
  };
  const staStart = number('staStart', node.attributes.staStart);
  const staEnd = number('staEnd', node.attributes.staEnd);
  if (staStart === undefined || staEnd === undefined) {
    if (node.attributes.staStart === undefined || node.attributes.staEnd === undefined)
      ctx.sink.warning({
        code: 'InvalidValue',
        element: 'Superelevation',
        field: 'staStart',
        value: '',
      });
    return undefined;
  }
  const data: SuperelevationData = { staStart, staEnd };
  for (const [element, field] of Object.entries(SUPERELEVATION_FIELDS)) {
    const value = number(element, childNamed(node, element)?.text);
    if (value !== undefined) data[field] = value;
  }
  return data;
}

function readCoordGeom(node: XmlNode, ctx: Context): HorizontalElementData[] {
  const elements: HorizontalElementData[] = [];
  node.children.forEach((child, index) => {
    const element = readHorizontalElement(child, index, ctx);
    if (element) elements.push(element);
  });
  return elements;
}

function readHorizontalElement(
  node: XmlNode,
  index: number,
  ctx: Context,
): HorizontalElementData | undefined {
  switch (node.name) {
    case 'Line':
      return readLine(node, ctx);
    case 'Curve':
      return readCurve(node, ctx);
    case 'Spiral':
      return readSpiral(node, index, ctx);
    default:
      return ctx.sink.error({ code: 'UnsupportedElement', element: node.name });
  }
}

function readLine(node: XmlNode, ctx: Context): HorizontalElementData | undefined {
  const start = requiredPoint(node, 'Start', ctx);
  const end = requiredPoint(node, 'End', ctx);
  const length = requiredNumber(node, 'length', ctx);
  if (!start || !end || length === undefined) return undefined;
  return { kind: 'line', length, start, end };
}

function readCurve(node: XmlNode, ctx: Context): HorizontalElementData | undefined {
  const crvType = node.attributes.crvType ?? 'arc';
  if (crvType !== 'arc')
    return ctx.sink.error({ code: 'UnsupportedElement', element: `Curve[${crvType}]` });
  const start = requiredPoint(node, 'Start', ctx);
  const end = requiredPoint(node, 'End', ctx);
  const center = requiredPoint(node, 'Center', ctx);
  const length = requiredNumber(node, 'length', ctx);
  const rotation = readRotation(node, ctx);
  if (!start || !end || !center || length === undefined || !rotation) return undefined;
  const radius =
    optionalNumber(node, 'radius', ctx) ?? Math.hypot(start.x - center.x, start.y - center.y);
  return { kind: 'arc', length, start, end, center, radius, rotation };
}

function readSpiral(node: XmlNode, index: number, ctx: Context): HorizontalElementData | undefined {
  const spiralType = node.attributes.spiType ?? 'clothoid';
  if (spiralType !== 'clothoid') {
    return ctx.sink.error({ code: 'UnsupportedSpiralType', spiralType, index });
  }
  const start = requiredPoint(node, 'Start', ctx);
  const end = requiredPoint(node, 'End', ctx);
  const length = requiredNumber(node, 'length', ctx);
  const rotation = readRotation(node, ctx);
  const radiusStart = readRadius(node, 'radiusStart', ctx);
  const radiusEnd = readRadius(node, 'radiusEnd', ctx);
  if (!start || !end || length === undefined || !rotation) return undefined;
  if (radiusStart === undefined || radiusEnd === undefined) return undefined;
  const startAzimuth = readSpiralStartAzimuth(node, start, ctx);
  if (startAzimuth === undefined) return undefined;
  return {
    kind: 'spiral',
    spiralType,
    length,
    start,
    end,
    startAzimuth,
    radiusStart,
    radiusEnd,
    rotation,
  };
}

/** Dotyčnica na začiatku prechodnice: Start → PI (PI = priesečník dotyčníc), inak atribút dirStart. */
function readSpiralStartAzimuth(node: XmlNode, start: Vec2, ctx: Context): number | undefined {
  const pi = childNamed(node, 'PI') ? requiredPoint(node, 'PI', ctx) : undefined;
  if (pi && Math.hypot(pi.x - start.x, pi.y - start.y) > 0) return vectorToAzimuth(sub2(pi, start));
  const dirStart = optionalNumber(node, 'dirStart', ctx);
  if (dirStart !== undefined) return landXmlDirectionToAzimuth(ctx.direction(dirStart));
  return ctx.sink.error({ code: 'InvalidValue', element: 'Spiral', field: 'PI', value: '' });
}

function readStationEquation(node: XmlNode, ctx: Context): StationEquationData | undefined {
  const staInternal = requiredNumber(node, 'staInternal', ctx);
  const staBack = requiredNumber(node, 'staBack', ctx);
  const staAhead = requiredNumber(node, 'staAhead', ctx);
  if (staInternal === undefined || staBack === undefined || staAhead === undefined)
    return undefined;
  return { staInternal, staBack, staAhead };
}

function readProfAlign(node: XmlNode, ctx: Context): VerticalProfileData | undefined {
  const pvis: PviData[] = [];
  for (const child of node.children) {
    const pvi = readPvi(child, ctx);
    if (pvi) pvis.push(pvi);
  }
  if (ctx.sink.failed) return undefined;
  return { name: node.attributes.name ?? '', pvis };
}

function readPvi(node: XmlNode, ctx: Context): PviData | undefined {
  if (!['PVI', 'ParaCurve', 'CircCurve'].includes(node.name)) {
    return ctx.sink.error({ code: 'UnsupportedVerticalCurve', curveType: node.name });
  }
  const values = parseNumbers(node.text);
  if (!values || values.length < 2) {
    return ctx.sink.error({
      code: 'InvalidValue',
      element: node.name,
      field: '#text',
      value: node.text,
    });
  }
  const [station, elevation] = values as [number, number];
  if (node.name === 'PVI') return { station, elevation };
  const length = requiredNumber(node, 'length', ctx);
  if (length === undefined) return undefined;
  if (node.name === 'ParaCurve')
    return { station, elevation, curve: { kind: 'parabolic', length } };
  const radius = requiredNumber(node, 'radius', ctx);
  if (radius === undefined) return undefined;
  return { station, elevation, curve: { kind: 'circular', length, radius } };
}

/** Podklady musia byť v EPSG:5514 (záporné E aj N), ADR 0003. Hlavičke `epsgCode` neveríme. */
function checkCoordinateSystem(elements: HorizontalElementData[], ctx: Context): boolean {
  for (const e of elements) {
    for (const p of [e.start, e.end]) {
      if (p.x >= 0 || p.y >= 0) {
        ctx.sink.error({ code: 'CoordinateSystemMismatch', x: p.x, y: p.y });
        return false;
      }
    }
  }
  return true;
}

function readRotation(node: XmlNode, ctx: Context): Rotation | undefined {
  const rot = node.attributes.rot ?? '';
  if (rot === 'cw' || rot === 'ccw') return rot;
  return ctx.sink.error({ code: 'InvalidValue', element: node.name, field: 'rot', value: rot });
}

function readRadius(node: XmlNode, attr: string, ctx: Context): number | null | undefined {
  const raw = node.attributes[attr];
  if (raw === undefined || raw.toUpperCase() === 'INF') return null;
  return requiredNumber(node, attr, ctx);
}

/** Bod v poradí LandXML „northing easting [elevation]“ → `{ x: E, y: N }`. */
function requiredPoint(node: XmlNode, childName: string, ctx: Context): Vec2 | undefined {
  const child = childNamed(node, childName);
  const values = child ? parseNumbers(child.text) : undefined;
  if (!values || values.length < 2) {
    return ctx.sink.error({
      code: 'InvalidValue',
      element: node.name,
      field: childName,
      value: child?.text ?? '',
    });
  }
  const [northing, easting] = values as [number, number];
  return { x: easting, y: northing };
}

function requiredNumber(node: XmlNode, attr: string, ctx: Context): number | undefined {
  const value = optionalNumber(node, attr, ctx);
  if (value === undefined && node.attributes[attr] === undefined) {
    ctx.sink.error({ code: 'InvalidValue', element: node.name, field: attr, value: '' });
  }
  return value;
}

function optionalNumber(node: XmlNode, attr: string, ctx: Context): number | undefined {
  const raw = node.attributes[attr];
  if (raw === undefined) return undefined;
  const value = parseNumber(raw);
  if (value === undefined)
    ctx.sink.error({ code: 'InvalidValue', element: node.name, field: attr, value: raw });
  return value;
}

function parseNumber(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

function parseNumbers(text: string): number[] | undefined {
  const parts = text.trim().split(/\s+/);
  const values = parts.map(parseNumber);
  return values.every((v) => v !== undefined) ? (values as number[]) : undefined;
}
