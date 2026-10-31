import type { Alignment, Stationing } from '@bridge/alignment';

export interface PlanSample {
  s: number;
  x: number;
  y: number;
}

export interface ProfileSample {
  s: number;
  z: number;
}

export interface StationTick {
  s: number;
  /** zobrazované staničenie [m] */
  station: number;
}

/** Body pôdorysu osi: priamky koncovými bodmi, oblúky a prechodnice s krokom ≤ `step` m. */
export function sampleHorizontal(alignment: Alignment, step = 1): PlanSample[] {
  const samples: PlanSample[] = [];
  const push = (s: number) => {
    const p = alignment.evaluateHorizontal(s).point;
    samples.push({ s, x: p.x, y: p.y });
  };
  for (const e of alignment.elements) {
    const n = e.kind === 'line' ? 1 : Math.max(2, Math.ceil((e.sEnd - e.sStart) / step));
    for (let i = 0; i < n; i++) push(e.sStart + ((e.sEnd - e.sStart) * i) / n);
  }
  push(alignment.length);
  return samples;
}

/** Body nivelety s krokom ≤ `step` m vrátane PVC/PVT; prázdne, ak os nemá niveletu. */
export function sampleProfile(alignment: Alignment, step = 1): ProfileSample[] {
  const profile = alignment.profile;
  if (!profile) return [];
  const stations = new Set<number>();
  const n = Math.max(1, Math.ceil((profile.endS - profile.startS) / step));
  for (let i = 0; i <= n; i++)
    stations.add(profile.startS + ((profile.endS - profile.startS) * i) / n);
  for (const k of profile.keyPoints) if (k.kind !== 'pvi') stations.add(k.s);
  return [...stations]
    .sort((a, b) => a - b)
    .map((s) => ({ s, z: alignment.elevation(s).z + alignment.origin.z }));
}

/** Staničenia so zobrazovaným staničením deliteľným `step` (rešpektuje skoky v staničení). */
export function stationTicks(
  stationing: Stationing,
  step: number,
  sMin = Number.NEGATIVE_INFINITY,
  sMax = Number.POSITIVE_INFINITY,
): StationTick[] {
  const ticks: StationTick[] = [];
  for (const r of stationing.regions) {
    const lo = Math.max(r.sStart, sMin);
    const hi = Math.min(r.sEnd, sMax);
    if (lo > hi) continue;
    const dLo = r.displayStart + (lo - r.sStart);
    const dHi = r.displayStart + (hi - r.sStart);
    for (let k = Math.ceil(dLo / step - 1e-9); k * step <= dHi + 1e-9; k++) {
      const station = k * step + 0; // + 0 odstráni −0
      const s = r.sStart + (station - r.displayStart);
      // na mieste skoku platí staničenie za skokom (ako v Stationing.toDisplay)
      const same = ticks.findIndex((t) => Math.abs(t.s - s) < 1e-9);
      if (same >= 0) ticks.splice(same, 1);
      ticks.push({ s, station });
    }
  }
  return ticks;
}
