import { type Polygon2D, type Vec2, vec2 } from '@bridge/geom';
import { type DeckEnd, deckTopAt, type SupportResult, seatAt } from './supports.ts';

/** Časť podpery ako zvislý hranol: pôdorys a výška spodnej a hornej plochy v bode pôdorysu (lokálne z). */
export interface SolidPart {
  name: 'footing' | 'seat' | 'stem' | 'backwall' | 'wing';
  plan: Polygon2D;
  bottom: (p: Vec2) => number;
  top: (p: Vec2) => number;
  /** plochy sú lineárne len medzi ložiskami → pôdorys treba rozdeliť v priečnych polohách ložísk */
  foldsAtBearings: boolean;
}

/** Priečna poloha bodu pôdorysu od osi NK v mieste podpery [m], + vpravo. */
export function transverseOffset(r: SupportResult, p: Vec2): number {
  const axis = r.axis;
  if (!axis) return Number.NaN;
  return (p.x - axis.point.x) * axis.frame.normal.x + (p.y - axis.point.y) * axis.frame.normal.y;
}

/** Rámec opory: os podpery `d`, smer do poľa `f` (kolmo na os podpery), smer staničenia `t`. */
function frame(r: SupportResult, end: DeckEnd) {
  const d = r.direction;
  const t = end.tangent;
  const into = end.side === 'start' ? 1 : -1;
  let f = vec2(d.y, -d.x);
  if ((f.x * t.x + f.y * t.y) * into < 0) f = vec2(-f.x, -f.y);
  return { d, f, t, into };
}

/**
 * Časti opory (ADR 0010): úložný prah, driek (ak je základ nižšie ako spodok prahu), záverný múrik a krídla.
 * `undefined`, ak podpera nie je opora, nie je vyhodnotená alebo jej NK nemá koniec pri opore.
 */
export function abutmentParts(r: SupportResult): SolidPart[] | undefined {
  const g = r.support.geometry;
  const end = r.deckEnd;
  const dim = r.dimensions;
  if (g.type !== 'abutment' || !end || !r.axis || r.bearings.length === 0) return undefined;
  const need = ['length', 'seatLength', 'seatHeight', 'frontOffset', 'stemThickness'];
  const more = [
    'backwallThickness',
    'gap',
    'wingAngle',
    'wingLength',
    'wingThickness',
    'wingEndHeight',
  ];
  if (![...need, ...more].every((k) => Number.isFinite(dim[k]))) return undefined;
  const L = dim.length as number;
  const seatLength = dim.seatLength as number;
  const seatHeight = dim.seatHeight as number;
  const front = dim.frontOffset as number;
  const { d, f, t, into } = frame(r, end);
  const c = r.center;
  const n = vec2(r.axis.frame.normal.x, r.axis.frame.normal.y);
  const dn = d.x * n.x + d.y * n.y;
  const fn = f.x * n.x + f.y * n.y;
  const x = (p: Vec2) => transverseOffset(r, p);
  // bočné líca opory sú rovnobežné s osou mosta cez konce opory na osi ložísk (krídla pod okrajmi NK)
  const ends = [-1, 1].map((k) => x(vec2(c.x + ((k * L) / 2) * d.x, c.y + ((k * L) / 2) * d.y)));
  const xc = x(c);
  /** bod na priamke vo vzdialenosti `w` od osi ložísk s priečnou polohou `xs` */
  const at = (w: number, xs: number) => {
    const u = (xs - xc - w * fn) / dn;
    return vec2(c.x + u * d.x + w * f.x, c.y + u * d.y + w * f.y);
  };
  const [xa, xb] = ends as [number, number];
  const rect = (w0: number, w1: number): Polygon2D => [
    at(w0, xa),
    at(w0, xb),
    at(w1, xb),
    at(w1, xa),
  ];
  const wOf = (p: Vec2) => (p.x - c.x) * f.x + (p.y - c.y) * f.y;
  const seatTop = (p: Vec2) => seatAt(r, x(p));
  const seatBottom = (p: Vec2) => seatTop(p) - seatHeight;
  // horný povrch NK predĺžený v sklone nivelety (bod na šikmom konci leží na inom staničení ako os)
  const deckTop = (p: Vec2) =>
    deckTopAt(end, x(p)) + end.grade * ((p.x - end.point.x) * t.x + (p.y - end.point.y) * t.y);

  const parts: SolidPart[] = [
    {
      name: 'seat',
      plan: rect(front - seatLength, front),
      bottom: seatBottom,
      top: seatTop,
      foldsAtBearings: true,
    },
  ];

  const lowestSeatBottom = Math.min(...r.bearings.map((b) => b.seat)) - seatHeight;
  if (lowestSeatBottom - r.foundationTop > 1e-3) {
    parts.push({
      name: 'stem',
      plan: rect(front - (dim.stemThickness as number), front),
      bottom: () => r.foundationTop,
      top: seatBottom,
      foldsAtBearings: true,
    });
  }

  // predná líca múrika rovnobežne s osou podpery za koncom NK; medzera je meraná v osi mosta
  const deckEndW = wOf(end.point);
  const alongAxis = Math.abs(t.x * f.x + t.y * f.y);
  const backwallFront = deckEndW - (dim.gap as number) * alongAxis;
  const backwallBack = backwallFront - (dim.backwallThickness as number);
  if ((dim.backwallThickness as number) > 0) {
    parts.push({
      name: 'backwall',
      plan: rect(backwallBack, backwallFront),
      bottom: seatBottom,
      top: deckTop,
      foldsAtBearings: false,
    });
  }

  const wingLength = dim.wingLength as number;
  const thickness = dim.wingThickness as number;
  if (wingLength > 0) {
    const root = Math.min(front - seatLength, backwallBack);
    const angle = ((dim.wingAngle as number) * Math.PI) / 180;
    // od poľa = proti smeru do poľa pozdĺž osi mosta; bočne von = od osi mosta
    const away = vec2(-into * t.x, -into * t.y);
    for (const xEnd of ends) {
      const out = Math.sign(xEnd - xc) || 1;
      const lat = vec2(out * n.x, out * n.y);
      const dir = vec2(
        Math.cos(angle) * away.x + Math.sin(angle) * lat.x,
        Math.cos(angle) * away.y + Math.sin(angle) * lat.y,
      );
      let inward = vec2(-dir.y, dir.x);
      if (inward.x * lat.x + inward.y * lat.y > 0) inward = vec2(-inward.x, -inward.y);
      const r0 = at(root, xEnd);
      const r1 = vec2(r0.x + wingLength * dir.x, r0.y + wingLength * dir.y);
      const i1 = vec2(r1.x + thickness * inward.x, r1.y + thickness * inward.y);
      // vnútorná líca končí na zadnej líci opory
      const inner0 = vec2(r0.x + thickness * inward.x, r0.y + thickness * inward.y);
      const lambda = (root - wOf(inner0)) / (dir.x * f.x + dir.y * f.y);
      const i0 = vec2(inner0.x + lambda * dir.x, inner0.y + lambda * dir.y);
      const distance = (p: Vec2) => (p.x - r0.x) * dir.x + (p.y - r0.y) * dir.y;
      const rootBottom = seatBottom(r0);
      const endBottom = deckTop(r1) - (dim.wingEndHeight as number);
      parts.push({
        name: 'wing',
        plan: [r0, r1, i1, i0],
        top: deckTop,
        bottom:
          g.wings.support === 'founded'
            ? () => r.foundationTop
            : (p) => {
                const k = Math.max(0, Math.min(1, distance(p) / wingLength));
                return rootBottom + k * (endBottom - rootBottom);
              },
        foldsAtBearings: false,
      });
    }
  }
  return parts;
}

/** Krajné body opôr pozdĺž osi mosta (staničenie konca NK + priemet na dotyčnicu), zvlášť vľavo a vpravo. */
export interface OverallExtent {
  from: { left: number; right: number };
  to: { left: number; right: number };
}

/**
 * Rozsah mosta po konce krídel (ADR 0010): krajné body opôr (bez krídel zadné líca) premietnuté na dotyčnicu osi
 * mosta na konci NK, zvlášť na ľavej a pravej strane. Bez opory na konci je krajným bodom koniec NK.
 */
export function overallExtent(
  supports: readonly SupportResult[],
  deck: { sFrom: number; sTo: number },
): OverallExtent {
  const from = { left: deck.sFrom, right: deck.sFrom };
  const to = { left: deck.sTo, right: deck.sTo };
  for (const r of supports) {
    const end = r.deckEnd;
    const parts = abutmentParts(r);
    if (!end || !parts) continue;
    for (const p of parts.flatMap((part) => part.plan)) {
      const s = end.s + (p.x - end.point.x) * end.tangent.x + (p.y - end.point.y) * end.tangent.y;
      const side = transverseOffset(r, p) < 0 ? 'left' : 'right';
      if (end.side === 'start') from[side] = Math.min(from[side], s);
      else to[side] = Math.max(to[side], s);
    }
  }
  return { from, to };
}

/**
 * Celková dĺžka mosta (ADR 0010): vzdialenosť koncov krídel (bez krídel zadných líc opôr) meraná rovnobežne
 * s osou mosta, zvlášť na ľavej a pravej strane; výsledok je väčšia z nich. Bez opory na konci sa počíta od konca NK.
 * Lokálne priama os.
 */
export function overallLength(
  supports: readonly SupportResult[],
  deck: { sFrom: number; sTo: number },
): number {
  const { from, to } = overallExtent(supports, deck);
  return Math.max(to.left - from.left, to.right - from.right);
}

/** Predná líca úložného prahu opory v pôdoryse: bod a smer (rovnobežne s osou podpery). */
export function seatFrontLine(r: SupportResult): { point: Vec2; direction: Vec2 } | undefined {
  const g = r.support.geometry;
  const end = r.deckEnd;
  const front = r.dimensions.frontOffset;
  if (g.type !== 'abutment' || !end || !r.axis || front === undefined || !Number.isFinite(front))
    return undefined;
  const { d, f } = frame(r, end);
  return { point: vec2(r.center.x + front * f.x, r.center.y + front * f.y), direction: d };
}
