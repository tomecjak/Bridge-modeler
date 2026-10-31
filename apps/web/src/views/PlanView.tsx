import { type Alignment, formatStation } from '@bridge/alignment';
import { type Drawing, type LayerId, sampleHorizontal, stationTicks } from '@bridge/drawing';
import { type Vec2, vec2 } from '@bridge/geom';
import type { PlanLine } from '@bridge/model';
import { type PointerEvent, useEffect, useMemo, useState } from 'react';
import { sk } from '../i18n/sk.ts';
import { DrawingEntities } from './DrawingEntities.tsx';
import { type ExportCoordinates, type ExportFormat, ExportMenu } from './ExportMenu.tsx';
import { useElementSize } from './useElementSize.ts';
import { usePanZoom } from './usePanZoom.ts';
import { boundsOf, fitView, niceStep, screenToWorld, worldToScreen } from './viewTransform.ts';

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
  onCursor: (cursor: PlanCursor | undefined) => void;
  /** pôdorys mosta (obrysy NK, os mosta, podpery; ADR 0012) */
  drawing: Drawing | undefined;
  /** vybraný prvok mosta (zvýraznenie) */
  selected?: string | undefined;
  onExport: (format: ExportFormat, coordinates: ExportCoordinates) => void;
  /** klik na os v režime pridávania podpery → staničenie s a odsadenie od osi cesty */
  onAddSupport: (s: number, offset: number) => void;
  /** ďalšie osi projektu (napr. okraje vozovky z LandXML) */
  otherAlignments: readonly Alignment[];
  /** čiary v pôdoryse; vybraná čiara má ťahateľné vrcholy */
  planLines: readonly PlanLine[];
  /** nakreslená čiara (lokálne súradnice) */
  onAddPlanLine: (points: Vec2[]) => void;
  onMovePlanLineVertex: (id: string, index: number, point: Vec2) => void;
}

type Tool = 'none' | 'support' | 'line';

/** Vrcholy kreslenej čiary bližšie ako 3 px sa zlúčia (dvojklik pridá dva kliky). */
const MERGE_PX = 3;

const MINOR_TICK_PX = 14;
const LABEL_TICK_PX = 110;
const MAX_TICKS = 4000;
/** os cesty (farby podľa prvkov) a staničenie podľa priblíženia kreslí pohľad sám */
const OWN_LAYERS: ReadonlySet<LayerId> = new Set(['roadAxis', 'stationing']);

export function PlanView({
  alignment,
  cursorS,
  onCursor,
  drawing,
  selected,
  onExport,
  onAddSupport,
  otherAlignments,
  planLines,
  onAddPlanLine,
  onMovePlanLineVertex,
}: Props) {
  const [tool, setTool] = useState<Tool>('none');
  /** vrcholy rozkreslenej čiary */
  const [sketch, setSketch] = useState<Vec2[]>([]);
  const [hover, setHover] = useState<Vec2>();
  /** ťahaný vrchol vybranej čiary */
  const [vertexDrag, setVertexDrag] = useState<{ id: string; index: number; point: Vec2 }>();
  const addMode = tool === 'support';
  const [ref, size] = useElementSize<HTMLDivElement>();
  const samples = useMemo(() => sampleHorizontal(alignment, 1), [alignment]);
  const bounds = useMemo(() => boundsOf(samples), [samples]);
  const fit = size.width > 0 ? fitView(bounds, size, 56) : undefined;
  const { view, handlers, dragMove, wasDrag, reset } = usePanZoom(ref, size, fit);
  const others = useMemo(
    () => otherAlignments.map((a) => ({ name: a.name, points: sampleHorizontal(a, 1) })),
    [otherAlignments],
  );
  const selectedLine = planLines.find((l) => l.id === selected);

  function finishSketch() {
    if (sketch.length >= 2) onAddPlanLine(sketch);
    setSketch([]);
    setTool('none');
  }
  // Enter ukončí kreslenie čiary, Esc ho zruší
  // biome-ignore lint/correctness/useExhaustiveDependencies: finishSketch sa mení s každým vrcholom; poslucháč stačí podľa nástroja a náčrtu
  useEffect(() => {
    if (tool !== 'line') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') finishSketch();
      if (e.key === 'Escape') {
        setSketch([]);
        setTool('none');
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

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (vertexDrag) {
      const point = worldAt(e);
      if (point) setVertexDrag({ ...vertexDrag, point });
      return;
    }
    if (dragMove(e) || !view) return;
    const point = worldAt(e);
    if (!point) return;
    if (tool === 'line') setHover(point);
    const projection = alignment.project(point);
    onCursor({ point, s: projection?.s, offset: projection?.offset });
  }

  const toScreen = (p: Vec2) => (view ? worldToScreen(view, size, p) : p);
  const polyline = (pts: readonly Vec2[]) =>
    pts
      .map((p) => {
        const q = toScreen(p);
        return `${q.x.toFixed(1)},${q.y.toFixed(1)}`;
      })
      .join(' ');

  const cursor = cursorS === undefined ? undefined : alignment.evaluateHorizontal(cursorS);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: umiestnenie podpery kliknutím do mapy; z klávesnice sa staničenie zadá v editore podpery
    <div
      ref={ref}
      className="drawing"
      role="application"
      aria-label={sk.viewport.plan}
      {...handlers}
      onPointerUp={(e) => {
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
      }}
      onDoubleClick={() => (tool === 'line' ? finishSketch() : reset())}
      onClick={(e) => {
        if (tool === 'none' || wasDrag() || !view) return;
        if (e.target instanceof Element && e.target.closest('button, summary, details')) return;
        const point = worldAt(e);
        if (!point) return;
        if (tool === 'line') {
          const last = sketch.at(-1);
          const near = last && Math.hypot(point.x - last.x, point.y - last.y) * view.sx < MERGE_PX;
          if (!near) setSketch([...sketch, point]);
          return;
        }
        const projection = alignment.project(point);
        if (!projection) return;
        onAddSupport(projection.s, projection.offset);
        setTool('none');
      }}
      data-add-mode={tool !== 'none' || undefined}
    >
      <div className="drawing-toolbar">
        <span className="drawing-title">{sk.viewport.plan}</span>
        <button type="button" onClick={reset}>
          {sk.viewport.fit}
        </button>
        <button
          type="button"
          aria-pressed={addMode}
          onClick={() => setTool((t) => (t === 'support' ? 'none' : 'support'))}
        >
          {sk.supports.add}
        </button>
        <button
          type="button"
          aria-pressed={tool === 'line'}
          onClick={() => {
            setSketch([]);
            setTool((t) => (t === 'line' ? 'none' : 'line'));
          }}
        >
          {sk.planLines.draw}
        </button>
        <ExportMenu onExport={onExport} coordinates />
        {addMode && <span className="drawing-note">{sk.supports.addHint}</span>}
        {tool === 'line' && <span className="drawing-note">{sk.planLines.drawHint}</span>}
      </div>
      {view && (
        <svg width={size.width} height={size.height} role="img" aria-label={sk.viewport.plan}>
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
