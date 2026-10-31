import { type Alignment, formatStation } from '@bridge/alignment';
import {
  type Drawing,
  drawingBounds,
  type LayerId,
  sampleProfile,
  stationTicks,
} from '@bridge/drawing';
import type { Vec2 } from '@bridge/geom';
import { type PointerEvent, useEffect, useMemo, useState } from 'react';
import { formatNumber } from '../format/number.ts';
import { sk } from '../i18n/sk.ts';
import { DrawingEntities } from './DrawingEntities.tsx';
import { type ExportFormat, ExportMenu } from './ExportMenu.tsx';
import { useElementSize } from './useElementSize.ts';
import { usePanZoom } from './usePanZoom.ts';
import {
  fitView,
  focusRange,
  niceStep,
  type SRange,
  screenToWorld,
  worldToScreen,
} from './viewTransform.ts';

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
  /** oblasť mosta na tejto osi (Fáza 10a) */
  studyArea?: SRange | undefined;
  /** úsek, na ktorý sa pohľad prispôsobí (oblasť mosta, inak NK); bez neho celá os */
  focus?: SRange | undefined;
  /** vyznačená oblasť mosta (ťahom v nástroji „Oblasť mosta“) */
  onStudyArea?: (range: SRange) => void;
  /** zmena hodnoty zapne nástroj „Oblasť mosta“ (z postupu); 0 = bez žiadosti */
  areaToolRequest?: number;
}

/** Ponúkané prevýšenia (výšky : dĺžky); export je vždy 1 : 1. */
const EXAGGERATIONS = [1, 2, 5, 10];
/** niveletu kreslí pohľad sám (s polygónom PVI) */
const OWN_LAYERS: ReadonlySet<LayerId> = new Set(['grade']);
const STATION_LABEL_PX = 110;
const ELEVATION_LINE_PX = 32;
/** najkratšia oblasť mosta [m]; kratší ťah sa berie ako klik */
const MIN_AREA = 1;
const CONTROLS = 'button, input, select, textarea, label';

type Tool = 'none' | 'area';

/** Výškový rozsah bodov výkresu, ktoré ležia v rozsahu staničení (prázdny výkres → undefined). */
function elevationsIn(drawing: Drawing | undefined, from: number, to: number): number[] {
  if (!drawing) return [];
  const zs: number[] = [];
  for (const e of drawing.entities) {
    const pts = e.kind === 'polyline' ? e.points : [e.at];
    for (const p of pts) if (p.x >= from && p.x <= to) zs.push(p.y);
  }
  return zs;
}

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
  studyArea,
  focus,
  onStudyArea,
  areaToolRequest = 0,
}: Props) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const [exaggeration, setExaggeration] = useState(10);
  const [tool, setTool] = useState<Tool>('none');
  /** rozťahovaná oblasť mosta (spojité staničenie začiatku a kurzora) */
  const [areaDraft, setAreaDraft] = useState<{ s0: number; s1: number }>();
  /** „Celá os“ ukáže celú os aj vtedy, keď je oblasť mosta alebo NK */
  const [whole, setWhole] = useState(false);
  const samples = useMemo(() => sampleProfile(alignment, 1), [alignment]);
  const profile = alignment.profile;
  const range = useMemo(() => {
    const first = samples[0]?.s ?? 0;
    const last = samples.at(-1)?.s ?? 1;
    return focus && !whole
      ? focusRange({ from: focus.sFrom, to: focus.sTo }, first, last)
      : { from: first, to: last };
  }, [samples, focus, whole]);
  const bounds = useMemo(() => {
    // výškový rozsah zahŕňa niveletu, terén, NK aj podpery v zobrazenom úseku
    const inRange = samples.filter((p) => p.s >= range.from && p.s <= range.to);
    const content = focus && !whole ? undefined : drawing && drawingBounds(drawing);
    const zs = [
      ...inRange.map((p) => p.z),
      ...(content ? [content.minY, content.maxY] : elevationsIn(drawing, range.from, range.to)),
    ];
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const margin = Math.max(1, (maxZ - minZ) * 0.15);
    return {
      minX: range.from,
      maxX: range.to,
      minY: minZ - margin,
      // nad podperami sú zvislé popisy a lišta pohľadu
      maxY: maxZ + 2.5 * margin,
    };
  }, [samples, drawing, range, focus, whole]);
  const fit =
    size.width > 0 && samples.length > 0 ? fitView(bounds, size, 48, exaggeration) : undefined;
  const { view, handlers, dragMove, reset } = usePanZoom(ref, size, fit, tool === 'none');

  useEffect(() => {
    if (areaToolRequest > 0) setTool('area');
  }, [areaToolRequest]);
  // Esc zruší vyznačovanie oblasti
  useEffect(() => {
    if (tool !== 'area') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setAreaDraft(undefined);
      setTool('none');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tool]);

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

  /** Spojité staničenie pod ukazovateľom, orezané na rozsah nivelety. */
  function stationAt(e: PointerEvent<HTMLDivElement>): number | undefined {
    if (!view || !profile) return undefined;
    const rect = e.currentTarget.getBoundingClientRect();
    const s = screenToWorld(view, size, { x: e.clientX - rect.left, y: e.clientY - rect.top }).x;
    return Math.min(profile.endS, Math.max(profile.startS, s));
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    const onControl = e.target instanceof Element && e.target.closest(CONTROLS);
    if (tool === 'area' && e.button === 0 && !onControl) {
      const s = stationAt(e);
      if (s === undefined) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      setAreaDraft({ s0: s, s1: s });
      return;
    }
    handlers.onPointerDown(e);
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (!areaDraft) {
      handlers.onPointerUp(e);
      return;
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    const sFrom = Math.min(areaDraft.s0, areaDraft.s1);
    const sTo = Math.max(areaDraft.s0, areaDraft.s1);
    if (sTo - sFrom >= MIN_AREA) onStudyArea?.({ sFrom, sTo });
    setAreaDraft(undefined);
    setTool('none');
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (areaDraft) {
      const s = stationAt(e);
      if (s !== undefined) setAreaDraft({ ...areaDraft, s1: s });
    } else if (dragMove(e)) {
      return;
    }
    if (!view) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const s = screenToWorld(view, size, { x: e.clientX - rect.left, y: e.clientY - rect.top }).x;
    onCursor(s >= 0 && s <= alignment.length ? s : undefined);
  }

  const cursorInProfile =
    cursorS !== undefined && cursorS >= profile.startS && cursorS <= profile.endS;
  const cursorPoint = cursorInProfile
    ? toScreen({ x: cursorS, y: alignment.elevation(cursorS).z + alignment.origin.z })
    : undefined;

  const band: SRange | undefined = areaDraft
    ? { sFrom: Math.min(areaDraft.s0, areaDraft.s1), sTo: Math.max(areaDraft.s0, areaDraft.s1) }
    : studyArea;
  const bandLabel = (s: number) => formatStation(alignment.stationing.toDisplay(s).station, 0);

  return (
    <div
      ref={ref}
      className="drawing"
      role="application"
      aria-label={sk.viewport.profile}
      data-area-mode={tool === 'area' ? '' : undefined}
      {...handlers}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
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
        <button
          type="button"
          title={sk.viewport.fitTitle}
          onClick={() => {
            setWhole(false);
            reset();
          }}
        >
          {sk.viewport.fit}
        </button>
        {focus && (
          <button
            type="button"
            onClick={() => {
              setWhole(true);
              reset();
            }}
          >
            {sk.viewport.wholeAxis}
          </button>
        )}
        {onStudyArea && (
          <button
            type="button"
            title={sk.studyArea.toolTitle}
            aria-pressed={tool === 'area'}
            onClick={() => {
              setAreaDraft(undefined);
              setTool((t) => (t === 'area' ? 'none' : 'area'));
            }}
          >
            {sk.studyArea.tool}
          </button>
        )}
        <ExportMenu onExport={(format) => onExport(format)} disabled={!drawing} />
        {tool === 'area' && <span className="drawing-note">{sk.studyArea.toolHint}</span>}
      </div>
      {view && (
        <svg width={size.width} height={size.height} role="img" aria-label={sk.viewport.profile}>
          <defs>
            <pattern
              id="study-area-hatch"
              width="8"
              height="8"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line x1="0" y1="0" x2="0" y2="8" />
            </pattern>
          </defs>
          {band && (
            <g className="study-area">
              <rect
                x={toScreen({ x: band.sFrom, y: 0 }).x}
                y={0}
                width={Math.max(
                  0,
                  toScreen({ x: band.sTo, y: 0 }).x - toScreen({ x: band.sFrom, y: 0 }).x,
                )}
                height={size.height}
              />
              {[band.sFrom, band.sTo].map((s, i) => {
                const x = toScreen({ x: s, y: 0 }).x;
                return (
                  <g key={i === 0 ? 'from' : 'to'}>
                    <line x1={x} y1={0} x2={x} y2={size.height} />
                    <text x={i === 0 ? x + 4 : x - 4} y={56} textAnchor={i === 0 ? 'start' : 'end'}>
                      {bandLabel(s)}
                    </text>
                  </g>
                );
              })}
            </g>
          )}
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
