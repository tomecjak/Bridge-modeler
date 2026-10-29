import type { Vec2 } from './vec.ts';

export const TWO_PI = 2 * Math.PI;

export const degToRad = (deg: number): number => (deg * Math.PI) / 180;
export const radToDeg = (rad: number): number => (rad * 180) / Math.PI;

/** Uhol do intervalu ⟨0, 2π). */
export function normalizeAngle(a: number): number {
  const r = a % TWO_PI;
  const n = r < 0 ? r + TWO_PI : r;
  return n >= TWO_PI ? 0 : n;
}

/** Najkratší rozdiel a − b so znamienkom, v intervale (−π, π⟩. */
export function angleDifference(a: number, b: number): number {
  const d = normalizeAngle(a - b);
  return d > Math.PI ? d - TWO_PI : d;
}

/**
 * Smerník (azimut) je uhol od osi +y (sever siete) v smere hodinových ručičiek (ADR 0003).
 * Jednotkový vektor smeru: (sin az, cos az).
 */
export const azimuthToVector = (azimuth: number): Vec2 => ({
  x: Math.sin(azimuth),
  y: Math.cos(azimuth),
});

export const vectorToAzimuth = (v: Vec2): number => normalizeAngle(Math.atan2(v.x, v.y));
