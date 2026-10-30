import type { ParameterUnit } from '@bridge/model';
import { formatNumber } from './number.ts';

/**
 * Hodnota parametra z jednotiek výrazu (m, °, m/m; ADR 0006) do zobrazovaných jednotiek UI:
 * dĺžka v mm, uhol v °, sklon v %.
 */
export function formatParameterValue(unit: ParameterUnit, value: number): string {
  switch (unit) {
    case 'length':
      return `${formatNumber(value * 1000, 1)} mm`;
    case 'angle':
      return `${formatNumber(value, 4)} °`;
    case 'slope':
      return `${formatNumber(value * 100, 3)} %`;
    case 'none':
      return formatNumber(value, 4);
  }
}
