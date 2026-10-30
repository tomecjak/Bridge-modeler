import type { StationEquationData } from '../data.ts';

export interface DisplayStation {
  /** zobrazované staničenie [m] */
  station: number;
  /** index úseku medzi skokmi v staničení (0 = od začiatku osi po prvý skok) */
  region: number;
}

export interface StationRegion {
  sStart: number;
  sEnd: number;
  displayStart: number;
  displayEnd: number;
}

export interface Stationing {
  readonly regions: readonly StationRegion[];
  toDisplay(s: number): DisplayStation;
  /** `s` pre zobrazované staničenie; pri prekryve prvé riešenie alebo riešenie v úseku `region`. */
  fromDisplay(station: number, region?: number): number | undefined;
  /** všetky `s` so zadaným zobrazovaným staničením (pri skoku späť ich môže byť viac) */
  fromDisplayAll(station: number): number[];
}

const TOLERANCE = 1e-9;

/**
 * Prevod spojitého staničenia `s` ↔ zobrazované staničenie so skokmi (LandXML `StaEquation`).
 * `staInternal` je spojité staničenie miesta skoku (staStart + s).
 */
export function createStationing(
  staStart: number,
  length: number,
  equations: readonly StationEquationData[],
): Stationing {
  const sorted = [...equations].sort((a, b) => a.staInternal - b.staInternal);
  const regions: StationRegion[] = [];
  let sStart = 0;
  let displayStart = staStart;
  for (const eq of sorted) {
    const sEnd = eq.staInternal - staStart;
    regions.push({ sStart, sEnd, displayStart, displayEnd: displayStart + (sEnd - sStart) });
    sStart = sEnd;
    displayStart = eq.staAhead;
  }
  regions.push({
    sStart,
    sEnd: length,
    displayStart,
    displayEnd: displayStart + (length - sStart),
  });

  const regionOf = (s: number) => {
    for (let i = regions.length - 1; i > 0; i--) {
      if (s >= (regions[i] as StationRegion).sStart) return i;
    }
    return 0;
  };

  const inRegion = (station: number, i: number): number | undefined => {
    const r = regions[i];
    if (!r) return undefined;
    if (station < r.displayStart - TOLERANCE || station > r.displayEnd + TOLERANCE)
      return undefined;
    return r.sStart + (station - r.displayStart);
  };

  return {
    regions,
    toDisplay(s) {
      const region = regionOf(s);
      const r = regions[region] as StationRegion;
      return { station: r.displayStart + (s - r.sStart), region };
    },
    fromDisplay(station, region) {
      if (region !== undefined) return inRegion(station, region);
      return this.fromDisplayAll(station)[0];
    },
    fromDisplayAll(station) {
      const result: number[] = [];
      regions.forEach((_, i) => {
        const s = inRegion(station, i);
        // koniec úseku = začiatok ďalšieho; rovnaké s nepočítame dvakrát
        if (s !== undefined && !result.some((x) => Math.abs(x - s) < TOLERANCE)) result.push(s);
      });
      return result;
    },
  };
}
