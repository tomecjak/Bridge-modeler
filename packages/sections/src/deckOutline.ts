import { type Polygon2D, signedArea, type Vec2, vec2 } from '@bridge/geom';
import type { DeckSamples } from './deckSampling.ts';
import type { EvaluatedLoop } from './profile.ts';
import type { SuperstructureSection } from './superstructure.ts';

/** Obrys NK v pôdoryse (lokálne súradnice). */
export interface DeckOutline {
  /** ľavý a pravý okraj v smere staničenia (krajné body prierezu) */
  left: Vec2[];
  right: Vec2[];
  /** uzavretý obrys: ľavý okraj, koniec, pravý okraj späť, začiatok */
  polygon: Polygon2D;
}

/**
 * Obrys NK v pôdoryse (Fáza 6): krajné body vonkajších obrysov prierezu vo vzorkách NK. Konce sú rovnobežné
 * s osou krajnej opory ako v 3D: bod v priečnej polohe x končí na staničení `s_konca − x·cot α`
 * (posun pozdĺž dotyčnice osi mosta), body za šikmým koncom sa vynechajú.
 */
export function deckOutline(
  samples: Pick<DeckSamples, 'sections' | 'sFrom' | 'sTo' | 'endAngles'>,
): DeckOutline {
  const sections = samples.sections.filter((s) => s.axis && s.loops.length > 0);
  const first = sections[0];
  const last = sections[sections.length - 1];
  if (!first || !last || first === last) return { left: [], right: [], polygon: [] };
  const cot0 = cot(samples.endAngles.start);
  const cot1 = cot(samples.endAngles.end);

  const edge = (pick: (sec: SuperstructureSection) => Vec2): Vec2[] => {
    const pts: Vec2[] = [shifted(first, pick(first), -pick(first).x * cot0)];
    for (const sec of sections.slice(1, -1)) {
      const p = pick(sec);
      if (sec.s <= samples.sFrom - p.x * cot0 || sec.s >= samples.sTo - p.x * cot1) continue;
      const w = sec.toWorld(p);
      pts.push(vec2(w.x, w.y));
    }
    pts.push(shifted(last, pick(last), -pick(last).x * cot1));
    return pts;
  };
  const left = edge((sec) => extremePoint(sec.loops, -1) ?? vec2(0, 0));
  const right = edge((sec) => extremePoint(sec.loops, 1) ?? vec2(0, 0));
  return { left, right, polygon: [...left, ...[...right].reverse()] };
}

const cot = (a: number) => Math.cos(a) / Math.sin(a);

/** Krajný bod vonkajších obrysov vľavo (`side` = −1) alebo vpravo (+1); pri zhode x vyšší bod. */
export function extremePoint(loops: readonly EvaluatedLoop[], side: -1 | 1): Vec2 | undefined {
  let best: Vec2 | undefined;
  for (const l of loops) {
    if (l.role !== 'outer') continue;
    for (const p of l.polygon) {
      if (
        !best ||
        side * (p.x - best.x) > 1e-9 ||
        (Math.abs(p.x - best.x) <= 1e-9 && p.y > best.y)
      ) {
        best = p;
      }
    }
  }
  return best;
}

/** Bod prierezu v pôdoryse posunutý pozdĺž vodorovnej dotyčnice osi mosta o `shift` [m]. */
function shifted(sec: SuperstructureSection, p: Vec2, shift: number): Vec2 {
  const w = sec.toWorld(p);
  const t = sec.axis?.frame.tangent ?? { x: 0, y: 1, z: 0 };
  const th = Math.hypot(t.x, t.y);
  return vec2(w.x + (shift * t.x) / th, w.y + (shift * t.y) / th);
}

/**
 * Obrys mosta v pôdoryse (ADR 0023): okraj NK nahradí vonkajšia hrana rímsy na strane, kde rímsa je (prvá rímsa na
 * strane); bez ríms obrys NK.
 */
export function bridgeOutline(
  deck: DeckOutline,
  edgeBeams: readonly { side: 'left' | 'right'; outline: DeckOutline }[],
): DeckOutline {
  const left = edgeBeams.find((b) => b.side === 'left')?.outline.left;
  const right = edgeBeams.find((b) => b.side === 'right')?.outline.right;
  if (!left && !right) return deck;
  const l = left && left.length >= 2 ? left : deck.left;
  const r = right && right.length >= 2 ? right : deck.right;
  return { left: l, right: r, polygon: [...l, ...[...r].reverse()] };
}

/** Pôdorysná plocha obrysu [m²] (plocha mosta pre ukazovatele 10h). */
export const outlineArea = (outline: Pick<DeckOutline, 'polygon'>): number =>
  outline.polygon.length >= 3 ? Math.abs(signedArea(outline.polygon)) : 0;
