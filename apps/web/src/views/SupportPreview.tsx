import type { SupportType } from '@bridge/model';
import { useMemo } from 'react';

const W = 132;
const H = 60;
const PAD = 4;

/** Číslo z výrazu, inak náhradná hodnota (náhľad nevyhodnocuje parametre projektu). */
const num = (text: string, fallback: number) => {
  const v = Number(text);
  return Number.isFinite(v) ? v : fallback;
};

type Rect = [x: number, y: number, w: number, h: number];

/**
 * Obdĺžniky náhľadu v metroch (x vodorovne, y nahor od hornej hrany základu): pilier v pohľade v osi podpery (stena
 * alebo stĺpy na základe), opora v reze v osi mosta (prah, múrik a driek alebo monolitická stena na základe).
 */
function rects(type: SupportType): Rect[] {
  const g = type.geometry;
  const f = type.footing;
  const height = Math.min(
    Math.max(type.foundation.mode === 'height' ? num(type.foundation.height, 6) : 6, 1),
    12,
  );
  const tf = num(f.thickness, 0);
  const out: Rect[] = [];
  if (g.type === 'abutment') {
    if (g.construction === 'monolithic') {
      const ts = num(g.wallThickness, 1.2);
      out.push([-ts / 2, 0, ts, height]);
    } else {
      const t = num(g.backwallThickness, 0.5);
      const seat = t + num(g.gap, 0.08) + num(g.endOffset, 0.5) + num(g.frontOffset, 0.9);
      const hp = Math.min(num(g.seatHeight, 1.1), height);
      const x0 = -seat / 2;
      out.push([x0, height - hp, seat, hp], [x0, height, t, 1.5]);
      const stem = num(g.stemThickness, 1.2);
      if (height - hp > 1e-3) out.push([x0 + seat - stem, 0, stem, height - hp]);
    }
    if (tf > 0) {
      const wf = num(f.width, 4);
      out.push([-wf / 2, -tf, wf, tf]);
    }
    return out;
  }
  if (g.type === 'wall') {
    const length = num(g.length, 4);
    out.push([-length / 2, 0, length, height]);
  } else {
    const count = Math.max(1, Math.round(num(g.count, 2)));
    const width = g.shape === 'circle' ? num(g.diameter, 1.2) : num(g.width, 1.2);
    const spacing = num(g.spacing, 4);
    for (let i = 0; i < count; i++) {
      const x = (i - (count - 1) / 2) * spacing;
      out.push([x - width / 2, 0, width, height]);
    }
  }
  if (tf > 0) {
    const lf = num(f.length, 8);
    out.push([-lf / 2, -tf, lf, tf]);
  }
  return out;
}

/** Náhľad typu podpery (knižnica podpier, ADR 0019): pilier v pohľade v osi podpery, opora v reze v osi mosta. */
export function SupportPreview({ type, label }: { type: SupportType; label: string }) {
  const shapes = useMemo(() => {
    const list = rects(type);
    const minX = Math.min(...list.map((r) => r[0]));
    const maxX = Math.max(...list.map((r) => r[0] + r[2]));
    const minY = Math.min(...list.map((r) => r[1]));
    const maxY = Math.max(...list.map((r) => r[1] + r[3]));
    const k = Math.min((W - 2 * PAD) / (maxX - minX || 1), (H - 2 * PAD) / (maxY - minY || 1));
    const ox = (W - k * (maxX - minX)) / 2;
    const oy = (H - k * (maxY - minY)) / 2;
    return list.map(([x, y, w, h]) => ({
      x: ox + k * (x - minX),
      y: oy + k * (maxY - y - h),
      w: k * w,
      h: k * h,
    }));
  }, [type]);
  return (
    <svg
      className="profile-thumb support-thumb"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
    >
      {shapes.map((r) => (
        <rect
          key={`${r.x.toFixed(1)}:${r.y.toFixed(1)}`}
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
        />
      ))}
    </svg>
  );
}
