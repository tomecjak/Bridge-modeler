import type { Alignment } from '@bridge/alignment';
import { integrate } from '@bridge/geom';
import { type BridgeAxis, evaluateLaw, lawReferences, type ParameterSet } from '@bridge/model';

/** Prevod spojitého staničenia osi cesty ↔ vodorovná dĺžka po osi mosta (ADR 0007, doplnok 10b). */
export interface AxisLength {
  /** vodorovná dĺžka po osi mosta od začiatku osi cesty (s = 0) po `s` [m] */
  lengthAt(s: number): number;
  /** spojité staničenie osi cesty, ktorému zodpovedá dĺžka po osi mosta `l` */
  stationAt(l: number): number;
  /** vodorovný posun osi mosta na `s` (mimo rozsahu priebehu hodnota krajného bodu) [m] */
  offsetAt(s: number): number;
  /** dĺžka osi mosta na celej osi cesty [m] */
  readonly total: number;
}

/** najdlhší úsek tabuľky [m] */
const MAX_STEP = 5;
/** krok centrálnej diferencie posunu [m] */
const DIFF = 1e-4;
const DEDUPE = 1e-9;

/**
 * Dĺžka po osi mosta L(s) = ∫ √((1 − κh)² + h′²) ds (κ > 0 oblúk doprava, h = vodorovný posun vpravo).
 * Tabuľka kumulatívnej dĺžky s uzlami na stykoch prvkov osi, hraniciach úsekov posunu a skokoch v staničení
 * (úseky ≤ 5 m, Gauss–Legendre); mimo rozsahu priebehu posunu sa h drží na hodnote krajného bodu.
 * Nevyhodnotiteľný posun sa berie ako 0.
 */
export function bridgeAxisLength(
  axis: BridgeAxis,
  alignment: Alignment,
  parameters: ParameterSet,
): AxisLength {
  const { stationing } = alignment;
  const law = axis.horizontalOffset;
  const end = alignment.length;
  const clampS = (s: number) => Math.min(end, Math.max(0, s));

  // rozsah, v ktorom je posun definovaný (spojité staničenie)
  let sLo = 0;
  let sHi = end;
  const lawBreaks: number[] = [];
  if (law.kind === 'piecewise' && law.segments.length > 0) {
    for (const g of law.segments) {
      for (const d of [g.from, g.to]) {
        const s = stationing.fromDisplay(d);
        if (s !== undefined) lawBreaks.push(s);
      }
    }
    const first = stationing.fromDisplay(law.segments[0]?.from ?? 0);
    const last = stationing.fromDisplay(law.segments[law.segments.length - 1]?.to ?? 0);
    if (first !== undefined && last !== undefined && last > first) {
      sLo = clampS(first);
      sHi = clampS(last);
    }
  }

  // bez odkazov na globálne parametre sa ich hodnoty nevyhodnocujú (posun sa počíta v každom uzle kvadratúry)
  const global = lawReferences(law, 'length').size > 0;
  const offset = (s: number): number => {
    const sc = Math.min(sHi, Math.max(sLo, s));
    const station = stationing.toDisplay(sc).station;
    const values = global ? parameters.evaluateAt(station).values : undefined;
    const r = evaluateLaw(law, 'length', (n) => values?.get(n), station);
    return r.ok ? r.value : 0;
  };

  /** integrand na úseku ⟨a, b⟩ (derivácia posunu len vnútri úseku) */
  const rate = (a: number, b: number) => (s: number) => {
    const d = Math.min(DIFF, (s - a) / 2, (b - s) / 2);
    const h = offset(s);
    const dh = d > 0 ? (offset(s + d) - offset(s - d)) / (2 * d) : 0;
    const k = alignment.evaluateHorizontal(s).curvature;
    return Math.hypot(1 - k * h, dh);
  };

  const breaks = [
    0,
    end,
    sLo,
    sHi,
    ...alignment.elements.map((e) => e.sStart),
    ...stationing.regions.map((r) => r.sStart),
    ...lawBreaks,
  ]
    .map(clampS)
    .sort((a, b) => a - b);
  const knots: number[] = [];
  for (let i = 0; i < breaks.length; i++) {
    const s = breaks[i] as number;
    const prev = knots[knots.length - 1];
    if (prev === undefined) {
      knots.push(s);
      continue;
    }
    if (s - prev <= DEDUPE) continue;
    const n = Math.ceil((s - prev) / MAX_STEP);
    for (let k = 1; k < n; k++) knots.push(prev + ((s - prev) * k) / n);
    knots.push(s);
  }
  const cum = [0];
  for (let i = 1; i < knots.length; i++) {
    const a = knots[i - 1] as number;
    const b = knots[i] as number;
    cum.push((cum[i - 1] as number) + integrate(rate(a, b), a, b, 1));
  }
  const total = cum[cum.length - 1] as number;

  /** index úseku ⟨knots[i], knots[i + 1]⟩, v ktorom leží `s` */
  const pieceOf = (values: readonly number[], v: number) => {
    let lo = 0;
    let hi = values.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if ((values[mid] as number) <= v) lo = mid;
      else hi = mid;
    }
    return lo;
  };

  const lengthAt = (s: number): number => {
    if (knots.length < 2) return s;
    if (s <= 0) return s;
    if (s >= end) return total + (s - end);
    const i = pieceOf(knots, s);
    const a = knots[i] as number;
    const b = knots[i + 1] as number;
    return (cum[i] as number) + (s > a ? integrate(rate(a, b), a, s, 1) : 0);
  };

  const stationAt = (l: number): number => {
    if (knots.length < 2) return l;
    if (l <= 0) return l;
    if (l >= total) return end + (l - total);
    const i = pieceOf(cum, l);
    let lo = knots[i] as number;
    let hi = knots[i + 1] as number;
    const f = rate(lo, hi);
    let s =
      lo + ((l - (cum[i] as number)) / ((cum[i + 1] as number) - (cum[i] as number))) * (hi - lo);
    // Newton chránený bisekciou (L je neklesajúca)
    for (let k = 0; k < 60; k++) {
      const err = lengthAt(s) - l;
      if (Math.abs(err) < 1e-12) break;
      if (err > 0) hi = s;
      else lo = s;
      const slope = f(s);
      let next = slope > 1e-9 ? s - err / slope : Number.NaN;
      if (!(next > lo && next < hi)) next = (lo + hi) / 2;
      if (Math.abs(next - s) < 1e-13) {
        s = next;
        break;
      }
      s = next;
    }
    return s;
  };

  return { lengthAt, stationAt, offsetAt: offset, total };
}
