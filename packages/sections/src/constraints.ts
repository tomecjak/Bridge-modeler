import { type Node, parse } from '@bridge/expr';
import type { Vec2 } from '@bridge/geom';
import type { ProfilePoint } from '@bridge/model';

/**
 * Väzba bodu prierezu (Fáza 8b): zapíše sa ako kanonické výrazy `x`, `y` bodu, bez numerického riešiča. V súbore
 * je len výraz; väzba sa z neho rozpozná (`recognizeConstraint`). Čísla sú v pôvodnom rámci profilu (pred posunom
 * referenčného bodu do 0,0), odkazy `A_x`, `A_y` tiež.
 */
export type PointConstraint =
  /** pevné súradnice */
  | { kind: 'fixed'; x: number; y: number }
  /** relatívne k bodu: x = A_x + dx, y = A_y + dy */
  | { kind: 'offset'; ref: string; dx: number; dy: number }
  /** zvislo pod / nad bodom: x = A_x */
  | { kind: 'below'; ref: string; y: number }
  /** vodorovne s bodom: y = A_y */
  | { kind: 'level'; ref: string; x: number }
  /** na sklone od bodu: y = A_y + k · (x − A_x) */
  | { kind: 'slope'; ref: string; slope: number; x: number }
  /** na priamke AB pri zadanom x */
  | { kind: 'onLine'; a: string; b: string; x: number }
  /** priesečník priamok AB a CD */
  | { kind: 'intersection'; a: string; b: string; c: string; d: string }
  /** zrkadlovo k bodu podľa osi y (x = −A_x) */
  | { kind: 'mirror'; ref: string };

/** Číslo vo výraze: na 1e-6, bez exponentu pre bežné rozmery, bez „−0“. */
function literal(v: number): string {
  const r = Math.round(v * 1e6) / 1e6;
  return String(r === 0 ? 0 : r);
}

/** „ + v“ / „ − v“ za odkazom (0 → nič). */
function signed(v: number): string {
  const s = literal(v);
  if (s === '0') return '';
  return s.startsWith('-') ? ` - ${s.slice(1)}` : ` + ${s}`;
}

/** Kanonické výrazy bodu pre väzbu. */
export function constraintExpressions(c: PointConstraint): { x: string; y: string } {
  switch (c.kind) {
    case 'fixed':
      return { x: literal(c.x), y: literal(c.y) };
    case 'offset':
      return { x: `${c.ref}_x${signed(c.dx)}`, y: `${c.ref}_y${signed(c.dy)}` };
    case 'below':
      return { x: `${c.ref}_x`, y: literal(c.y) };
    case 'level':
      return { x: literal(c.x), y: `${c.ref}_y` };
    case 'slope': {
      const k = literal(Math.abs(c.slope));
      const op = c.slope < 0 && k !== '0' ? '-' : '+';
      return {
        x: literal(c.x),
        y: `${c.ref}_y ${op} ${k} * (${literal(c.x)} - ${c.ref}_x)`,
      };
    }
    case 'onLine': {
      const { a, b } = c;
      const x = literal(c.x);
      return { x, y: `${a}_y + (${b}_y - ${a}_y) * (${x} - ${a}_x) / (${b}_x - ${a}_x)` };
    }
    case 'intersection': {
      const { a, b, c: p, d } = c;
      const cross = `(${a}_x * ${b}_y - ${a}_y * ${b}_x)`;
      const crossCD = `(${p}_x * ${d}_y - ${p}_y * ${d}_x)`;
      const den = `((${a}_x - ${b}_x) * (${p}_y - ${d}_y) - (${a}_y - ${b}_y) * (${p}_x - ${d}_x))`;
      return {
        x: `(${cross} * (${p}_x - ${d}_x) - (${a}_x - ${b}_x) * ${crossCD}) / ${den}`,
        y: `(${cross} * (${p}_y - ${d}_y) - (${a}_y - ${b}_y) * ${crossCD}) / ${den}`,
      };
    }
    case 'mirror':
      return { x: `-${c.ref}_x`, y: `${c.ref}_y` };
  }
}

const NAME = '([\\p{L}_][\\p{L}\\p{N}_]*)';
const NUM = '(\\d+(?:\\.\\d+)?)';
const SNUM = '(-?\\d+(?:\\.\\d+)?)';
const re = (source: string) => new RegExp(`^${source}$`, 'u');

const PATTERNS = {
  number: re(SNUM),
  refX: re(`${NAME}_x(?:([+-])${NUM})?`),
  refY: re(`${NAME}_y(?:([+-])${NUM})?`),
  slopeY: re(`${NAME}_y([+-])${NUM}\\*\\(${SNUM}-\\1_x\\)`),
  lineY: re(`${NAME}_y\\+\\(${NAME}_y-\\1_y\\)\\*\\(${SNUM}-\\1_x\\)/\\(\\2_x-\\1_x\\)`),
  mirrorX: re(`-${NAME}_x`),
};

const compact = (text: string) => text.replace(/\s+/g, '');
const sign = (op: string | undefined, v: string | undefined) =>
  v === undefined ? 0 : op === '-' ? -Number(v) : Number(v);

/** Väzba bodu z jeho výrazov (len kanonické tvary); iné výrazy → undefined (bod riadia parametre). */
export function recognizeConstraint(
  point: Pick<ProfilePoint, 'x' | 'y'>,
): PointConstraint | undefined {
  const x = compact(point.x);
  const y = compact(point.y);
  const nx = PATTERNS.number.exec(x);
  const ny = PATTERNS.number.exec(y);
  if (nx && ny) return { kind: 'fixed', x: Number(nx[1]), y: Number(ny[1]) };
  const rx = PATTERNS.refX.exec(x);
  const ry = PATTERNS.refY.exec(y);
  if (rx && ry && rx[1] === ry[1]) {
    return { kind: 'offset', ref: rx[1] as string, dx: sign(rx[2], rx[3]), dy: sign(ry[2], ry[3]) };
  }
  if (rx && rx[2] === undefined && ny)
    return { kind: 'below', ref: rx[1] as string, y: Number(ny[1]) };
  if (nx && ry && ry[2] === undefined)
    return { kind: 'level', ref: ry[1] as string, x: Number(nx[1]) };
  if (nx) {
    const s = PATTERNS.slopeY.exec(y);
    if (s && Math.abs(Number(s[4]) - Number(nx[1])) < 1e-9) {
      return { kind: 'slope', ref: s[1] as string, slope: sign(s[2], s[3]), x: Number(nx[1]) };
    }
    const l = PATTERNS.lineY.exec(y);
    if (l && Math.abs(Number(l[3]) - Number(nx[1])) < 1e-9) {
      return { kind: 'onLine', a: l[1] as string, b: l[2] as string, x: Number(nx[1]) };
    }
  }
  const m = PATTERNS.mirrorX.exec(x);
  if (m && ry && ry[2] === undefined && ry[1] === m[1])
    return { kind: 'mirror', ref: m[1] as string };
  // priesečník: body podľa poradia prvého výskytu vo výraze x, potom porovnanie s kanonickým tvarom
  const names = [
    ...new Set([...point.x.matchAll(/([\p{L}_][\p{L}\p{N}_]*)_[xy]/gu)].map((r) => r[1])),
  ];
  if (names.length === 4) {
    const [a, b, c, d] = names as [string, string, string, string];
    const e = constraintExpressions({ kind: 'intersection', a, b, c, d });
    if (compact(e.x) === x && compact(e.y) === y) return { kind: 'intersection', a, b, c, d };
  }
  return undefined;
}

/** Mená (parametre, súradnice bodov), od ktorých výraz závisí, v poradí výskytu; chybný výraz → []. */
export function drivingIdentifiers(text: string): string[] {
  const p = parse(text);
  if (!p.ok) return [];
  const out: string[] = [];
  const walk = (n: Node) => {
    if (n.type === 'ident' && !out.includes(n.name)) out.push(n.name);
    if (n.type === 'unary') walk(n.operand);
    if (n.type === 'binary') {
      walk(n.left);
      walk(n.right);
    }
    if (n.type === 'call') n.args.forEach(walk);
  };
  walk(p.ast as Node);
  return out;
}

/** Druh väzby a jej referenčné body, ktoré volí projektant (voľné hodnoty sa dopočítajú z polohy bodu). */
export type ConstraintSpec =
  | { kind: 'fixed' }
  | { kind: 'offset' | 'below' | 'level' | 'slope' | 'mirror'; ref: string }
  | { kind: 'onLine'; a: string; b: string }
  | { kind: 'intersection'; a: string; b: string; c: string; d: string };

/**
 * Výrazy bodu s väzbou tak, aby bod ostal, kde je, ak to väzba dovolí. `at` a `points` sú posunuté súradnice
 * (referenčný bod v 0,0, ako ich vracia `evaluateProfileDefinition`), `origin` je pôvodná poloha referenčného bodu.
 */
export function constrainPoint(
  spec: ConstraintSpec,
  at: Vec2,
  points: ReadonlyMap<string, Vec2>,
  origin: Vec2,
): { x: string; y: string } {
  const rawX = at.x + origin.x;
  const rawY = at.y + origin.y;
  const ref = (name: string) => points.get(name) ?? at;
  switch (spec.kind) {
    case 'fixed':
      return constraintExpressions({ kind: 'fixed', x: rawX, y: rawY });
    case 'offset': {
      const a = ref(spec.ref);
      return constraintExpressions({
        kind: 'offset',
        ref: spec.ref,
        dx: at.x - a.x,
        dy: at.y - a.y,
      });
    }
    case 'below':
      return constraintExpressions({ ...spec, kind: 'below', y: rawY });
    case 'level':
      return constraintExpressions({ ...spec, kind: 'level', x: rawX });
    case 'slope': {
      const a = ref(spec.ref);
      const slope = Math.abs(at.x - a.x) > 1e-9 ? (at.y - a.y) / (at.x - a.x) : 0;
      return constraintExpressions({ ...spec, kind: 'slope', slope, x: rawX });
    }
    case 'mirror':
      return constraintExpressions({ kind: 'mirror', ref: spec.ref });
    case 'onLine':
      return constraintExpressions({ ...spec, x: rawX });
    case 'intersection':
      return constraintExpressions(spec);
  }
}

const mm = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Nové výrazy bodu po potiahnutí z polohy `from` do `to` (posunuté súradnice): mení sa len voľná hodnota väzby,
 * zaokrúhlená na mm. Bod bez voľnej hodnoty (parametre, zrkadlo, priesečník) je zamknutý → undefined.
 */
export function dragPoint(
  point: Pick<ProfilePoint, 'x' | 'y'>,
  to: Vec2,
  from: Vec2,
): { x: string; y: string } | undefined {
  const c = recognizeConstraint(point);
  if (!c) return undefined;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  switch (c.kind) {
    case 'fixed':
      return constraintExpressions({ ...c, x: mm(c.x + dx), y: mm(c.y + dy) });
    case 'offset':
      return constraintExpressions({ ...c, dx: mm(c.dx + dx), dy: mm(c.dy + dy) });
    case 'below':
      return constraintExpressions({ ...c, y: mm(c.y + dy) });
    case 'level':
    case 'slope':
    case 'onLine':
      return constraintExpressions({ ...c, x: mm(c.x + dx) });
    case 'intersection':
    case 'mirror':
      return undefined;
  }
}
