import { type Polygon2D, type Vec2, vec2 } from '@bridge/geom';
import type { DeckSamples } from './deckSampling.ts';
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
  const left = edge((sec) => extreme(sec, -1));
  const right = edge((sec) => extreme(sec, 1));
  return { left, right, polygon: [...left, ...[...right].reverse()] };
}

const cot = (a: number) => Math.cos(a) / Math.sin(a);

/** Krajný bod vonkajších obrysov vľavo (`side` = −1) alebo vpravo (+1); pri zhode x vyšší bod. */
function extreme(sec: SuperstructureSection, side: -1 | 1): Vec2 {
  let best: Vec2 | undefined;
  for (const l of sec.loops) {
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
  return best ?? vec2(0, 0);
}

/** Bod prierezu v pôdoryse posunutý pozdĺž vodorovnej dotyčnice osi mosta o `shift` [m]. */
function shifted(sec: SuperstructureSection, p: Vec2, shift: number): Vec2 {
  const w = sec.toWorld(p);
  const t = sec.axis?.frame.tangent ?? { x: 0, y: 1, z: 0 };
  const th = Math.hypot(t.x, t.y);
  return vec2(w.x + (shift * t.x) / th, w.y + (shift * t.y) / th);
}
