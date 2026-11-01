import type { DimensionSegment } from '@bridge/drawing';
import type { Vec2 } from '@bridge/geom';
import { SNAP_PX } from './measure.ts';

/** Návrh polohy osi uloženia pod kurzorom (nástroje Os uloženia a Podpera, ADR 0017). */
export interface LinePreview {
  deckId: string;
  /** spojité staničenie osi cesty (v osi mosta) */
  s: number;
  /** existujúca voľná os pod kurzorom: podpera sa postaví na ňu */
  lineId?: string;
  /** polia k susedným osiam po osi mosta (živé kóty) */
  spans: DimensionSegment[];
  /** os v pôdoryse (svet) */
  plan: readonly Vec2[];
  /** x v profile (u čiary profilu); bez neho sa os v profile neukazuje */
  u?: number;
  /** poloha kót NK v pôdoryse (bod v odsadení od osi mosta, strana a vzdialenosť okraja NK) */
  frame?: {
    pointAt: (s: number, x: number) => Vec2;
    side: 1 | -1;
    reach: number;
  };
}

/** Os uloženia zobrazenej osi cesty na výber v pohľade. */
export interface LineHandle {
  id: string;
  deckId: string;
  /** spojité staničenie osi cesty */
  s: number;
  /** bez podpery */
  free: boolean;
  /** úsečka osi v pôdoryse (svet) */
  plan: readonly Vec2[];
  /** x v profile (u čiary profilu) */
  u?: number;
}

/** Úpravy osí uloženia z pohľadov (App drží model, pohľady len kurzor). */
export interface LineEditing {
  handles: readonly LineHandle[];
  /**
   * Návrh novej osi na spojitom staničení `s` (v pôdoryse vyberie NK odsadenie od osi cesty, v profile je to NK
   * profilu); `snap` prichytí pole od predchádzajúcej osi po 0,5 m.
   */
  preview(s: number, offset: number | undefined, snap: boolean): LinePreview | undefined;
  /** potvrdenie nástroja: nová os, alebo podpera (na voľnú os, inak s novou osou) */
  place(preview: LinePreview, tool: 'bearingLine' | 'support'): void;
}

/** Vzdialenosť bodu od úsečky [jednotky bodov]. */
function segmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Najbližšia os uloženia do `radius` px od bodu obrazovky: v pôdoryse vzdialenosť od úsečky osi, v profile od
 * zvislice v u. `filter` obmedzí kandidátov (napr. len voľné osi).
 */
export function handleAt(
  screen: Vec2,
  handles: readonly LineHandle[],
  toScreen: (p: Vec2) => Vec2,
  view: 'plan' | 'profile',
  filter: (h: LineHandle) => boolean = () => true,
  radius = SNAP_PX,
): LineHandle | undefined {
  let best: LineHandle | undefined;
  let bestD = radius;
  for (const h of handles) {
    if (!filter(h)) continue;
    let d = Number.POSITIVE_INFINITY;
    if (view === 'profile') {
      if (h.u !== undefined) d = Math.abs(toScreen({ x: h.u, y: 0 }).x - screen.x);
    } else {
      const [a, b] = h.plan;
      if (a && b) d = segmentDistance(screen, toScreen(a), toScreen(b));
    }
    if (d <= bestD) {
      best = h;
      bestD = d;
    }
  }
  return best;
}

/** Návrh na existujúcej voľnej osi (podpera sa postaví na ňu, bez živých kót). */
export function previewOnHandle(h: LineHandle): LinePreview {
  return {
    deckId: h.deckId,
    s: h.s,
    lineId: h.id,
    spans: [],
    plan: h.plan,
    ...(h.u === undefined ? {} : { u: h.u }),
  };
}
