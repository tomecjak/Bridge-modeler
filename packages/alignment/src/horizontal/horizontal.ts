import { angleDifference, distance2, sub2, type Vec2 } from '@bridge/geom';
import type { HorizontalElementData } from '../data.ts';
import { StationOutOfRangeError } from '../errors.ts';
import type { AlignmentIssue } from '../issues.ts';
import { ArcSegment, type HorizontalSegment, LineSegment, SpiralSegment } from './segments.ts';

export interface HorizontalPoint {
  point: Vec2;
  azimuth: number;
  curvature: number;
}

export interface HorizontalProjection {
  s: number;
  /** odsadenie od osi, kladné vpravo v smere staničenia [m] */
  offset: number;
  point: Vec2;
}

export interface HorizontalAlignment {
  readonly length: number;
  readonly segments: readonly HorizontalSegment[];
  /** staničenia `s` začiatkov prvkov a konca osi (dĺžka segments + 1) */
  readonly boundaries: readonly number[];
  evaluate(s: number): HorizontalPoint;
  project(p: Vec2): HorizontalProjection | undefined;
}

/** Odchýlka koncového bodu prvku, nad ktorou sa hlási nesúlad s LandXML [m]. */
const POSITION_TOLERANCE = 1e-3;
/** Zlom smeru na styku prvkov, nad ktorým sa hlási nesúlad [rad]. */
const DIRECTION_TOLERANCE = 1e-5;
/** Tolerancia staničenia na koncoch osi [m]. */
const RANGE_TOLERANCE = 1e-9;

const toLocal = (p: Vec2, origin: Vec2): Vec2 => sub2(p, origin);

function createSegment(e: HorizontalElementData, origin: Vec2): HorizontalSegment {
  const start = toLocal(e.start, origin);
  switch (e.kind) {
    case 'line':
      return new LineSegment(start, toLocal(e.end, origin));
    case 'arc':
      return new ArcSegment(start, toLocal(e.center, origin), e.radius, e.rotation, e.length);
    case 'spiral': {
      const sign = e.rotation === 'cw' ? 1 : -1;
      const k0 = e.radiusStart === null ? 0 : sign / e.radiusStart;
      const k1 = e.radiusEnd === null ? 0 : sign / e.radiusEnd;
      return new SpiralSegment(start, e.startAzimuth, e.length, k0, k1);
    }
  }
}

/**
 * Zostaví smerové vedenie v lokálnych súradniciach. Každý prvok začína v bode `start` z dát;
 * nesúlad vypočítaného konca s `end` alebo zlom smeru na styku sa hlási ako varovanie.
 */
export function buildHorizontal(
  elements: readonly HorizontalElementData[],
  origin: Vec2,
  declaredLength: number,
): { horizontal: HorizontalAlignment; issues: AlignmentIssue[] } {
  const segments = elements.map((e) => createSegment(e, origin));
  const issues: AlignmentIssue[] = [];
  const boundaries = [0];
  segments.forEach((seg, i) => {
    boundaries.push((boundaries[i] as number) + seg.length);
    const declaredEnd = toLocal((elements[i] as HorizontalElementData).end, origin);
    const deviation = distance2(seg.pointAt(seg.length), declaredEnd);
    if (deviation > POSITION_TOLERANCE) {
      issues.push({ code: 'GeometryMismatch', severity: 'warning', index: i, deviation });
    }
    const next = segments[i + 1];
    if (next) {
      const jump = Math.abs(angleDifference(next.azimuthAt(0), seg.azimuthAt(seg.length)));
      if (jump > DIRECTION_TOLERANCE) {
        issues.push({
          code: 'DirectionMismatch',
          severity: 'warning',
          index: i + 1,
          deviation: jump,
        });
      }
    }
  });
  const length = boundaries[boundaries.length - 1] as number;
  if (Math.abs(length - declaredLength) > POSITION_TOLERANCE) {
    issues.push({
      code: 'LengthMismatch',
      severity: 'warning',
      declared: declaredLength,
      computed: length,
    });
  }
  return { horizontal: new ChainedHorizontal(segments, boundaries), issues };
}

class ChainedHorizontal implements HorizontalAlignment {
  readonly length: number;
  readonly segments: readonly HorizontalSegment[];
  readonly boundaries: readonly number[];

  constructor(segments: readonly HorizontalSegment[], boundaries: readonly number[]) {
    this.segments = segments;
    this.boundaries = boundaries;
    this.length = boundaries[boundaries.length - 1] as number;
  }

  /** Index prvku pre staničenie; na styku platí nasledujúci prvok (okrem konca osi). */
  private indexAt(s: number): number {
    let lo = 0;
    let hi = this.segments.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((this.boundaries[mid] as number) <= s) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  evaluate(s: number): HorizontalPoint {
    if (s < -RANGE_TOLERANCE || s > this.length + RANGE_TOLERANCE) {
      throw new StationOutOfRangeError('alignment', s, 0, this.length);
    }
    const i = this.indexAt(s);
    const seg = this.segments[i] as HorizontalSegment;
    const t = Math.min(seg.length, Math.max(0, s - (this.boundaries[i] as number)));
    return { point: seg.pointAt(t), azimuth: seg.azimuthAt(t), curvature: seg.curvatureAt(t) };
  }

  project(p: Vec2): HorizontalProjection | undefined {
    let best: { i: number; t: number; point: Vec2; distance: number } | undefined;
    this.segments.forEach((seg, i) => {
      const r = seg.project(p);
      if (!best || r.distance < best.distance) best = { i, ...r };
    });
    if (!best) return undefined;
    const seg = this.segments[best.i] as HorizontalSegment;
    const az = seg.azimuthAt(best.t);
    const d = sub2(p, best.point);
    const along = d.x * Math.sin(az) + d.y * Math.cos(az);
    // pred začiatkom alebo za koncom osi päta kolmice neexistuje
    const atStart = best.i === 0 && best.t === 0 && along < -RANGE_TOLERANCE;
    const atEnd =
      best.i === this.segments.length - 1 && best.t === seg.length && along > RANGE_TOLERANCE;
    if (atStart || atEnd) return undefined;
    const offset = d.x * Math.cos(az) - d.y * Math.sin(az);
    return { s: (this.boundaries[best.i] as number) + best.t, offset, point: best.point };
  }
}
