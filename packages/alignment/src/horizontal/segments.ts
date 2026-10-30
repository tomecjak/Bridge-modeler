import {
  azimuthToVector,
  distance2,
  dot2,
  integrateVec2,
  normalizeAngle,
  sub2,
  TWO_PI,
  type Vec2,
  vectorToAzimuth,
} from '@bridge/geom';

/** Najbližší bod úseku k zadanému bodu; `t` je dĺžka od začiatku úseku, orezaná na ⟨0, length⟩. */
export interface SegmentProjection {
  t: number;
  point: Vec2;
  distance: number;
}

/**
 * Prvok smerového vedenia v lokálnych súradniciach. `t` ∈ ⟨0, length⟩ je dĺžka od začiatku prvku.
 * Krivosť je znamienková: kladná pri otáčaní doprava (smerník rastie), záporná doľava.
 */
export interface HorizontalSegment {
  readonly kind: 'line' | 'arc' | 'spiral';
  readonly length: number;
  readonly start: Vec2;
  pointAt(t: number): Vec2;
  azimuthAt(t: number): number;
  curvatureAt(t: number): number;
  project(p: Vec2): SegmentProjection;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class LineSegment implements HorizontalSegment {
  readonly kind = 'line';
  readonly length: number;
  private readonly azimuth: number;
  private readonly dir: Vec2;

  constructor(
    readonly start: Vec2,
    end: Vec2,
  ) {
    this.length = distance2(start, end);
    this.azimuth = vectorToAzimuth(sub2(end, start));
    this.dir = azimuthToVector(this.azimuth);
  }

  pointAt(t: number): Vec2 {
    return { x: this.start.x + this.dir.x * t, y: this.start.y + this.dir.y * t };
  }

  azimuthAt(_t: number): number {
    return this.azimuth;
  }

  curvatureAt(_t: number): number {
    return 0;
  }

  project(p: Vec2): SegmentProjection {
    const t = clamp(dot2(sub2(p, this.start), this.dir), 0, this.length);
    const point = this.pointAt(t);
    return { t, point, distance: distance2(p, point) };
  }
}

export class ArcSegment implements HorizontalSegment {
  readonly kind = 'arc';
  /** +1 pre oblúk doprava (cw), −1 doľava (ccw) */
  private readonly sign: 1 | -1;
  /** smerník spojnice stred → začiatok */
  private readonly phi0: number;

  constructor(
    readonly start: Vec2,
    readonly center: Vec2,
    readonly radius: number,
    rotation: 'cw' | 'ccw',
    readonly length: number,
  ) {
    this.sign = rotation === 'cw' ? 1 : -1;
    this.phi0 = vectorToAzimuth(sub2(start, center));
  }

  pointAt(t: number): Vec2 {
    const phi = this.phi0 + (this.sign * t) / this.radius;
    return {
      x: this.center.x + this.radius * Math.sin(phi),
      y: this.center.y + this.radius * Math.cos(phi),
    };
  }

  azimuthAt(t: number): number {
    return normalizeAngle(this.phi0 + (this.sign * t) / this.radius + (this.sign * Math.PI) / 2);
  }

  curvatureAt(_t: number): number {
    return this.sign / this.radius;
  }

  project(p: Vec2): SegmentProjection {
    const phi = vectorToAzimuth(sub2(p, this.center));
    const t = normalizeAngle(this.sign * (phi - this.phi0)) * this.radius;
    if (t <= this.length) {
      const point = this.pointAt(t);
      return { t, point, distance: distance2(p, point) };
    }
    // mimo oblúka: bližší z koncových bodov (pozor na prechod cez 2π)
    const full = TWO_PI * this.radius;
    const end = this.pointAt(this.length);
    const start = this.start;
    const useEnd = t - this.length < full - t ? distance2(p, end) <= distance2(p, start) : false;
    return useEnd
      ? { t: this.length, point: end, distance: distance2(p, end) }
      : { t: 0, point: start, distance: distance2(p, start) };
  }
}

/** Dĺžka kroku kvadratúry [m]; 8-bodová Gauss–Legendre na 5 m úseku má chybu ≪ 0,01 mm. */
const SPIRAL_STEP = 5;

/**
 * Klotoida s lineárnou zmenou krivosti z k0 na k1 po dĺžke L (aj čiastková medzi dvoma polomermi).
 * Smerník je kvadratický polynóm v t, poloha je integrál jednotkového vektora smeru.
 */
export class SpiralSegment implements HorizontalSegment {
  readonly kind = 'spiral';
  private readonly dk: number;

  constructor(
    readonly start: Vec2,
    readonly startAzimuth: number,
    readonly length: number,
    readonly k0: number,
    readonly k1: number,
  ) {
    this.dk = (k1 - k0) / length;
  }

  private rawAzimuth(t: number): number {
    return this.startAzimuth + this.k0 * t + (this.dk * t * t) / 2;
  }

  pointAt(t: number): Vec2 {
    if (t === 0) return this.start;
    const d = integrateVec2(
      (u) => azimuthToVector(this.rawAzimuth(u)),
      0,
      t,
      Math.max(1, Math.ceil(Math.abs(t) / SPIRAL_STEP)),
    );
    return { x: this.start.x + d.x, y: this.start.y + d.y };
  }

  azimuthAt(t: number): number {
    return normalizeAngle(this.rawAzimuth(t));
  }

  curvatureAt(t: number): number {
    return this.k0 + this.dk * t;
  }

  project(p: Vec2): SegmentProjection {
    // hrubé vzorkovanie, potom Newton na g(t) = (P(t) − p) · T(t) = 0
    const samples = Math.max(8, Math.ceil(this.length / 2));
    let bestT = 0;
    let bestD = Number.POSITIVE_INFINITY;
    for (let i = 0; i <= samples; i++) {
      const t = (this.length * i) / samples;
      const d = distance2(p, this.pointAt(t));
      if (d < bestD) {
        bestD = d;
        bestT = t;
      }
    }
    let t = bestT;
    for (let iter = 0; iter < 20; iter++) {
      const az = this.rawAzimuth(t);
      const tangent = azimuthToVector(az);
      const r = sub2(this.pointAt(t), p);
      const g = dot2(r, tangent);
      // dT/dt = κ · (cos az, −sin az)
      const dg = 1 + this.curvatureAt(t) * (r.x * Math.cos(az) - r.y * Math.sin(az));
      const next = clamp(t - g / dg, 0, this.length);
      if (Math.abs(next - t) < 1e-12) {
        t = next;
        break;
      }
      t = next;
    }
    const point = this.pointAt(t);
    return { t, point, distance: distance2(p, point) };
  }
}
