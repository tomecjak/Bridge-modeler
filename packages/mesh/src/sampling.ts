import type { Alignment } from '@bridge/alignment';
import type { Scope } from '@bridge/expr';
import { evaluateLaw, type ParameterUnit, type StationFunction } from '@bridge/model';

export interface SamplingOptions {
  /** najväčšia odchýlka tetivy od skutočnej geometrie [m] */
  tolerance: number;
  /** najväčší krok vzoriek [m] (priamky, výrazy, lineárne priebehy) */
  maxStep: number;
  /** vzdialenosť vzorky pred vnútornou hranicou úseku, aby sa skok hodnoty zobrazil ako zvislá plocha [m] */
  jumpGap: number;
}

export const DEFAULT_SAMPLING: SamplingOptions = { tolerance: 0.002, maxStep: 2, jumpGap: 1e-3 };

export interface LawRef {
  law: StationFunction;
  unit: ParameterUnit;
}

export interface SamplingInput {
  alignment: Alignment;
  /** rozsah v spojitom staničení osi cesty [m] */
  sFrom: number;
  sTo: number;
  /** priebehy, ktoré menia tvar alebo polohu prierezu (zlomy a zakrivenie) */
  laws: readonly LawRef[];
  /** rozsah mien pre výrazy priebehov na zobrazovanom staničení */
  scope: (station: number) => Scope;
  /** ďalšie povinné staničenia (spojité), napr. podpery a ložiská */
  breaks: readonly number[];
  /** najväčšia vzdialenosť bodu prierezu od osi cesty [m] (polomer dráhy krajného bodu) */
  reach: number;
}

const DEDUPE = 1e-6;

/** Krok, pri ktorom tetiva krivky so zakrivením `k` neodbočí od nej viac ako `tol`. */
const chordStep = (k: number, tol: number) => (k > 0 ? Math.sqrt((8 * tol) / k) : Infinity);

/**
 * Staničenia vzoriek NK (spojité `s`): všetky zlomy presne (prvky osi, PVC/PVT, hranice úsekov priebehov,
 * skoky v staničení, podpery), medzi nimi rovnomerne s krokom podľa tolerancie tetivy. Deterministické.
 */
export function sampleStations(
  input: SamplingInput,
  options: SamplingOptions = DEFAULT_SAMPLING,
): number[] {
  const { alignment, sFrom, sTo, reach } = input;
  if (!(sTo > sFrom)) return [sFrom];
  const stationing = alignment.stationing;
  const breaks: number[] = [sFrom, sTo, ...input.breaks];
  const withGap = (s: number | undefined) => {
    if (s === undefined) return;
    breaks.push(s, s - options.jumpGap);
  };

  for (const e of alignment.elements) breaks.push(e.sStart);
  for (const k of alignment.profile?.keyPoints ?? []) {
    if (k.kind === 'pvc' || k.kind === 'pvt') breaks.push(k.s);
  }
  for (const r of stationing.regions.slice(1)) withGap(r.sStart);
  for (const { law } of input.laws) {
    if (law.kind !== 'piecewise') continue;
    const starts = new Set(law.segments.map((g) => g.from));
    for (const g of law.segments) {
      breaks.push(...[g.from, g.to].map((d) => stationing.fromDisplay(d)).filter(isNumber));
      if (starts.has(g.to)) withGap(stationing.fromDisplay(g.to));
    }
  }

  const sorted = breaks.filter((s) => s >= sFrom && s <= sTo).sort((a, b) => a - b);
  const keys: number[] = [];
  for (const s of sorted) {
    if (keys.length === 0 || s - (keys[keys.length - 1] as number) > DEDUPE) keys.push(s);
  }
  keys[keys.length - 1] = sTo;

  const out: number[] = [];
  for (let i = 0; i + 1 < keys.length; i++) {
    const a = keys[i] as number;
    const b = keys[i + 1] as number;
    const step = Math.min(
      options.maxStep,
      horizontalStep(alignment, a, b, reach, options.tolerance),
      verticalStep(alignment, a, b, options.tolerance),
      lawStep(input, a, b, options.tolerance),
    );
    const n = Math.max(1, Math.ceil((b - a) / step - 1e-9));
    for (let k = 0; k < n; k++) out.push(a + ((b - a) * k) / n);
  }
  out.push(sTo);
  return out;
}

const isNumber = (v: number | undefined): v is number => v !== undefined;

/** Zakrivenie v úseku (v rámci jedného prvku osi je lineárne → stačia konce a stred). */
function horizontalStep(al: Alignment, a: number, b: number, reach: number, tol: number): number {
  const d = Math.min(1e-6, (b - a) / 4);
  const k = Math.max(
    ...[a + d, (a + b) / 2, b - d].map((s) => Math.abs(al.evaluateHorizontal(s).curvature)),
  );
  // krajný bod prierezu na vnútornej strane oblúka má menší polomer
  const kEff = k * reach < 0.5 ? k / (1 - k * reach) : 2 * k;
  return chordStep(kEff, tol);
}

function verticalStep(al: Alignment, a: number, b: number, tol: number): number {
  const p = al.profile;
  if (!p || a < p.startS || b > p.endS) return Infinity;
  const d = Math.min(1e-6, (b - a) / 4);
  const k = Math.abs(al.elevation(b - d).grade - al.elevation(a + d).grade) / (b - a - 2 * d);
  return chordStep(k, tol);
}

/** Zakrivené úseky priebehov (parabola, kružnica): f'' ≈ 2·Δv / L² prepočítané na dĺžku. */
function lawStep(input: SamplingInput, a: number, b: number, tol: number): number {
  const st = input.alignment.stationing;
  const mid = st.toDisplay((a + b) / 2).station;
  let step = Infinity;
  for (const { law, unit } of input.laws) {
    if (law.kind !== 'piecewise') continue;
    for (const g of law.segments) {
      if (g.shape === 'linear' || mid < g.from || mid > g.to || !(g.to > g.from)) continue;
      const end = g.to - 1e-9;
      const v0 = evaluateLaw(law, unit, input.scope(g.from), g.from);
      const v1 = evaluateLaw(law, unit, input.scope(end), end);
      if (!v0.ok || !v1.ok) continue;
      const scale = unit === 'slope' || unit === 'angle' ? input.reach : 1;
      const k = (2 * Math.abs(v1.value - v0.value) * scale) / (g.to - g.from) ** 2;
      step = Math.min(step, chordStep(k, tol));
    }
  }
  return step;
}
