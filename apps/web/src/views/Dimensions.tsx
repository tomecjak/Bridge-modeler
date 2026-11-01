import type { DimensionChain } from '@bridge/drawing';
import { type Vec2, vec2 } from '@bridge/geom';
import { formatNumber } from '../format/number.ts';
import { sk } from '../i18n/sk.ts';

/** Vzdialenosť riadkov kót [px]. */
const ROW_PX = 18;
/** Odstup prvého riadku od NK [px]. */
const GAP_PX = 16;
const TICK_PX = 4;

const label = (value: number) => formatNumber(value, 2);

/** Kóta medzi bodmi obrazovky p → q so šikmými značkami na koncoch a hodnotou nad čiarou (pozdĺž čiary). */
function DimensionLine({ p, q, value, title }: { p: Vec2; q: Vec2; value: number; title: string }) {
  if (Math.hypot(q.x - p.x, q.y - p.y) < 1) return null;
  return (
    <g>
      <title>{title}</title>
      <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} />
      {tick(p, q)}
      {tick(q, p)}
      <text
        transform={`translate(${(p.x + q.x) / 2} ${(p.y + q.y) / 2}) rotate(${readable(p, q)})`}
        y={-4}
        textAnchor="middle"
      >
        {label(value)}
      </text>
    </g>
  );
}

/**
 * Kóty mosta v pozdĺžnom profile (len na obrazovke, ADR 0012): nad NK rozpätia, dĺžka NK a celková dĺžka, pod NK
 * premostenie. `toX` prevedie staničenie osi cesty na x obrazovky; `top` a `bottom` sú y horného povrchu
 * a spodku NK na obrazovke.
 */
export function ProfileDimensions({
  chains,
  toX,
  top,
  bottom,
  height,
}: {
  chains: readonly DimensionChain[];
  toX: (s: number) => number | undefined;
  top: number;
  bottom: number;
  height: number;
}) {
  const rows: Record<DimensionChain['kind'], number> = {
    spans: top - GAP_PX,
    deck: top - GAP_PX - ROW_PX,
    overall: top - GAP_PX - 2 * ROW_PX,
    bridged: bottom + GAP_PX + 6,
  };
  return (
    <g className="dimensions">
      {chains.map((chain) => {
        const y = Math.min(height - 24, Math.max(24, rows[chain.kind]));
        const reference = chain.kind === 'bridged' ? bottom : top;
        return (
          <g key={chain.kind}>
            {chain.segments.map((seg) => {
              const x1 = toX(seg.sFrom);
              const x2 = toX(seg.sTo);
              if (x1 === undefined || x2 === undefined) return null;
              return (
                <g key={`${seg.sFrom}-${seg.sTo}`}>
                  {[x1, x2].map((x) => (
                    <line key={x} className="dim-extension" x1={x} y1={y} x2={x} y2={reference} />
                  ))}
                  <DimensionLine
                    p={vec2(x1, y)}
                    q={vec2(x2, y)}
                    value={seg.value}
                    title={sk.dimensions[chain.kind]}
                  />
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

/**
 * Kóty mosta v pôdoryse: reťazce rovnobežné s osou mosta mimo obrysu NK na strane `side` (+1 vpravo), od NK
 * premostenie, rozpätia, dĺžka NK a celková dĺžka. `pointAt(s, x)` = bod v odsadení x od osi mosta (svet).
 */
export function PlanDimensions({
  chains,
  pointAt,
  toScreen,
  side,
  reach,
  scale,
}: {
  chains: readonly DimensionChain[];
  pointAt: (s: number, x: number) => Vec2;
  toScreen: (p: Vec2) => Vec2;
  side: 1 | -1;
  /** najväčšia vzdialenosť okraja NK od osi mosta na strane kót [m] */
  reach: number;
  /** mierka pohľadu [px/m] */
  scale: number;
}) {
  const order: DimensionChain['kind'][] = ['bridged', 'spans', 'deck', 'overall'];
  return (
    <g className="dimensions">
      {chains.map((chain) => {
        const row = order.indexOf(chain.kind);
        const x = side * (reach + (GAP_PX + row * ROW_PX) / scale);
        return (
          <g key={chain.kind}>
            {chain.segments.map((seg) => {
              const n = Math.max(1, Math.ceil(Math.abs(seg.sTo - seg.sFrom)));
              const pts = Array.from({ length: n + 1 }, (_, k) =>
                toScreen(pointAt(seg.sFrom + ((seg.sTo - seg.sFrom) * k) / n, x)),
              );
              const midS = (seg.sFrom + seg.sTo) / 2;
              const a = toScreen(pointAt(midS - 0.5, x));
              const b = toScreen(pointAt(midS + 0.5, x));
              const mid = toScreen(pointAt(midS, x));
              return (
                <g key={`${seg.sFrom}-${seg.sTo}`}>
                  <title>{sk.dimensions[chain.kind]}</title>
                  <polyline
                    points={pts.map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' ')}
                  />
                  {[
                    [pts[0], pts[1]],
                    [pts[pts.length - 1], pts[pts.length - 2]],
                  ].map(([e, f]) => (e && f ? tick(e, f) : null))}
                  <text
                    transform={`translate(${mid.x} ${mid.y}) rotate(${readable(a, b)})`}
                    y={-4}
                    textAnchor="middle"
                  >
                    {label(seg.value)}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

/** Šikmá značka kóty v bode `e` (smer čiary k bodu `f`). */
function tick(e: Vec2, f: Vec2) {
  const len = Math.hypot(f.x - e.x, f.y - e.y) || 1;
  const tx = (f.x - e.x) / len;
  const ty = (f.y - e.y) / len;
  const sx = (tx - ty) * TICK_PX * Math.SQRT1_2;
  const sy = (ty + tx) * TICK_PX * Math.SQRT1_2;
  return (
    <line
      key={`${e.x},${e.y}`}
      className="dim-tick"
      x1={e.x - sx}
      y1={e.y - sy}
      x2={e.x + sx}
      y2={e.y + sy}
    />
  );
}

/** Uhol textu pozdĺž smeru a → b na obrazovke, otočený tak, aby sa dal čítať zľava doprava [°]. */
function readable(a: Vec2, b: Vec2): number {
  let angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle <= -90) angle += 180;
  return angle;
}

/**
 * Poloha kót NK v pôdoryse: bod v odsadení x od osi mosta na staničení s (kolmo na os cesty), strana mimo obrysu
 * (vpravo, ak je os mosta vpravo od osi cesty v strede NK `sMid`) a vzdialenosť okraja NK na tej strane.
 */
export function planFrame(
  road: {
    evaluateHorizontal: (s: number) => { point: Vec2; azimuth: number };
    length: number;
    project: (p: Vec2) => { s: number; offset: number } | undefined;
  },
  outline: { left: readonly Vec2[]; right: readonly Vec2[] },
  offsetAt: (s: number) => number,
  sMid: number,
): { pointAt: (s: number, x: number) => Vec2; side: 1 | -1; reach: number } {
  const side: 1 | -1 = offsetAt(sMid) > 0.01 ? 1 : -1;
  const reach = deckReach(outline, road, offsetAt);
  return {
    pointAt: (s, x) => {
      const r = road.evaluateHorizontal(Math.min(road.length, Math.max(0, s)));
      const h = offsetAt(s) + x;
      return vec2(r.point.x + h * Math.cos(r.azimuth), r.point.y - h * Math.sin(r.azimuth));
    },
    side,
    reach: side > 0 ? reach.right : reach.left,
  };
}

/**
 * Najväčšia vzdialenosť okraja NK od osi mosta vľavo a vpravo [m] (pre polohu kót v pôdoryse): okraje obrysu NK
 * premietnuté na os cesty, odsadenie mínus posun osi mosta.
 */
export function deckReach(
  outline: { left: readonly Vec2[]; right: readonly Vec2[] },
  road: { project: (p: Vec2) => { s: number; offset: number } | undefined },
  offsetAt: (s: number) => number,
): { left: number; right: number } {
  const reach = (points: readonly Vec2[], sign: number) =>
    Math.max(
      0,
      ...points.flatMap((p) => {
        const f = road.project(p);
        return f ? [sign * (f.offset - offsetAt(f.s))] : [];
      }),
    );
  return { left: reach(outline.left, -1), right: reach(outline.right, 1) };
}
