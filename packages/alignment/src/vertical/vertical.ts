import type { VerticalProfileData } from '../data.ts';
import { StationOutOfRangeError } from '../errors.ts';
import type { AlignmentIssue } from '../issues.ts';

export interface ProfilePoint {
  z: number;
  /** pozdĺžny sklon dz/ds [m/m] */
  grade: number;
}

export interface ProfileKeyPoint {
  kind: 'start' | 'pvc' | 'pvi' | 'pvt' | 'end';
  s: number;
  /** pre PVI výška vrcholu polygónu (priesečník tangent), inak výška na nivelete */
  z: number;
}

export interface VerticalProfile {
  readonly name: string;
  /** rozsah nivelety v spojitom staničení s [m] */
  readonly startS: number;
  readonly endS: number;
  readonly keyPoints: readonly ProfileKeyPoint[];
  evaluate(s: number): ProfilePoint;
}

interface Piece {
  s0: number;
  s1: number;
  at(s: number): ProfilePoint;
}

const RANGE_TOLERANCE = 1e-9;

const tangent = (s0: number, z0: number, g: number) => (s: number) => ({
  z: z0 + g * (s - s0),
  grade: g,
});

/** Symetrická parabola: z = z_PVC + g1·x + (g2 − g1)·x² / (2L). */
const parabola =
  (sIn: number, zIn: number, g1: number, g2: number, length: number) => (s: number) => {
    const x = s - sIn;
    const r = (g2 - g1) / length;
    return { z: zIn + g1 * x + (r * x * x) / 2, grade: g1 + r * x };
  };

/** Kružnicový výškový oblúk polomeru R dotýkajúci sa oboch tangent (presná kružnica v rovine s–z). */
function circle(sIn: number, zIn: number, a1: number, radius: number, sag: boolean) {
  const side = sag ? 1 : -1;
  const sc = sIn - side * radius * Math.sin(a1);
  const zc = zIn + side * radius * Math.cos(a1);
  return (s: number) => {
    const dx = s - sc;
    const root = Math.sqrt(Math.max(0, radius * radius - dx * dx));
    return { z: zc - side * root, grade: (side * dx) / root };
  };
}

/** Zostaví niveletu; staničenia PVI sú spojité (staStart + s). */
export function buildVertical(
  data: VerticalProfileData,
  staStart: number,
): { profile?: VerticalProfile; issues: AlignmentIssue[] } {
  const issues: AlignmentIssue[] = [];
  const pvis = data.pvis.map((p) => ({ ...p, s: p.station - staStart }));
  const ordered = pvis.every((p, i) => i === 0 || p.s > (pvis[i - 1] as { s: number }).s);
  if (pvis.length < 2 || !ordered) {
    issues.push({ code: 'InvalidProfile', severity: 'error', profile: data.name });
    return { issues };
  }

  const grades = pvis.slice(1).map((p, i) => {
    const prev = pvis[i] as (typeof pvis)[number];
    return (p.elevation - prev.elevation) / (p.s - prev.s);
  });
  const first = pvis[0] as (typeof pvis)[number];
  const last = pvis[pvis.length - 1] as (typeof pvis)[number];
  const pieces: Piece[] = [];
  const keyPoints: ProfileKeyPoint[] = [{ kind: 'start', s: first.s, z: first.elevation }];
  let cursor = { s: first.s, z: first.elevation, g: grades[0] as number };

  for (let i = 1; i < pvis.length - 1; i++) {
    const pvi = pvis[i] as (typeof pvis)[number];
    const g1 = grades[i - 1] as number;
    const g2 = grades[i] as number;
    const curve = pvi.curve;
    if (!curve || g1 === g2) continue;

    let sIn: number;
    let sOut: number;
    let at: (s: number) => ProfilePoint;
    if (curve.kind === 'parabolic') {
      sIn = pvi.s - curve.length / 2;
      sOut = pvi.s + curve.length / 2;
      at = parabola(sIn, pvi.elevation - (g1 * curve.length) / 2, g1, g2, curve.length);
    } else {
      const a1 = Math.atan(g1);
      const a2 = Math.atan(g2);
      const t = curve.radius * Math.tan(Math.abs(a2 - a1) / 2);
      sIn = pvi.s - t * Math.cos(a1);
      sOut = pvi.s + t * Math.cos(a2);
      at = circle(sIn, pvi.elevation - t * Math.sin(a1), a1, curve.radius, g2 > g1);
    }

    if (sIn < cursor.s - RANGE_TOLERANCE || sOut > last.s + RANGE_TOLERANCE) {
      issues.push({
        code: 'VerticalCurvesOverlap',
        severity: 'error',
        profile: data.name,
        station: pvi.station,
      });
      return { issues };
    }
    pieces.push({ s0: cursor.s, s1: sIn, at: tangent(cursor.s, cursor.z, cursor.g) });
    pieces.push({ s0: sIn, s1: sOut, at });
    const zOut = at(sOut).z;
    keyPoints.push(
      { kind: 'pvc', s: sIn, z: at(sIn).z },
      { kind: 'pvi', s: pvi.s, z: pvi.elevation },
      { kind: 'pvt', s: sOut, z: zOut },
    );
    cursor = { s: sOut, z: zOut, g: g2 };
  }
  pieces.push({ s0: cursor.s, s1: last.s, at: tangent(cursor.s, cursor.z, cursor.g) });
  keyPoints.push({ kind: 'end', s: last.s, z: last.elevation });
  return { profile: new PiecewiseProfile(data.name, pieces, keyPoints), issues };
}

class PiecewiseProfile implements VerticalProfile {
  readonly startS: number;
  readonly endS: number;
  readonly name: string;
  readonly keyPoints: readonly ProfileKeyPoint[];
  private readonly pieces: readonly Piece[];

  constructor(name: string, pieces: readonly Piece[], keyPoints: readonly ProfileKeyPoint[]) {
    this.name = name;
    this.pieces = pieces;
    this.keyPoints = keyPoints;
    this.startS = (pieces[0] as Piece).s0;
    this.endS = (pieces[pieces.length - 1] as Piece).s1;
  }

  evaluate(s: number): ProfilePoint {
    if (s < this.startS - RANGE_TOLERANCE || s > this.endS + RANGE_TOLERANCE) {
      throw new StationOutOfRangeError('profile', s, this.startS, this.endS);
    }
    let lo = 0;
    let hi = this.pieces.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((this.pieces[mid] as Piece).s0 <= s) lo = mid;
      else hi = mid - 1;
    }
    return (this.pieces[lo] as Piece).at(s);
  }
}
