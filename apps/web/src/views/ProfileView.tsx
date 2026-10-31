import { type Alignment, formatStation } from '@bridge/alignment';
import {
  type Drawing,
  drawingBounds,
  type LayerId,
  sampleProfile,
  stationTicks,
} from '@bridge/drawing';
import type { Vec2 } from '@bridge/geom';
import { type PointerEvent, useMemo, useState } from 'react';
import { formatNumber } from '../format/number.ts';
import { sk } from '../i18n/sk.ts';
import { DrawingEntities } from './DrawingEntities.tsx';
import { type ExportFormat, ExportMenu } from './ExportMenu.tsx';
import { useElementSize } from './useElementSize.ts';
import { usePanZoom } from './usePanZoom.ts';
import { fitView, niceStep, screenToWorld, worldToScreen } from './viewTransform.ts';

interface Props {
  alignment: Alignment;
  cursorS: number | undefined;
  onCursor: (s: number | undefined) => void;
  /** rozvinutý pozdĺžny rez v osi vybranej NK 1 : 1 (NK, podpery, terén; ADR 0012) */
  drawing: Drawing | undefined;
  /** NK na tejto osi cesty; pri viacerých sa volí, v osi ktorej je rez */
  decks: readonly { id: string; name: string }[];
  deckId: string | undefined;
  onDeck: (id: string) => void;
  /** vybraný prvok mosta (zvýraznenie) */
  selected?: string | undefined;
  onExport: (format: ExportFormat) => void;
}

/** Ponúkané prevýšenia (výšky : dĺžky); export je vždy 1 : 1. */
const EXAGGERATIONS = [1, 2, 5, 10];
/** niveletu kreslí pohľad sám (s polygónom PVI) */
const OWN_LAYERS: ReadonlySet<LayerId> = new Set(['grade']);
const STATION_LABEL_PX = 110;
const ELEVATION_LINE_PX = 32;

export function ProfileView({
  alignment,
  cursorS,
  onCursor,
  drawing,
  decks,
  deckId,
  onDeck,
  selected,
  onExport,
}: Props) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const [exaggeration, setExaggeration] = useState(10);
  const samples = useMemo(() => sampleProfile(alignment, 1), [alignment]);
  const profile = alignment.profile;
  const bounds = useMemo(() => {
    // výškový rozsah zahŕňa niveletu, terén, NK aj podpery
    const content = drawing && drawingBounds(drawing);
    const zs = [...samples.map((p) => p.z), ...(content ? [content.minY, content.maxY] : [])];
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const margin = Math.max(1, (maxZ - minZ) * 0.15);
    return {
      minX: samples[0]?.s ?? 0,
      maxX: samples.at(-1)?.s ?? 1,
      minY: minZ - margin,
      // nad podperami sú zvislé popisy a lišta pohľadu
      maxY: maxZ + 2.5 * margin,
    };
  }, [samples, drawing]);
  const fit =
    size.width > 0 && samples.length > 0 ? fitView(bounds, size, 48, exaggeration) : undefined;
  const { view, handlers, dragMove, reset } = usePanZoom(ref, size, fit);

  const stationStep = view ? niceStep(STATION_LABEL_PX / view.sx) : 0;
  const elevationStep = view ? niceStep(ELEVATION_LINE_PX / view.sy) : 0;

  if (!profile) {
    return (
      <div className="drawing">
        <p className="panel-empty centered drawing-message">{sk.viewport.noProfile}</p>
      </div>
    );
  }

  const toScreen = (p: Vec2) => (view ? worldToScreen(view, size, p) : p);
  const visible = view
    ? {
        left: screenToWorld(view, size, { x: 0, y: 0 }),
        right: screenToWorld(view, size, { x: size.width, y: size.height }),
      }
    : undefined;
  const ticks =
    visible && stationStep > 0
      ? stationTicks(
          alignment.stationing,
          stationStep,
          Math.max(profile.startS, visible.left.x),
          Math.min(profile.endS, visible.right.x),
        )
      : [];
  const elevations: number[] = [];
  if (visible && elevationStep > 0) {
    for (
      let z = Math.ceil(visible.right.y / elevationStep) * elevationStep;
      z <= visible.left.y;
      z += elevationStep
    ) {
      elevations.push(z);
    }
  }
  const line = samples
    .map((p) => {
      const q = toScreen({ x: p.s, y: p.z });
      return `${q.x.toFixed(1)},${q.y.toFixed(1)}`;
    })
    .join(' ');
  const polygon = profile.keyPoints
    .filter((k) => k.kind === 'start' || k.kind === 'pvi' || k.kind === 'end')
    .map((k) => toScreen({ x: k.s, y: k.z + alignment.origin.z }));

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (dragMove(e) || !view) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const s = screenToWorld(view, size, { x: e.clientX - rect.left, y: e.clientY - rect.top }).x;
    onCursor(s >= 0 && s <= alignment.length ? s : undefined);
  }

  const cursorInProfile =
    cursorS !== undefined && cursorS >= profile.startS && cursorS <= profile.endS;
  const cursorPoint = cursorInProfile
    ? toScreen({ x: cursorS, y: alignment.elevation(cursorS).z + alignment.origin.z })
    : undefined;

  return (
    <div
      ref={ref}
      className="drawing"
      role="application"
      aria-label={sk.viewport.profile}
      {...handlers}
      onPointerMove={onPointerMove}
      onPointerLeave={() => onCursor(undefined)}
      onDoubleClick={reset}
    >
      <div className="drawing-toolbar">
        <span className="drawing-title">{sk.viewport.profile}</span>
        {decks.length > 1 && (
          <label className="drawing-note">
            {sk.viewport.profileDeck}{' '}
            <select value={deckId} onChange={(e) => onDeck(e.target.value)}>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="drawing-note" title={sk.viewport.exaggerationTitle}>
          {sk.viewport.exaggeration}{' '}
          <select
            value={exaggeration}
            onChange={(e) => {
              setExaggeration(Number(e.target.value));
              reset();
            }}
          >
            {EXAGGERATIONS.map((k) => (
              <option key={k} value={k}>
                {k}×
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={reset}>
          {sk.viewport.fit}
        </button>
        <ExportMenu onExport={(format) => onExport(format)} disabled={!drawing} />
      </div>
      {view && (
        <svg width={size.width} height={size.height} role="img" aria-label={sk.viewport.profile}>
          <g className="grid">
            {elevations.map((z) => {
              const y = toScreen({ x: 0, y: z }).y;
              return (
                <g key={z}>
                  <line x1={0} y1={y} x2={size.width} y2={y} />
                  <text x={6} y={y - 3}>
                    {formatNumber(z, elevationStep < 1 ? 1 : 0)}
                  </text>
                </g>
              );
            })}
            {ticks.map((t) => {
              const x = toScreen({ x: t.s, y: 0 }).x;
              return (
                <g key={t.s}>
                  <line x1={x} y1={0} x2={x} y2={size.height} />
                  <text x={x + 3} y={size.height - 6}>
                    {formatStation(t.station, stationStep < 1 ? 1 : 0)}
                  </text>
                </g>
              );
            })}
          </g>
          <polyline
            className="pvi-polygon"
            points={polygon.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
          />
          {polygon.map((p) => (
            <circle key={`${p.x},${p.y}`} className="pvi" cx={p.x} cy={p.y} r={3} />
          ))}
          {drawing && (
            <DrawingEntities
              entities={drawing.entities}
              toScreen={toScreen}
              skip={OWN_LAYERS}
              selected={selected}
            />
          )}
          <polyline className="profile-line" points={line} />
          {cursorPoint && (
            <g className="cursor">
              <line x1={cursorPoint.x} y1={0} x2={cursorPoint.x} y2={size.height} />
              <circle className="cursor-marker" cx={cursorPoint.x} cy={cursorPoint.y} r={5} />
            </g>
          )}
        </svg>
      )}
    </div>
  );
}
