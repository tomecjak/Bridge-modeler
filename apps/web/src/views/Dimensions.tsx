import type { DimensionChain, DimensionSegment } from '@bridge/drawing';
import { type Vec2, vec2 } from '@bridge/geom';
import { useState } from 'react';
import { formatNumber } from '../format/number.ts';
import { sk } from '../i18n/sk.ts';

/** Odstup prvého radu kót od konštrukcie [px] (návrh popisov, ADR 0025). */
const GAP_PX = 40;
/** Vzdialenosť radov kót [px]. */
const ROW_PX = 28;
/** Presah vynášacej čiary pod prvý rad a nad najvyšší rad, ktorý bod používa [px]. */
const EXT_PX = 6;
/** Odstup krúžku osi uloženia nad najvyšším radom [px] a jeho polomer. */
const MARKER_GAP_PX = 22;
const MARKER_R = 9;
const TICK_PX = 4;
/** Výška pásu s nadpisom pohľadu, do ktorého popisy nezasahujú [px]. */
const TITLE_PX = 44;
/** Odhad šírky znaku čísla kóty (IBM Plex Mono 11 px) a voľné miesto okolo textu [px]. */
const CHAR_PX = 6.7;
const TEXT_PAD_PX = 8;

/** Os uloženia nad kótami: spojité staničenie, číslo v krúžku a id osi (popis z výkresu sa skryje). */
export interface DimensionMarker {
  s: number;
  /** zobrazované staničenie (tabuľka pod profilom) */
  station: number;
  label: string;
  id: string;
}

/** Poradie radov od konštrukcie (návrh popisov): polia, dĺžka NK, celková dĺžka, premostenie. */
const ROW_ORDER: readonly DimensionChain['kind'][] = ['spans', 'deck', 'overall', 'bridged'];

/** Rady prítomných reťazcov nad konštrukciou (bez medzier za chýbajúce reťazce). */
export function chainRows(chains: readonly DimensionChain[]): Map<DimensionChain['kind'], number> {
  const kinds = ROW_ORDER.filter((k) => chains.some((c) => c.kind === k));
  return new Map(kinds.map((k, i) => [k, i]));
}

/** Šírka textu kóty na obrazovke [px] (odhad pre rozhodnutie, či sa zmestí). */
export function textWidth(value: number): number {
  return label(value).length * CHAR_PX + TEXT_PAD_PX;
}

/**
 * Kde kresliť text úseku dĺžky `length` px (čistá funkcia, návrh popisov): v strede, mimo kóty na začiatku alebo
 * na konci (krajné krátke úseky) alebo nekresliť (krátky vnútorný úsek).
 */
export function textPlacement(
  length: number,
  value: number,
  index: number,
  count: number,
): 'inside' | 'before' | 'after' | 'hidden' {
  if (textWidth(value) <= length) return 'inside';
  if (count > 1 && index === 0) return 'before';
  if (count > 1 && index === count - 1) return 'after';
  return 'hidden';
}

/** Rad sa ukáže, ak sa aspoň polovica jeho textov zmestí do kót (inak je pri tomto priblížení len šum). */
export function rowVisible(lengths: readonly number[], values: readonly number[]): boolean {
  if (lengths.length === 0) return false;
  const fit = lengths.filter((l, i) => textWidth(values[i] ?? 0) <= l).length;
  return fit * 2 >= lengths.length;
}

const label = (value: number) => formatNumber(value, 2);

/** Úprava rozpätia kliknutím na jeho kótu: úsek a bod textu na obrazovke (ADR 0017). */
export type EditSpan = (segment: DimensionSegment, at: Vec2) => void;

/** Text kóty; pri úseku poľa s `onEdit` sa dá kliknúť (otvorí zadanie rozpätia). */
function DimensionText({
  at,
  angle,
  segment,
  onEdit,
  anchor = 'middle',
}: {
  at: Vec2;
  angle: number;
  segment: DimensionSegment;
  onEdit: EditSpan | undefined;
  anchor?: 'middle' | 'start' | 'end';
}) {
  const editable = onEdit && segment.span !== undefined;
  return (
    <text
      transform={`translate(${at.x} ${at.y}) rotate(${angle})`}
      y={-5}
      x={anchor === 'start' ? 6 : anchor === 'end' ? -6 : 0}
      textAnchor={anchor}
      className={editable ? 'dim-editable' : undefined}
      onPointerDown={
        editable
          ? (e) => {
              e.stopPropagation();
              onEdit(segment, at);
            }
          : undefined
      }
    >
      {label(segment.value)}
    </text>
  );
}

/**
 * Kóta medzi bodmi obrazovky p → q so šikmými značkami a hodnotou nad čiarou. Text je v strede viditeľnej časti
 * (kóta väčšia než výrez má text pripnutý do výrezu), krátka krajná kóta má text mimo, krátka vnútorná bez textu.
 */
function DimensionLine({
  p,
  q,
  segment,
  title,
  onEdit,
  index,
  count,
  clip,
}: {
  p: Vec2;
  q: Vec2;
  segment: DimensionSegment;
  title: string;
  onEdit: EditSpan | undefined;
  index: number;
  count: number;
  /** viditeľný rozsah x na obrazovke (vodorovné kóty v profile) */
  clip?: { from: number; to: number } | undefined;
}) {
  const length = Math.hypot(q.x - p.x, q.y - p.y);
  if (length < 1) return null;
  const placement = textPlacement(length, segment.value, index, count);
  const angle = readable(p, q);
  let text: { at: Vec2; anchor: 'middle' | 'start' | 'end' } | undefined;
  if (placement === 'inside') {
    const lo = clip ? Math.max(Math.min(p.x, q.x), clip.from) : Math.min(p.x, q.x);
    const hi = clip ? Math.min(Math.max(p.x, q.x), clip.to) : Math.max(p.x, q.x);
    const pinned = clip !== undefined && hi - lo < length - 1;
    if (!pinned) text = { at: vec2((p.x + q.x) / 2, (p.y + q.y) / 2), anchor: 'middle' };
    else if (hi - lo >= textWidth(segment.value)) {
      const t = ((lo + hi) / 2 - p.x) / (q.x - p.x || 1);
      text = { at: vec2((lo + hi) / 2, p.y + (q.y - p.y) * t), anchor: 'middle' };
    }
  } else if (placement !== 'hidden') {
    // pred začiatkom alebo za koncom kóty, v smere čítania
    const first = placement === 'before';
    const end = first ? (p.x <= q.x ? p : q) : p.x <= q.x ? q : p;
    text = { at: end, anchor: first ? 'end' : 'start' };
  }
  return (
    <g>
      <title>{title}</title>
      <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} />
      {tick(p, q)}
      {tick(q, p)}
      {text && (
        <DimensionText
          at={text.at}
          angle={angle}
          segment={segment}
          onEdit={onEdit}
          anchor={text.anchor}
        />
      )}
    </g>
  );
}

/** Os uloženia nad kótami: číslo v krúžku a čiarkovaná os ku konštrukcii (návrh popisov, ADR 0025). */
function Marker({ at, to, label }: { at: Vec2; to: Vec2; label: string }) {
  const len = Math.hypot(to.x - at.x, to.y - at.y) || 1;
  const ux = (to.x - at.x) / len;
  const uy = (to.y - at.y) / len;
  return (
    <g className="dim-marker">
      <line
        className="dim-marker-axis"
        x1={at.x + ux * MARKER_R}
        y1={at.y + uy * MARKER_R}
        x2={to.x}
        y2={to.y}
      />
      <circle cx={at.x} cy={at.y} r={MARKER_R} />
      <text x={at.x} y={at.y} textAnchor="middle" dominantBaseline="central">
        {label}
      </text>
    </g>
  );
}

/** Značky osí uloženia, ktoré nie sú bližšie ako priemer krúžku (pri oddialení sa riedia). */
function spacedMarkers<T extends { x: number }>(items: readonly T[]): T[] {
  const out: T[] = [];
  for (const item of [...items].sort((a, b) => a.x - b.x)) {
    const prev = out[out.length - 1];
    if (!prev || item.x - prev.x >= 2 * MARKER_R + 4) out.push(item);
  }
  return out;
}

/**
 * Pole na zadanie rozpätia na mieste textu kóty (m, desatinná čiarka aj bodka): Enter potvrdí, Esc a odchod zruší.
 */
export function SpanInput({
  at,
  value,
  onCommit,
  onCancel,
}: {
  at: Vec2;
  value: number;
  onCommit: (length: number) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(formatNumber(value, 2));
  const length = Number(text.trim().replace(',', '.'));
  const valid = Number.isFinite(length) && length > 0;
  return (
    <input
      className="dim-input"
      style={{ left: at.x, top: at.y }}
      aria-label={sk.dimensions.editSpan}
      title={sk.dimensions.editSpanTitle}
      aria-invalid={!valid || undefined}
      value={text}
      // biome-ignore lint/a11y/noAutofocus: pole sa otvorí kliknutím na kótu a hneď sa do neho píše
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setText(e.currentTarget.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && valid) onCommit(length);
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={onCancel}
    />
  );
}

/**
 * Kóty mosta v pozdĺžnom profile (len na obrazovke, ADR 0012, popisy ADR 0025): nad NK rady polia, dĺžka NK
 * a celková dĺžka 40 px od NK po 28 px, spojené vynášacími čiarami; nad nimi osi uloženia v krúžkoch s čiarkovanou
 * osou k NK; pod NK premostenie. `toX` prevedie staničenie osi cesty na x obrazovky; `top` a `bottom` sú y horného
 * povrchu a spodku NK na obrazovke.
 */
export function ProfileDimensions({
  chains,
  toX,
  top,
  bottom,
  width,
  height,
  markers = [],
  onEdit,
}: {
  chains: readonly DimensionChain[];
  toX: (s: number) => number | undefined;
  top: number;
  bottom: number;
  width: number;
  height: number;
  markers?: readonly DimensionMarker[] | undefined;
  /** klik na rozpätie (zadanie hodnoty) */
  onEdit?: EditSpan | undefined;
}) {
  const clip = { from: 0, to: width };
  const xs = (seg: DimensionSegment) => {
    const x1 = toX(seg.sFrom);
    const x2 = toX(seg.sTo);
    return x1 === undefined || x2 === undefined ? undefined : ([x1, x2] as const);
  };
  const visible = (chain: DimensionChain) => {
    const lens = chain.segments.flatMap((seg) => {
      const x = xs(seg);
      return x ? [Math.abs(x[1] - x[0])] : [];
    });
    return rowVisible(
      lens,
      chain.segments.map((seg) => seg.value),
    );
  };
  const above = chains.filter((c) => c.kind !== 'bridged' && visible(c));
  const below = chains.filter((c) => c.kind === 'bridged' && visible(c));
  const rows = chainRows(above);
  const yOf = (row: number) => top - GAP_PX - row * ROW_PX;
  /** pod nadpisom pohľadu a nad pravítkom staničenia */
  const clampY = (y: number) => Math.min(height - 40, Math.max(TITLE_PX, y));

  // vynášacie čiary: od prvého radu po najvyšší rad, ktorý bod používa
  const reach = new Map<number, number>();
  for (const chain of above) {
    const row = rows.get(chain.kind) ?? 0;
    for (const seg of chain.segments) {
      for (const x of xs(seg) ?? []) {
        const key = Math.round(x * 2) / 2;
        reach.set(key, Math.max(reach.get(key) ?? 0, row));
      }
    }
  }
  const topRow = Math.max(-1, ...rows.values());
  const markerY = clampY(yOf(Math.max(0, topRow)) - MARKER_GAP_PX);
  const shown = spacedMarkers(
    markers.flatMap((m) => {
      const x = toX(m.s);
      return x === undefined || x < -MARKER_R || x > width + MARKER_R ? [] : [{ ...m, x }];
    }),
  );
  return (
    <g className="dimensions">
      {[...reach].map(([x, row]) => (
        <line
          key={x}
          className="dim-extension"
          x1={x}
          x2={x}
          y1={clampY(yOf(0) + EXT_PX)}
          y2={clampY(yOf(row) - EXT_PX)}
        />
      ))}
      {[...above, ...below].map((chain) => {
        const y =
          chain.kind === 'bridged'
            ? clampY(bottom + GAP_PX)
            : clampY(yOf(rows.get(chain.kind) ?? 0));
        const segments = chain.segments.flatMap((seg) => {
          const x = xs(seg);
          return x ? [{ seg, x }] : [];
        });
        return (
          <g key={chain.kind}>
            {segments.map(({ seg, x }, i) => (
              <g key={`${seg.sFrom}-${seg.sTo}`}>
                {chain.kind === 'bridged' &&
                  x.map((xx) => (
                    <line
                      key={xx}
                      className="dim-extension"
                      x1={xx}
                      x2={xx}
                      y1={y - EXT_PX}
                      y2={y + EXT_PX}
                    />
                  ))}
                <DimensionLine
                  p={vec2(x[0], y)}
                  q={vec2(x[1], y)}
                  segment={seg}
                  title={sk.dimensions[chain.kind]}
                  onEdit={onEdit}
                  index={i}
                  count={segments.length}
                  clip={clip}
                />
              </g>
            ))}
          </g>
        );
      })}
      {shown.map((m) => (
        <Marker key={m.id} at={vec2(m.x, markerY)} to={vec2(m.x, top)} label={m.label} />
      ))}
    </g>
  );
}

/**
 * Kóty mosta v pôdoryse (popisy ADR 0025): reťazce rovnobežné s osou mosta mimo obrysu NK na strane `side`
 * (+1 vpravo), 40 px od NK po 28 px — polia, dĺžka NK, celková dĺžka, premostenie — spojené vynášacími čiarami;
 * nad nimi osi uloženia v krúžkoch s čiarkovanou osou až k NK. `pointAt(s, x)` = bod v odsadení x od osi mosta.
 */
export function PlanDimensions({
  chains,
  pointAt,
  toScreen,
  side,
  reach,
  scale,
  width,
  height,
  markers = [],
  onEdit,
}: {
  chains: readonly DimensionChain[];
  pointAt: (s: number, x: number) => Vec2;
  toScreen: (p: Vec2) => Vec2;
  side: 1 | -1;
  /** najväčšia vzdialenosť okraja NK od osi mosta na strane kót [m] */
  reach: number;
  /** mierka pohľadu [px/m] */
  scale: number;
  width: number;
  height: number;
  markers?: readonly DimensionMarker[] | undefined;
  /** klik na rozpätie (zadanie hodnoty) */
  onEdit?: EditSpan | undefined;
}) {
  const offset = (px: number) => side * (reach + px / scale);
  const screenLength = (seg: DimensionSegment) => Math.abs(seg.sTo - seg.sFrom) * scale;
  const shownChains = chains.filter((c) =>
    rowVisible(
      c.segments.map(screenLength),
      c.segments.map((seg) => seg.value),
    ),
  );
  const rows = chainRows(shownChains);
  const rowPx = (row: number) => GAP_PX + row * ROW_PX;
  const inView = (p: Vec2) => p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height;

  const reachRow = new Map<number, number>();
  for (const chain of shownChains) {
    const row = rows.get(chain.kind) ?? 0;
    for (const seg of chain.segments) {
      for (const s of [seg.sFrom, seg.sTo]) {
        const key = Math.round(s * 100) / 100;
        reachRow.set(key, Math.max(reachRow.get(key) ?? 0, row));
      }
    }
  }
  const topRow = Math.max(0, ...rows.values());
  const markerPx = rowPx(topRow) + MARKER_GAP_PX;
  const shown = spacedMarkers(
    markers.flatMap((m) => {
      const at = toScreen(pointAt(m.s, offset(markerPx)));
      return inView(at) ? [{ ...m, at, x: Math.hypot(at.x, at.y) }] : [];
    }),
  );
  return (
    <g className="dimensions">
      {[...reachRow].map(([s, row]) => {
        const a = toScreen(pointAt(s, offset(rowPx(0) - EXT_PX)));
        const b = toScreen(pointAt(s, offset(rowPx(row) + EXT_PX)));
        return <line key={s} className="dim-extension" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
      })}
      {shownChains.map((chain) => {
        const x = offset(rowPx(rows.get(chain.kind) ?? 0));
        return (
          <g key={chain.kind}>
            {chain.segments.map((seg, i) => {
              const n = Math.max(1, Math.ceil(Math.abs(seg.sTo - seg.sFrom)));
              const pts = Array.from({ length: n + 1 }, (_, k) =>
                toScreen(pointAt(seg.sFrom + ((seg.sTo - seg.sFrom) * k) / n, x)),
              );
              const first = pts[0];
              const last = pts[pts.length - 1];
              if (!first || !last) return null;
              // text v strede viditeľnej časti (kóta väčšia než výrez má text pripnutý do výrezu)
              const visibleIdx = pts.flatMap((p, k) => (inView(p) ? [k] : []));
              const placement = textPlacement(
                screenLength(seg),
                seg.value,
                i,
                chain.segments.length,
              );
              let text: { at: Vec2; angle: number; anchor: 'middle' | 'start' | 'end' } | undefined;
              if (placement === 'inside' && visibleIdx.length > 0) {
                const lo = visibleIdx[0] ?? 0;
                const hi = visibleIdx[visibleIdx.length - 1] ?? 0;
                const partS = ((hi - lo) / n) * Math.abs(seg.sTo - seg.sFrom) * scale;
                const midS = seg.sFrom + ((seg.sTo - seg.sFrom) * (lo + hi)) / (2 * n);
                if (partS >= textWidth(seg.value) || visibleIdx.length === pts.length) {
                  const a = toScreen(pointAt(midS - 0.5, x));
                  const b = toScreen(pointAt(midS + 0.5, x));
                  text = {
                    at: toScreen(pointAt(midS, x)),
                    angle: readable(a, b),
                    anchor: 'middle',
                  };
                }
              } else if (placement === 'before' || placement === 'after') {
                const before = placement === 'before';
                const end = before ? first : last;
                const next = before ? pts[1] : pts[pts.length - 2];
                if (next) {
                  const angle = readable(end, next);
                  // smer čítania: text pred začiatkom má koniec pri značke, za koncom začiatok
                  const leftToRight = (before ? next.x >= end.x : end.x >= next.x) === true;
                  const anchor = before === leftToRight ? 'end' : 'start';
                  text = { at: end, angle, anchor };
                }
              }
              return (
                <g key={`${seg.sFrom}-${seg.sTo}`}>
                  <title>{sk.dimensions[chain.kind]}</title>
                  <polyline
                    points={pts.map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' ')}
                  />
                  {[
                    [first, pts[1]],
                    [last, pts[pts.length - 2]],
                  ].map(([e, f]) => (e && f ? tick(e, f) : null))}
                  {text && (
                    <DimensionText
                      at={text.at}
                      angle={text.angle}
                      segment={seg}
                      onEdit={onEdit}
                      anchor={text.anchor}
                    />
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
      {shown.map((m) => (
        <Marker key={m.id} at={m.at} to={toScreen(pointAt(m.s, side * reach))} label={m.label} />
      ))}
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
): {
  pointAt: (s: number, x: number) => Vec2;
  side: 1 | -1;
  reach: number;
  reachOther: number;
} {
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
    reachOther: side > 0 ? reach.left : reach.right,
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

/**
 * Kóta voľnej výšky v pozdĺžnom profile (len na obrazovke, ADR 0012, 0020): zvislá čiara od spodku voľného prierezu
 * po spodok NK v krížení s osou prekážky, hodnota vedľa čiary.
 */
export function FreeHeightDimension({
  x,
  yBottom,
  yTop,
  value,
}: {
  x: number;
  yBottom: number;
  yTop: number;
  value: number;
}) {
  const p = vec2(x, yBottom);
  const q = vec2(x, yTop);
  if (Math.abs(yBottom - yTop) < 1) return null;
  return (
    <g className="dimensions free-height">
      <title>{sk.dimensions.freeHeight}</title>
      <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} />
      {tick(p, q)}
      {tick(q, p)}
      <text x={x + 6} y={(yBottom + yTop) / 2} dominantBaseline="middle">
        {sk.dimensions.freeLabel(label(value))}
      </text>
    </g>
  );
}
