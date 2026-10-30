import { type ExprError, evaluate, type Node, parse, type Scope } from '@bridge/expr';
import {
  duplicateVertices,
  isCounterClockwise,
  type Polygon2D,
  pointInPolygon,
  regionProperties,
  selfIntersections,
  type Vec2,
  vec2,
} from '@bridge/geom';
import {
  evaluateLaw,
  type ModelIssue,
  type ProfileDefinition,
  type StationFunction,
} from '@bridge/model';

/** Tolerancia geometrických kontrol prierezu [m]. */
export const PROFILE_TOLERANCE = 1e-6;

export interface EvaluatedLoop {
  name: string;
  role: 'outer' | 'void';
  /** body v rámci prierezu, referenčný bod v (0, 0); obrys CCW, dutina CW */
  polygon: Polygon2D;
  pointNames: string[];
}

export interface EvaluatedProfile {
  /** súradnice bodov v rámci prierezu, posunuté tak, že referenčný bod je (0, 0) */
  points: Map<string, Vec2>;
  /** len platné obrysy (uzavreté, bez samopretínania) */
  loops: EvaluatedLoop[];
  area: number;
  centroid: Vec2;
  issues: ModelIssue[];
}

/**
 * Hodnoty parametrov profilu na zobrazovanom staničení `sta`: priebeh z NK, inak predvolený výraz profilu.
 * Parametre sa vyhodnocujú v poradí; môžu odkazovať na skoršie parametre profilu a na globálne parametre.
 */
export function profileParameterValues(
  def: ProfileDefinition,
  laws: Readonly<Record<string, StationFunction>>,
  globals: Scope,
  sta: number,
): { values: Map<string, number>; issues: ModelIssue[] } {
  const values = new Map<string, number>();
  const issues: ModelIssue[] = [];
  const known = new Set(def.parameters.map((p) => p.name));
  for (const name of Object.keys(laws)) {
    if (!known.has(name)) issues.push({ code: 'UnknownProfileParameter', name });
  }
  const scope: Scope = (n) => values.get(n) ?? globals(n);
  for (const p of def.parameters) {
    const law = laws[p.name] ?? { kind: 'constant', value: p.default };
    const r = evaluateLaw(law, p.unit, scope, sta);
    if (r.ok) values.set(p.name, r.value);
    else issues.push({ ...r.issue, parameter: p.name });
  }
  return { values, issues };
}

// výrazy bodov sa vyhodnocujú pri každom staničení → rozparsované AST sa držia v cache podľa textu
const parsed = new Map<string, ReturnType<typeof parse>>();
function parseCached(text: string) {
  let r = parsed.get(text);
  if (!r) {
    if (parsed.size > 5000) parsed.clear();
    r = parse(text);
    parsed.set(text, r);
  }
  return r;
}

/** Vyhodnotí body a obrysy prierezu a skontroluje ich (ADR 0007). Nič nevyhadzuje. */
export function evaluateProfileDefinition(
  def: ProfileDefinition,
  values: ReadonlyMap<string, number>,
  globals: Scope,
  sta: number,
): EvaluatedProfile {
  const issues: ModelIssue[] = [];
  const raw = new Map<string, Vec2>();
  const laterCoords = new Map<string, number>(); // `P_x` → index bodu P
  def.points.forEach((p, i) => {
    laterCoords.set(`${p.name}_x`, i);
    laterCoords.set(`${p.name}_y`, i);
  });

  const scope: Scope = (n) => {
    const v = values.get(n);
    if (v !== undefined) return v;
    const m = /^(.+)_(x|y)$/.exec(n);
    const point = m ? raw.get(m[1] as string) : undefined;
    if (point) return m?.[2] === 'x' ? point.x : point.y;
    if (n === 'sta') return sta;
    return globals(n);
  };

  const coordinate = (
    text: string,
    field: 'x' | 'y',
    point: string,
    index: number,
  ): number | undefined => {
    const p = parseCached(text);
    const fail = (error: ExprError) => {
      const later = error.code === 'UnknownIdentifier' ? laterCoords.get(error.name) : undefined;
      if (error.code === 'UnknownIdentifier' && later !== undefined && later >= index) {
        issues.push({ code: 'ForwardPointReference', point, reference: error.name });
      } else issues.push({ code: 'ExpressionError', point, field, expression: text, error });
      return undefined;
    };
    if (!p.ok) return fail(p.error);
    const r = evaluate(p.ast as Node, scope);
    if (!r.ok) return fail(r.error);
    if (typeof r.value !== 'number') {
      issues.push({ code: 'NotANumber', point, field });
      return undefined;
    }
    return r.value;
  };

  def.points.forEach((p, index) => {
    if (raw.has(p.name)) {
      issues.push({ code: 'DuplicatePointName', name: p.name });
      return;
    }
    const x = coordinate(p.x, 'x', p.name, index);
    const y = coordinate(p.y, 'y', p.name, index);
    if (x !== undefined && y !== undefined) raw.set(p.name, vec2(x, y));
  });

  const ref = raw.get(def.referencePoint);
  if (!ref) issues.push({ code: 'UnknownReferencePoint', name: def.referencePoint });
  const origin = ref ?? vec2(0, 0);
  const points = new Map([...raw].map(([k, v]) => [k, vec2(v.x - origin.x, v.y - origin.y)]));

  const loops: EvaluatedLoop[] = [];
  for (const loop of def.loops) {
    const missing = loop.points.find((n) => !points.has(n));
    if (missing !== undefined) {
      // chybu bodu (výraz) už hlási vyhodnotenie bodu; tu len neexistujúce názvy
      if (!def.points.some((p) => p.name === missing)) {
        issues.push({ code: 'UnknownPoint', loop: loop.name, name: missing });
      }
      continue;
    }
    if (loop.points.length < 3) {
      issues.push({ code: 'OpenLoop', loop: loop.name });
      continue;
    }
    let names = [...loop.points];
    let polygon = names.map((n) => points.get(n) as Vec2);
    const dup = duplicateVertices(polygon, PROFILE_TOLERANCE);
    if (dup.length > 0) {
      issues.push({
        code: 'DuplicateVertex',
        loop: loop.name,
        name: names[dup[0] as number] as string,
      });
      continue;
    }
    const crossing = selfIntersections(polygon, PROFILE_TOLERANCE)[0];
    if (crossing) {
      issues.push({
        code: 'SelfIntersection',
        loop: loop.name,
        edges: [names[crossing[0]] as string, names[crossing[1]] as string],
      });
      continue;
    }
    const wantCcw = loop.role === 'outer';
    if (isCounterClockwise(polygon) !== wantCcw) {
      names = names.reverse();
      polygon = [...polygon].reverse();
      issues.push({ code: 'LoopReversed', loop: loop.name, severity: 'warning' });
    }
    loops.push({ name: loop.name, role: loop.role, polygon, pointNames: names });
  }

  const outers = loops.filter((l) => l.role === 'outer');
  if (!def.loops.some((l) => l.role === 'outer')) issues.push({ code: 'MissingOuterLoop' });
  const voids = loops.filter((l) => l.role === 'void');
  for (const v of voids) {
    const inside = outers.some((o) => v.polygon.every((p) => pointInPolygon(p, o.polygon)));
    if (!inside) issues.push({ code: 'VoidOutsideOuter', loop: v.name });
  }

  let area = 0;
  let sx = 0;
  let sy = 0;
  for (const o of outers) {
    const inner = voids
      .filter((v) => v.polygon.every((p) => pointInPolygon(p, o.polygon)))
      .map((v) => v.polygon);
    const r = regionProperties(o.polygon, inner);
    area += r.area;
    sx += r.area * r.centroid.x;
    sy += r.area * r.centroid.y;
  }
  const centroid = area > 0 ? vec2(sx / area, sy / area) : vec2(0, 0);
  return { points, loops, area, centroid, issues };
}
