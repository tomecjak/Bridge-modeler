import { type Alignment, formatStation } from '@bridge/alignment';
import {
  type DimensionChain,
  type Drawing,
  type LayerId,
  sampleHorizontal,
  stationTicks,
} from '@bridge/drawing';
import { type Vec2, vec2 } from '@bridge/geom';
import type { PlanLine } from '@bridge/model';
import { type PointerEvent, useEffect, useMemo, useState } from 'react';
import { sk } from '../i18n/sk.ts';
import { PlanDimensions } from './Dimensions.tsx';
import { DrawingEntities } from './DrawingEntities.tsx';
import { handleAt, type LineEditing, type LinePreview, previewOnHandle } from './lineEdit.ts';
import { MeasureOverlay } from './MeasureOverlay.tsx';
import { drawingVertices, formatPlanMeasure, snapPoint, useMeasure } from './measure.ts';
import { useElementSize } from './useElementSize.ts';
import { usePanZoom } from './usePanZoom.ts';
import type { FitRequest, ViewTool } from './viewState.ts';
import {
  boundsOf,
  fitView,
  focusRange,
  niceStep,
  type SRange,
  screenToWorld,
  worldToScreen,
} from './viewTransform.ts';

export interface PlanCursor {
  /** lokálne súradnice kurzora */
  point: Vec2;
  /** staničenie a odsadenie päty kolmice; undefined mimo osi */
  s: number | undefined;
  offset: number | undefined;
}

interface Props {
  alignment: Alignment;
  cursorS: number | undefined;
  /** bod kurzora z pozdĺžneho profilu na jeho čiare (inak bod osi cesty na `cursorS`) */
  cursorPoint?: Vec2 | undefined;
  onCursor: (cursor: PlanCursor | undefined) => void;
  /** pôdorys mosta (obrysy NK, os mosta, podpery; ADR 0012) */
  drawing: Drawing | undefined;
  /** vybraný prvok mosta (zvýraznenie) */
  selected?: string | undefined;
  /** úpravy osí uloženia (nástroje Os uloženia a Podpera, ADR 0017) */
  lineEditing?: LineEditing | undefined;
  /** aktívny nástroj (ribbon); pôdorys reaguje na „Os uloženia“, „Podpera“, „Čiara“ a „Merať“ */
  tool: ViewTool;
  onTool: (tool: ViewTool) => void;
  /** Prispôsobiť / Celá os z ribbonu */
  fitRequest: FitRequest;
  /** oblasť mosta na tejto osi (zvýraznený úsek osi, Fáza 10a) */
  studyArea?: SRange | undefined;
  /** úsek, na ktorý sa pohľad prispôsobí (oblasť mosta, inak NK); bez neho celá os */
  focus?: SRange | undefined;
  /** prejsť na staničenie: nová hodnota `nonce` vycentruje pohľad na spojité staničenie `s` */
  goTo?: { s: number; nonce: number } | undefined;
  /** ďalšie osi projektu (napr. okraje vozovky z LandXML) */
  otherAlignments: readonly Alignment[];
  /** čiary v pôdoryse; vybraná čiara má ťahateľné vrcholy */
  planLines: readonly PlanLine[];
  /** nakreslená čiara (lokálne súradnice) */
  onAddPlanLine: (points: Vec2[]) => void;
  onMovePlanLineVertex: (id: string, index: number, point: Vec2) => void;
  /** čiara pozdĺžneho profilu, ak nie je os cesty ani os mosta (zvýraznená) */
  profileLine?: readonly Vec2[] | undefined;
  /** výsledok nástroja Merať (stavový riadok) */
  onMeasure?: (text: string | undefined) => void;
  /** kóty mosta pozdĺž osí mostov (len na obrazovke) */
  dimensions?: readonly PlanDimensionSet[] | undefined;
}

/** Kóty jednej NK v pôdoryse: reťazce, bod v odsadení od osi mosta, strana a vzdialenosť okraja NK. */
export interface PlanDimensionSet {
  deckId: string;
  chains: readonly DimensionChain[];
  pointAt: (s: number, x: number) => Vec2;
  side: 1 | -1;
  reach: number;
}

/** Vrcholy kreslenej čiary bližšie ako 3 px sa zlúčia (dvojklik pridá dva kliky). */
const MERGE_PX = 3;
/** posun ukazovateľa, od ktorého je stlačenie na osi uloženia ťahaním, nie výberom [px] */
const DRAG_PX = 3;

const MINOR_TICK_PX = 14;
const LABEL_TICK_PX = 110;
const MAX_TICKS = 4000;
/** os cesty (farby podľa prvkov) a staničenie podľa priblíženia kreslí pohľad sám */
const OWN_LAYERS: ReadonlySet<LayerId> = new Set(['roadAxis', 'stationing']);

export function PlanView({
  alignment,
  cursorS,
  cursorPoint,
  onCursor,
  drawing,
  selected,
  lineEditing,
  tool,
  onTool,
  fitRequest,
  studyArea,
  focus,
  goTo,
  otherAlignments,
  planLines,
  onAddPlanLine,
  onMovePlanLineVertex,
  profileLine,
  onMeasure,
  dimensions,
}: Props) {
  /** vrcholy rozkreslenej čiary */
  const [sketch, setSketch] = useState<Vec2[]>([]);
  const [hover, setHover] = useState<Vec2>();
  /** ťahaný vrchol vybranej čiary */
  const [vertexDrag, setVertexDrag] = useState<{ id: string; index: number; point: Vec2 }>();
  /** návrh osi uloženia pod kurzorom alebo pri ťahaní */
  const [linePreview, setLinePreview] = useState<LinePreview>();
  /** ťahaná os uloženia: id, staničenie a bod obrazovky uchopenia */
  const [lineDrag, setLineDrag] = useState<{
    id: string;
    sGrab: number;
    start: Vec2;
    moved: boolean;
  }>();
  /** kurzor nad osou uloženia (dá sa ťahať) */
  const [overLine, setOverLine] = useState(false);
  const lineTool = (tool === 'bearingLine' || tool === 'support') && lineEditing ? tool : undefined;
  const [ref, size] = useElementSize<HTMLDivElement>();
  const samples = useMemo(() => sampleHorizontal(alignment, 1), [alignment]);
  const whole = fitRequest.whole;
  const bounds = useMemo(() => {
    if (!focus || whole) return boundsOf(samples);
    const r = focusRange({ from: focus.sFrom, to: focus.sTo }, 0, alignment.length);
    const inRange = samples.filter((p) => p.s >= r.from && p.s <= r.to);
    const ends = [r.from, r.to].map((s) => alignment.evaluateHorizontal(s).point);
    return boundsOf([...inRange, ...ends]);
  }, [samples, focus, whole, alignment]);
  const fit = size.width > 0 ? fitView(bounds, size, 56) : undefined;
  const { view, handlers, dragMove, wasDrag, reset, centerOn } = usePanZoom(ref, size, fit);
  // biome-ignore lint/correctness/useExhaustiveDependencies: prispôsobí sa len pri novej žiadosti z ribbonu
  useEffect(() => {
    if (fitRequest.nonce > 0) reset();
  }, [fitRequest.nonce]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: vycentruje sa len pri novej žiadosti (nonce), nie pri zmene pohľadu
  useEffect(() => {
    if (!goTo) return;
    const s = Math.min(alignment.length, Math.max(0, goTo.s));
    centerOn(alignment.evaluateHorizontal(s).point);
  }, [goTo?.nonce]);
  const others = useMemo(
    () => otherAlignments.map((a) => ({ name: a.name, points: sampleHorizontal(a, 1) })),
    [otherAlignments],
  );
  const selectedLine = planLines.find((l) => l.id === selected);
  const measure = useMeasure(tool === 'measure');
  // prichytenie na vrcholy výkresu, čiar v pôdoryse a styky prvkov osi
  const snapTargets = useMemo(
    () =>
      drawingVertices(drawing, [
        ...planLines.map((l) => l.points),
        alignment.elements.map((e) => alignment.evaluateHorizontal(e.sStart).point),
      ]),
    [drawing, planLines, alignment],
  );
  const measureEnd = measure.b ?? measure.hover?.point;
  const measureLabel = measure.a && measureEnd && formatPlanMeasure(measure.a, measureEnd);
  // biome-ignore lint/correctness/useExhaustiveDependencies: hlási sa len zmena textu merania
  useEffect(() => {
    if (tool === 'measure') onMeasure?.(measureLabel);
  }, [measureLabel, tool]);

  // zmena nástroja zahodí rozkreslenú čiaru a návrh osi
  useEffect(() => {
    if (tool !== 'line') setSketch([]);
    setLinePreview(undefined);
  }, [tool]);

  function finishSketch() {
    if (sketch.length >= 2) onAddPlanLine(sketch);
    setSketch([]);
    onTool('none');
  }
  // Enter ukončí kreslenie čiary, Esc ho zruší
  // biome-ignore lint/correctness/useExhaustiveDependencies: finishSketch sa mení s každým vrcholom; poslucháč stačí podľa nástroja a náčrtu
  useEffect(() => {
    if (tool !== 'line') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') finishSketch();
      if (e.key === 'Escape') {
        setSketch([]);
        onTool('none');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tool, sketch]);

  const elements = useMemo(
    () =>
      alignment.elements.map((e) => ({
        kind: e.kind,
        points: samples.filter((p) => p.s >= e.sStart - 1e-9 && p.s <= e.sEnd + 1e-9),
      })),
    [alignment, samples],
  );

  const minorStep = view ? niceStep(MINOR_TICK_PX / view.sx) : 0;
  const labelStep = view ? niceStep(LABEL_TICK_PX / view.sx) : 0;
  const ticks = useMemo(() => {
    if (minorStep <= 0 || alignment.length / minorStep > MAX_TICKS) return [];
    return stationTicks(alignment.stationing, minorStep).map((t) => ({
      ...t,
      ...alignment.evaluateHorizontal(t.s),
    }));
  }, [alignment, minorStep]);

  const worldAt = (e: { clientX: number; clientY: number }): Vec2 | undefined => {
    if (!view || !ref.current) return undefined;
    const rect = ref.current.getBoundingClientRect();
    return screenToWorld(view, size, { x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const screenOf = (e: { clientX: number; clientY: number }): Vec2 | undefined => {
    if (!ref.current) return undefined;
    const rect = ref.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    const screen = screenOf(e);
    const hit =
      tool === 'none' && e.button === 0 && lineEditing && screen
        ? handleAt(screen, lineEditing.handles, toScreen, 'plan')
        : undefined;
    const point = hit && worldAt(e);
    const s = point && alignment.project(point)?.s;
    if (hit && screen && s !== undefined) {
      e.currentTarget.setPointerCapture(e.pointerId);
      setLineDrag({ id: hit.id, sGrab: s, start: screen, moved: false });
      return;
    }
    handlers.onPointerDown(e);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (lineDrag && lineEditing) {
      const screen = screenOf(e);
      const point = worldAt(e);
      if (!screen || !point) return;
      const moved =
        lineDrag.moved ||
        Math.hypot(screen.x - lineDrag.start.x, screen.y - lineDrag.start.y) > DRAG_PX;
      if (moved !== lineDrag.moved) setLineDrag({ ...lineDrag, moved });
      const s = alignment.project(point)?.s;
      if (moved && s !== undefined)
        setLinePreview(
          lineEditing.drag(lineDrag.id, lineDrag.sGrab, s, {
            following: e.ctrlKey || e.metaKey,
            snap: !e.shiftKey,
          }),
        );
      return;
    }
    if (tool === 'none' && lineEditing && !e.buttons) {
      const screen = screenOf(e);
      setOverLine(
        screen !== undefined &&
          handleAt(screen, lineEditing.handles, toScreen, 'plan') !== undefined,
      );
    }
    if (vertexDrag) {
      const point = worldAt(e);
      if (point) setVertexDrag({ ...vertexDrag, point });
      return;
    }
    if (dragMove(e) || !view) return;
    const point = worldAt(e);
    if (!point) return;
    if (tool === 'line') setHover(point);
    if (tool === 'measure' && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const snapped = e.shiftKey ? undefined : snapPoint(screen, snapTargets, toScreen);
      measure.move({ point: snapped ?? point, snapped: snapped !== undefined });
    }
    const projection = alignment.project(point);
    onCursor({ point, s: projection?.s, offset: projection?.offset });
    if (lineTool && lineEditing && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const free =
        lineTool === 'support'
          ? handleAt(screen, lineEditing.handles, toScreen, 'plan', (h) => h.free)
          : undefined;
      setLinePreview(
        free
          ? previewOnHandle(free)
          : projection
            ? lineEditing.preview(projection.s, projection.offset, !e.shiftKey)
            : undefined,
      );
    }
  }

  const toScreen = (p: Vec2) => (view ? worldToScreen(view, size, p) : p);
  const polyline = (pts: readonly Vec2[]) =>
    pts
      .map((p) => {
        const q = toScreen(p);
        return `${q.x.toFixed(1)},${q.y.toFixed(1)}`;
      })
      .join(' ');

  const cursor =
    cursorPoint !== undefined
      ? { point: cursorPoint }
      : cursorS === undefined
        ? undefined
        : alignment.evaluateHorizontal(cursorS);
  const areaAxis = studyArea && [
    alignment.evaluateHorizontal(studyArea.sFrom).point,
    ...samples.filter((p) => p.s > studyArea.sFrom && p.s < studyArea.sTo),
    alignment.evaluateHorizontal(studyArea.sTo).point,
  ];

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: umiestnenie podpery kliknutím do mapy; z klávesnice sa staničenie zadá v editore podpery
    <div
      ref={ref}
      className="drawing"
      role="application"
      aria-label={sk.viewport.plan}
      {...handlers}
      onPointerDown={onPointerDown}
      onPointerUp={(e) => {
        if (lineDrag) {
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
          if (lineDrag.moved && linePreview) lineEditing?.commit(linePreview);
          else lineEditing?.select(lineDrag.id);
          setLineDrag(undefined);
          setLinePreview(undefined);
          return;
        }
        handlers.onPointerUp(e);
        if (!vertexDrag) return;
        const round = (v: number) => Math.round(v * 1000) / 1000;
        onMovePlanLineVertex(
          vertexDrag.id,
          vertexDrag.index,
          vec2(round(vertexDrag.point.x), round(vertexDrag.point.y)),
        );
        setVertexDrag(undefined);
      }}
      onPointerMove={onPointerMove}
      onPointerLeave={() => {
        onCursor(undefined);
        setHover(undefined);
        setLinePreview(undefined);
      }}
      onDoubleClick={() => (tool === 'line' ? finishSketch() : reset())}
      onClick={(e) => {
        if (tool === 'measure' && measure.hover && !wasDrag()) {
          measure.click(measure.hover.point);
          return;
        }
        if (wasDrag() || !view) return;
        if (e.target instanceof Element && e.target.closest('button, summary, details')) return;
        if (lineTool && linePreview) {
          lineEditing?.place(linePreview, lineTool);
          setLinePreview(undefined);
          return;
        }
        if (tool !== 'line') return;
        const point = worldAt(e);
        if (!point) return;
        const last = sketch.at(-1);
        const near = last && Math.hypot(point.x - last.x, point.y - last.y) * view.sx < MERGE_PX;
        if (!near) setSketch([...sketch, point]);
      }}
      data-add-mode={tool === 'line' || lineTool !== undefined || tool === 'measure' || undefined}
      data-line-drag={overLine || lineDrag !== undefined || undefined}
    >
      <div className="drawing-toolbar">
        <span className="drawing-title">{sk.viewport.plan}</span>
      </div>
      {view && (
        <svg width={size.width} height={size.height} role="img" aria-label={sk.viewport.plan}>
          {areaAxis && <polyline className="study-area-axis" points={polyline(areaAxis)} />}
          {ticks.map((t) => {
            const p = toScreen(t.point);
            const nx = Math.cos(t.azimuth);
            const ny = Math.sin(t.azimuth); // normála vpravo (cos, −sin) vo svete → (cos, +sin) na obrazovke
            const labeled =
              Math.abs(t.station / labelStep - Math.round(t.station / labelStep)) < 1e-6;
            const len = labeled ? 9 : 4;
            return (
              <g key={t.s} className={labeled ? 'tick tick-major' : 'tick'}>
                <line
                  x1={p.x - nx * len}
                  y1={p.y - ny * len}
                  x2={p.x + nx * len}
                  y2={p.y + ny * len}
                />
                {labeled && (
                  <text
                    x={p.x - nx * 16}
                    y={p.y - ny * 16}
                    textAnchor={nx > 0 ? 'end' : 'start'}
                    dominantBaseline="middle"
                  >
                    {formatStation(t.station, labelStep < 1 ? 1 : 0)}
                  </text>
                )}
              </g>
            );
          })}
          {elements.map((e, i) => (
            <polyline
              key={alignment.elements[i]?.index}
              className={`axis axis-${e.kind}`}
              points={polyline(e.points)}
            />
          ))}
          {others.map((o) => (
            <polyline key={o.name} className="axis axis-other" points={polyline(o.points)} />
          ))}
          {alignment.horizontal.boundaries.map((s) => {
            const p = toScreen(alignment.evaluateHorizontal(s).point);
            return <circle key={s} className="joint" cx={p.x} cy={p.y} r={3} />;
          })}
          {drawing && (
            <DrawingEntities
              entities={drawing.entities}
              toScreen={toScreen}
              skip={OWN_LAYERS}
              selected={selected}
            />
          )}
          {profileLine && profileLine.length > 1 && (
            <polyline className="profile-axis-plan" points={polyline(profileLine)} />
          )}
          {selectedLine && (
            <g className="plan-line-edit">
              {selectedLine.points.map((p, i) => {
                const q = toScreen(
                  vertexDrag?.id === selectedLine.id && vertexDrag.index === i
                    ? vertexDrag.point
                    : p,
                );
                return (
                  <circle
                    // biome-ignore lint/suspicious/noArrayIndexKey: vrchol čiary je určený poradím
                    key={i}
                    className="plan-line-vertex"
                    cx={q.x}
                    cy={q.y}
                    r={5}
                    onPointerDown={(e) => {
                      if (e.button !== 0 || tool !== 'none') return;
                      e.stopPropagation();
                      ref.current?.setPointerCapture(e.pointerId);
                      setVertexDrag({ id: selectedLine.id, index: i, point: p });
                    }}
                  />
                );
              })}
              {vertexDrag?.id === selectedLine.id && (
                <polyline
                  className="plan-line-preview"
                  points={polyline(
                    selectedLine.points.map((p, i) =>
                      i === vertexDrag.index ? vertexDrag.point : p,
                    ),
                  )}
                />
              )}
            </g>
          )}
          {tool === 'line' && sketch.length > 0 && (
            <polyline
              className="plan-line-preview"
              points={polyline(hover ? [...sketch, hover] : sketch)}
            />
          )}
          {dimensions?.map((d) => (
            <PlanDimensions
              key={d.deckId}
              // pri návrhu osi sa rozpätia NK ukazujú živo (nižšie)
              chains={
                linePreview?.deckId === d.deckId
                  ? d.chains.filter((c) => c.kind !== 'spans')
                  : d.chains
              }
              pointAt={d.pointAt}
              toScreen={toScreen}
              side={d.side}
              reach={d.reach}
              scale={view.sx}
            />
          ))}
          {[linePreview, ...(linePreview?.extra ?? [])].map((p, i) =>
            p && p.plan.length >= 2 ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: náhľad osí je určený poradím
              <polyline key={i} className="line-preview" points={polyline(p.plan)} />
            ) : null,
          )}
          {linePreview?.frame && linePreview.spans.length > 0 && (
            <PlanDimensions
              chains={[{ kind: 'spans', segments: linePreview.spans }]}
              pointAt={linePreview.frame.pointAt}
              toScreen={toScreen}
              side={linePreview.frame.side}
              reach={linePreview.frame.reach}
              scale={view.sx}
            />
          )}
          {tool === 'measure' && (
            <MeasureOverlay
              a={measure.a}
              b={measure.b}
              hover={measure.hover}
              toScreen={toScreen}
              label={measureLabel}
            />
          )}
          {cursor && (
            <circle
              className="cursor-marker"
              cx={toScreen(cursor.point).x}
              cy={toScreen(cursor.point).y}
              r={5}
            />
          )}
        </svg>
      )}
    </div>
  );
}
