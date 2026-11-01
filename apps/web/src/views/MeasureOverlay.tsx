import type { Vec2 } from '@bridge/geom';
import type { MeasureHover } from './measure.ts';

/** Čiara merania s koncovými bodmi, značkou prichytenia a popisom v strede (súradnice sveta → obrazovka). */
export function MeasureOverlay({
  a,
  b,
  hover,
  toScreen,
  label,
}: {
  a: Vec2 | undefined;
  b: Vec2 | undefined;
  hover: MeasureHover | undefined;
  toScreen: (p: Vec2) => Vec2;
  label: string | undefined;
}) {
  const end = b ?? hover?.point;
  const p = a && toScreen(a);
  const q = end && toScreen(end);
  const h = hover && toScreen(hover.point);
  return (
    <g className="measure">
      {p && q && <line className="measure-line" x1={p.x} y1={p.y} x2={q.x} y2={q.y} />}
      {p && <circle className="measure-point" cx={p.x} cy={p.y} r={3.5} />}
      {b && q && <circle className="measure-point" cx={q.x} cy={q.y} r={3.5} />}
      {h && hover?.snapped && (
        <rect className="measure-snap" x={h.x - 5} y={h.y - 5} width={10} height={10} />
      )}
      {p && q && label && (
        <text
          className="measure-label"
          x={(p.x + q.x) / 2}
          y={(p.y + q.y) / 2 - 8}
          textAnchor="middle"
        >
          {label}
        </text>
      )}
    </g>
  );
}
