import type { Vec3 } from './vec.ts';

/**
 * Lokálny rámec na osi.
 * - `tangent`: jednotkový vektor v smere staničenia vrátane pozdĺžneho sklonu,
 * - `normal`: vodorovný jednotkový vektor kolmo na os, **vpravo** v smere staničenia,
 * - `binormal = normal × tangent`: kolmo na obe, smeruje nahor.
 * Zodpovedá rámcu prierezu (x vpravo, y nahor), ADR 0003.
 */
export interface Frame {
  readonly origin: Vec3;
  readonly tangent: Vec3;
  readonly normal: Vec3;
  readonly binormal: Vec3;
}

/** Rámec z azimutu (rad, ADR 0003) a pozdĺžneho sklonu (m/m). */
export function frameFromAzimuthGrade(origin: Vec3, azimuth: number, grade: number): Frame {
  const sa = Math.sin(azimuth);
  const ca = Math.cos(azimuth);
  const k = 1 / Math.sqrt(1 + grade * grade);
  const tangent = { x: sa * k, y: ca * k, z: grade * k };
  const normal = { x: ca, y: -sa, z: 0 };
  const binormal = {
    x: normal.y * tangent.z,
    y: -normal.x * tangent.z,
    z: normal.x * tangent.y - normal.y * tangent.x,
  };
  return { origin, tangent, normal, binormal };
}
