/** Tolerancie geometrických operácií; geometrické funkcie ich dostávajú explicitne (CLAUDE.md). */
export interface Tolerance {
  /** dĺžková tolerancia [m] */
  readonly length: number;
  /** uhlová tolerancia [rad] */
  readonly angle: number;
}

/** Vnútorná konzistencia výpočtov (CLAUDE.md: ≤ 1e-6 m). */
export const DEFAULT_TOLERANCE: Tolerance = { length: 1e-6, angle: 1e-9 };
