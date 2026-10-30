import type { ParameterUnit } from '@bridge/model';

/** Hodnota výrazu (m, °, m/m) → číslo v zobrazovaných jednotkách (mm, °, %), pre grafy. */
export function toDisplayUnits(unit: ParameterUnit, value: number): number {
  return unit === 'length' ? value * 1000 : unit === 'slope' ? value * 100 : value;
}

export const DISPLAY_UNIT_LABEL: Record<ParameterUnit, string> = {
  length: 'mm',
  angle: '°',
  slope: '%',
  none: '',
};
