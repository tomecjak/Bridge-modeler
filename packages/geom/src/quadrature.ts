import type { Vec2 } from './vec.ts';

// 8-bodová Gauss–Legendreova kvadratúra na ⟨−1, 1⟩ (presná pre polynómy do stupňa 15).
const NODES = [
  -0.9602898564975363, -0.7966664774136267, -0.525532409916329, -0.1834346424956498,
  0.1834346424956498, 0.525532409916329, 0.7966664774136267, 0.9602898564975363,
];
const WEIGHTS = [
  0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.362683783378362, 0.362683783378362,
  0.3137066458778873, 0.2223810344533745, 0.1012285362903763,
];

/** ∫ f(t) dt na ⟨a, b⟩ zloženou kvadratúrou s `segments` rovnakými úsekmi. */
export function integrate(
  f: (t: number) => number,
  a: number,
  b: number,
  segments: number,
): number {
  const h = (b - a) / segments;
  let sum = 0;
  for (let i = 0; i < segments; i++) {
    const mid = a + (i + 0.5) * h;
    for (let j = 0; j < 8; j++) {
      sum += (WEIGHTS[j] as number) * f(mid + (NODES[j] as number) * (h / 2));
    }
  }
  return (sum * h) / 2;
}

/** Ako {@link integrate}, pre vektorovú funkciu (po zložkách, jedno vyhodnotenie f na uzol). */
export function integrateVec2(
  f: (t: number) => Vec2,
  a: number,
  b: number,
  segments: number,
): Vec2 {
  const h = (b - a) / segments;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < segments; i++) {
    const mid = a + (i + 0.5) * h;
    for (let j = 0; j < 8; j++) {
      const v = f(mid + (NODES[j] as number) * (h / 2));
      const w = WEIGHTS[j] as number;
      sx += w * v.x;
      sy += w * v.y;
    }
  }
  return { x: (sx * h) / 2, y: (sy * h) / 2 };
}
