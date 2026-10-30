import { type Vec2, vec2 } from '@bridge/geom';
import type { AlignmentData, HorizontalElementData } from '../data.ts';
import { ArcSegment, LineSegment, SpiralSegment } from '../horizontal/segments.ts';

/**
 * Syntetická os so známou geometriou (pre testy v CI, bez reálnych podkladov):
 * priamka 50 m → klotoida 60 m (∞ → R 250 doprava) → oblúk 80 m → klotoida 60 m → priamka 40 m
 * → inflexia: klotoida 45 m doľava (∞ → 180) → oblúk 30 m → klotoida 45 m → priamka 25 m.
 */
export function syntheticAlignmentData(
  origin: Vec2 = vec2(-600000, -1200000),
  staStart = 0,
): AlignmentData {
  const elements: HorizontalElementData[] = [];
  let p = vec2(origin.x + 123.456, origin.y + 78.9);
  let az = 0.6;

  const line = (length: number) => {
    const end = vec2(p.x + length * Math.sin(az), p.y + length * Math.cos(az));
    const seg = new LineSegment(p, end);
    elements.push({ kind: 'line', length, start: p, end });
    p = end;
    az = seg.azimuthAt(0);
  };
  const spiral = (length: number, rStart: number | null, rEnd: number | null, cw: boolean) => {
    const sign = cw ? 1 : -1;
    const k0 = rStart === null ? 0 : sign / rStart;
    const k1 = rEnd === null ? 0 : sign / rEnd;
    const seg = new SpiralSegment(p, az, length, k0, k1);
    const end = seg.pointAt(length);
    elements.push({
      kind: 'spiral',
      spiralType: 'clothoid',
      length,
      start: p,
      end,
      startAzimuth: az,
      radiusStart: rStart,
      radiusEnd: rEnd,
      rotation: cw ? 'cw' : 'ccw',
    });
    p = end;
    az = seg.azimuthAt(length);
  };
  const arc = (length: number, radius: number, cw: boolean) => {
    const sign = cw ? 1 : -1;
    const center = vec2(p.x + sign * radius * Math.cos(az), p.y - sign * radius * Math.sin(az));
    const seg = new ArcSegment(p, center, radius, cw ? 'cw' : 'ccw', length);
    const end = seg.pointAt(length);
    elements.push({
      kind: 'arc',
      length,
      start: p,
      end,
      center,
      radius,
      rotation: cw ? 'cw' : 'ccw',
    });
    p = end;
    az = seg.azimuthAt(length);
  };

  line(50);
  spiral(60, null, 250, true);
  arc(80, 250, true);
  spiral(60, 250, null, true);
  line(40);
  spiral(45, null, 180, false);
  arc(30, 180, false);
  spiral(45, 180, null, false);
  line(25);

  return {
    name: 'Synthetic',
    staStart,
    length: elements.reduce((sum, e) => sum + e.length, 0),
    horizontal: elements,
    stationEquations: [],
    profiles: [],
  };
}
