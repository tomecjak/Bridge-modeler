/** 2D vektor v lokálnych súradniciach (x = E, y = N) alebo v rovine prierezu. */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const vec2 = (x: number, y: number): Vec2 => ({ x, y });
export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export const add2 = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub2 = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale2 = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
export const dot2 = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
/** z-zložka vektorového súčinu; kladná, ak je b proti smeru hodín od a. */
export const cross2 = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const length2 = (a: Vec2): number => Math.hypot(a.x, a.y);
export const distance2 = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const normalize2 = (a: Vec2): Vec2 => scale2(a, 1 / length2(a));

/** Otočenie o uhol v rad, kladný uhol proti smeru hodinových ručičiek. */
export function rotate2(a: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
}

export const add3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale3 = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const dot3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross3 = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const length3 = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const normalize3 = (a: Vec3): Vec3 => scale3(a, 1 / length3(a));
