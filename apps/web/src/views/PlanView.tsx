import { type Alignment, formatStation } from '@bridge/alignment';
import { type Drawing, type LayerId, sampleHorizontal, stationTicks } from '@bridge/drawing';
import type { Vec2 } from '@bridge/geom';
import { type PointerEvent, useMemo, useState } from 'react';
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
}

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
}: Props) {
  const [addMode, setAddMode] = useState(false);
  const [ref, size] = useElementSize<HTMLDivElement>();
  const samples = useMemo(() => sampleHorizontal(alignment, 1), [alignment]);
  const bounds = useMemo(() => boundsOf(samples), [samples]);
  const fit = size.width > 0 ? fitView(bounds, size, 56) : undefined;
  const { view, handlers, dragMove, wasDrag, reset } = usePanZoom(ref, size, fit);

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

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (dragMove(e) || !view) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const point = screenToWorld(view, size, { x: e.clientX - rect.left, y: e.clientY - rect.top });
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
      onPointerMove={onPointerMove}
      onPointerLeave={() => onCursor(undefined)}
      onDoubleClick={reset}
      onClick={(e) => {
        if (!addMode || wasDrag() || !view) return;
        if (e.target instanceof Element && e.target.closest('button')) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const point = screenToWorld(view, size, {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
        const projection = alignment.project(point);
        if (!projection) return;
        onAddSupport(projection.s, projection.offset);
        setAddMode(false);
      }}
      data-add-mode={addMode || undefined}
    >
      <div className="drawing-toolbar">
        <span className="drawing-title">{sk.viewport.plan}</span>
        <button type="button" onClick={reset}>
          {sk.viewport.fit}
        </button>
        <button type="button" aria-pressed={addMode} onClick={() => setAddMode((m) => !m)}>
          {sk.supports.add}
        </button>
        <ExportMenu onExport={onExport} coordinates />
        {addMode && <span className="drawing-note">{sk.supports.addHint}</span>}
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
