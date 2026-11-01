import { formatStation } from '@bridge/alignment';
import {
  type DimensionChain,
  type Drawing,
  drawingBounds,
  type LayerId,
  type ProfileReadout,
  profileGrade,
  profilePvis,
  profileReadout,
  profileTicks,
} from '@bridge/drawing';
import type { Vec2 } from '@bridge/geom';
import type { ProfileLine } from '@bridge/sections';
import { type PointerEvent, useEffect, useMemo, useState } from 'react';
import { formatNumber } from '../format/number.ts';
import { sk } from '../i18n/sk.ts';
import { ProfileDimensions, SpanInput } from './Dimensions.tsx';
import { DrawingEntities } from './DrawingEntities.tsx';
import { handleAt, type LineEditing, type LinePreview, previewOnHandle } from './lineEdit.ts';
import { MeasureOverlay } from './MeasureOverlay.tsx';
import {
  drawingVertices,
  formatProfileMeasure,
  SNAP_PX,
  snapPoint,
  useMeasure,
} from './measure.ts';
import { useElementSize } from './useElementSize.ts';
import { usePanZoom } from './usePanZoom.ts';
import type { FitRequest, ViewTool } from './viewState.ts';
import {
  fitView,
  focusRange,
  niceStep,
  type SRange,
  screenToWorld,
  worldToScreen,
} from './viewTransform.ts';

/** Kurzor v profile: staničenie osi cesty (päta kolmice) a bod čiary profilu v pôdoryse. */
export interface ProfileCursor {
  s: number | undefined;
  point: Vec2;
  /** hodnoty profilu pod kurzorom */
  readout: ProfileReadout;
}

interface Props {
  /** čiara profilu (os cesty, os mosta, okraj NK, iná os, čiara; Fáza 10b): x = u čiary */
  line: ProfileLine;
  /** názov pohľadu (os profilu) */
  title?: string | undefined;
  /** spoločný kurzor v spojitom staničení osi cesty */
  cursorS: number | undefined;
  onCursor: (cursor: ProfileCursor | undefined) => void;
  /** rozvinutý pozdĺžny rez v čiare profilu 1 : 1 (NK, podpery, terén; ADR 0012) */
  drawing: Drawing | undefined;
  /** terén na okrajoch NK premietnutý do profilu v osi mosta (len na obrazovke) */
  edgeTerrain?: { left: readonly Vec2[][]; right: readonly Vec2[][] } | undefined;
  /** vybraný prvok mosta (zvýraznenie) */
  selected?: string | undefined;
  /** prevýšenie výšok (ribbon); export je vždy 1 : 1 */
  exaggeration: number;
  /** aktívny nástroj (ribbon); profil reaguje na „Oblasť mosta“ */
  tool: ViewTool;
  onTool: (tool: ViewTool) => void;
  /** Prispôsobiť / Celá os z ribbonu */
  fitRequest: FitRequest;
  /** oblasť mosta na osi cesty (Fáza 10a, spojité staničenie) */
  studyArea?: SRange | undefined;
  /** úsek osi cesty, na ktorý sa pohľad prispôsobí (oblasť mosta, inak NK); bez neho celá čiara */
  focus?: SRange | undefined;
  /** vyznačená oblasť mosta (ťahom v nástroji „Oblasť mosta“), spojité staničenie osi cesty */
  onStudyArea?: (range: SRange) => void;
  /** prejsť na staničenie: nová hodnota `nonce` vycentruje pohľad na spojité staničenie `s` */
  goTo?: { s: number; nonce: number } | undefined;
  /** výsledok nástroja Merať (stavový riadok) */
  onMeasure?: (text: string | undefined) => void;
  /** kóty NK v reze (staničenie osi cesty); kreslia sa len v osi cesty a osi mosta */
  dimensions?: readonly DimensionChain[] | undefined;
  /** úpravy osí uloženia (nástroje Os uloženia a Podpera; len v osi cesty a osi mosta, ADR 0017) */
  lineEditing?: LineEditing | undefined;
}

/** niveletu kreslí pohľad sám (s polygónom PVI) */
const OWN_LAYERS: ReadonlySet<LayerId> = new Set(['grade']);
const STATION_LABEL_PX = 110;
const ELEVATION_LINE_PX = 32;
/** šírka pásu oblasti [px], od ktorej sú popisy staničení vnútri pásu */
const BAND_LABELS_INSIDE_PX = 160;
/** najkratšia oblasť mosta [m]; kratší ťah sa berie ako klik */
const MIN_AREA = 1;
const CONTROLS = 'button, input, select, textarea, label';
/** posun ukazovateľa, od ktorého je stlačenie na osi uloženia ťahaním, nie výberom [px] */
const DRAG_PX = 3;

/** y lomenej čiary (vzostupné x) v bode x; mimo rozsahu undefined. */
function yAt(points: readonly Vec2[], x: number): number | undefined {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || x < first.x || x > last.x) return undefined;
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((points[mid] as Vec2).x <= x) lo = mid;
    else hi = mid;
  }
  const a = points[lo] as Vec2;
  const b = points[hi] as Vec2;
  return b.x > a.x ? a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x) : a.y;
}

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
  line,
  title,
  cursorS,
  onCursor,
  drawing,
  edgeTerrain,
  selected,
  exaggeration,
  tool,
  onTool,
  fitRequest,
  studyArea,
  focus,
  onStudyArea,
  goTo,
  onMeasure,
  dimensions,
  lineEditing,
}: Props) {
  const [ref, size] = useElementSize<HTMLDivElement>();
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
  /** zadanie rozpätia na kóte: pole NK, pôvodná hodnota a poloha textu */
  const [spanEdit, setSpanEdit] = useState<{ span: number; value: number; at: Vec2 }>();
  const linesEditable = lineEditing && (line.kind === 'road' || line.kind === 'bridgeAxis');
  const lineTool =
    (tool === 'bearingLine' || tool === 'support') &&
    lineEditing &&
    (line.kind === 'road' || line.kind === 'bridgeAxis')
      ? tool
      : undefined;
  /** rozťahovaná oblasť mosta (u začiatku a kurzora) */
  const [areaDraft, setAreaDraft] = useState<{ u0: number; u1: number }>();
  const whole = fitRequest.whole;
  const road = line.road;
  /** niveleta v čiare profilu (u, výška v m n. m.) */
  const grade = useMemo(() => profileGrade(line), [line]);
  const pvis = useMemo(() => profilePvis(line), [line]);
  const first = grade[0]?.x ?? 0;
  const last = grade.at(-1)?.x ?? 1;
  const toU = (s: number) => line.lengthAt(s);
  const focusU = useMemo(() => {
    if (!focus) return undefined;
    const a = line.lengthAt(focus.sFrom);
    const b = line.lengthAt(focus.sTo);
    return a === undefined || b === undefined
      ? undefined
      : { from: Math.min(a, b), to: Math.max(a, b) };
  }, [focus, line]);
  const range = useMemo(
    () => (focusU && !whole ? focusRange(focusU, first, last) : { from: first, to: last }),
    [focusU, whole, first, last],
  );
  const bounds = useMemo(() => {
    // výškový rozsah zahŕňa niveletu, terén, NK aj podpery v zobrazenom úseku
    const inRange = grade.filter((p) => p.x >= range.from && p.x <= range.to);
    const content = focusU && !whole ? undefined : drawing && drawingBounds(drawing);
    const zs = [
      ...inRange.map((p) => p.y),
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
  }, [grade, drawing, range, focusU, whole]);
  const fit =
    size.width > 0 && grade.length > 1 ? fitView(bounds, size, 48, exaggeration) : undefined;
  const { view, handlers, dragMove, wasDrag, reset, centerOn } = usePanZoom(
    ref,
    size,
    fit,
    tool !== 'area',
  );
  const measure = useMeasure(tool === 'measure');
  const snapTargets = useMemo(() => drawingVertices(drawing, [grade]), [drawing, grade]);
  const measureEnd = measure.b ?? measure.hover?.point;
  const measureLabel = measure.a && measureEnd && formatProfileMeasure(measure.a, measureEnd);
  // biome-ignore lint/correctness/useExhaustiveDependencies: hlási sa len zmena textu merania
  useEffect(() => {
    if (tool === 'measure') onMeasure?.(measureLabel);
  }, [measureLabel, tool]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: prispôsobí sa pri novej žiadosti z ribbonu a pri zmene prevýšenia
  useEffect(() => {
    if (fitRequest.nonce > 0) reset();
  }, [fitRequest.nonce, exaggeration]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: vycentruje sa len pri novej žiadosti (nonce), nie pri zmene pohľadu
  useEffect(() => {
    const u0 = goTo && line.lengthAt(goTo.s);
    if (u0 === undefined) return;
    const u = Math.min(last, Math.max(first, u0));
    const z = yAt(grade, u);
    if (z !== undefined) centerOn({ x: u, y: z });
  }, [goTo?.nonce]);

  // zrušený nástroj (Esc v App) zahodí rozťahovanú oblasť a návrh osi
  useEffect(() => {
    if (tool !== 'area') setAreaDraft(undefined);
    setLinePreview(undefined);
  }, [tool]);

  const stationStep = view ? niceStep(STATION_LABEL_PX / view.sx) : 0;
  const elevationStep = view ? niceStep(ELEVATION_LINE_PX / view.sy) : 0;

  if (grade.length < 2) {
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
      ? profileTicks(
          line,
          stationStep,
          Math.max(first, visible.left.x),
          Math.min(last, visible.right.x),
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
  const gradeLine = grade
    .map((p) => {
      const q = toScreen(p);
      return `${q.x.toFixed(1)},${q.y.toFixed(1)}`;
    })
    .join(' ');
  const polygon = pvis.map(toScreen);

  /** u pod ukazovateľom, orezané na rozsah nivelety. */
  function uAt(e: PointerEvent<HTMLDivElement>): number | undefined {
    if (!view) return undefined;
    const rect = e.currentTarget.getBoundingClientRect();
    const u = screenToWorld(view, size, { x: e.clientX - rect.left, y: e.clientY - rect.top }).x;
    return Math.min(last, Math.max(first, u));
  }

  /** os uloženia pod bodom obrazovky (do 10 px od zvislice, vo výške jej čiary vo výkrese) */
  function lineAt(screen: Vec2) {
    if (!linesEditable || !lineEditing) return undefined;
    return handleAt(screen, lineEditing.handles, toScreen, 'profile', (h) => {
      const axis = drawing?.entities.find(
        (en) => en.kind === 'polyline' && en.layer === 'supportAxis' && en.owner === h.id,
      );
      if (axis?.kind !== 'polyline') return false;
      const ys = axis.points.map((p) => toScreen(p).y);
      return screen.y >= Math.min(...ys) - SNAP_PX && screen.y <= Math.max(...ys) + SNAP_PX;
    });
  }

  function screenOf(e: PointerEvent<HTMLDivElement>): Vec2 {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    const onControl = e.target instanceof Element && e.target.closest(CONTROLS);
    if (tool === 'none' && e.button === 0 && !onControl && view) {
      const screen = screenOf(e);
      const hit = lineAt(screen);
      const s = hit && line.stationAt(screenToWorld(view, size, screen).x);
      if (hit && s !== undefined) {
        e.currentTarget.setPointerCapture(e.pointerId);
        setLineDrag({ id: hit.id, sGrab: s, start: screen, moved: false });
        return;
      }
    }
    if (tool === 'area' && e.button === 0 && !onControl) {
      const u = uAt(e);
      if (u === undefined) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      setAreaDraft({ u0: u, u1: u });
      return;
    }
    handlers.onPointerDown(e);
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (lineDrag) {
      if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId);
      if (lineDrag.moved && linePreview) lineEditing?.commit(linePreview);
      else lineEditing?.select(lineDrag.id);
      setLineDrag(undefined);
      setLinePreview(undefined);
      return;
    }
    if (!areaDraft) {
      handlers.onPointerUp(e);
      return;
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    const a = line.stationAt(Math.min(areaDraft.u0, areaDraft.u1));
    const b = line.stationAt(Math.max(areaDraft.u0, areaDraft.u1));
    if (a !== undefined && b !== undefined && Math.abs(b - a) >= MIN_AREA)
      onStudyArea?.({ sFrom: Math.min(a, b), sTo: Math.max(a, b) });
    setAreaDraft(undefined);
    onTool('none');
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (lineDrag && view && lineEditing) {
      const screen = screenOf(e);
      const moved =
        lineDrag.moved ||
        Math.hypot(screen.x - lineDrag.start.x, screen.y - lineDrag.start.y) > DRAG_PX;
      if (moved !== lineDrag.moved) setLineDrag({ ...lineDrag, moved });
      const s = line.stationAt(screenToWorld(view, size, screen).x);
      if (moved && s !== undefined)
        setLinePreview(
          lineEditing.drag(lineDrag.id, lineDrag.sGrab, s, {
            following: e.ctrlKey || e.metaKey,
            snap: !e.shiftKey,
          }),
        );
      return;
    }
    if (tool === 'none' && view && !e.buttons) setOverLine(lineAt(screenOf(e)) !== undefined);
    if (areaDraft) {
      const u = uAt(e);
      if (u !== undefined) setAreaDraft({ ...areaDraft, u1: u });
    } else if (dragMove(e)) {
      return;
    }
    if (!view) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const world = screenToWorld(view, size, screen);
    if (tool === 'measure') {
      const snapped = e.shiftKey ? undefined : snapPoint(screen, snapTargets, toScreen);
      measure.move({ point: snapped ?? world, snapped: snapped !== undefined });
    }
    const u = world.x;
    if (u < line.uFrom || u > line.uTo) {
      onCursor(undefined);
      setLinePreview(undefined);
      return;
    }
    const s = line.stationAt(u);
    if (lineTool && lineEditing) {
      const free =
        lineTool === 'support'
          ? handleAt(screen, lineEditing.handles, toScreen, 'profile', (h) => h.free)
          : undefined;
      setLinePreview(
        free
          ? previewOnHandle(free)
          : s === undefined
            ? undefined
            : lineEditing.preview(s, undefined, !e.shiftKey),
      );
    }
    onCursor({
      s: s !== undefined && s >= 0 && s <= road.length ? s : undefined,
      point: line.pointAt(u),
      readout: profileReadout(drawing, grade, edgeTerrain, u),
    });
  }

  const cursorU = cursorS === undefined ? undefined : toU(cursorS);
  const cursorZ = cursorU === undefined ? undefined : yAt(grade, cursorU);
  const cursorPoint =
    cursorU !== undefined && cursorZ !== undefined
      ? toScreen({ x: cursorU, y: cursorZ })
      : undefined;
  /** horný povrch a spodok NK na obrazovke (riadky kót nad a pod NK) */
  const dimensionFrame = (() => {
    if (line.kind !== 'road' && line.kind !== 'bridgeAxis') return undefined;
    const ys = (drawing?.entities ?? []).flatMap((e) =>
      e.kind === 'polyline' && e.layer === 'deck' ? e.points.map((p) => toScreen(p).y) : [],
    );
    return ys.length > 0 ? { top: Math.min(...ys), bottom: Math.max(...ys) } : undefined;
  })();
  /** body NK a terénu pod kurzorom (značky a výška spodku NK nad terénom) */
  const readout =
    cursorU === undefined ? undefined : profileReadout(drawing, grade, edgeTerrain, cursorU);
  const mark = (z: number | undefined) =>
    cursorU === undefined || z === undefined ? undefined : toScreen({ x: cursorU, y: z });
  const clearanceLine = (() => {
    const bottom = mark(readout?.deckBottom);
    const ground = mark(readout?.terrain);
    return bottom && ground && readout?.clearance !== undefined ? { bottom, ground } : undefined;
  })();

  /** pás oblasti mosta v u (oblasť je v staničení osi cesty) */
  const band = (() => {
    if (areaDraft)
      return {
        from: Math.min(areaDraft.u0, areaDraft.u1),
        to: Math.max(areaDraft.u0, areaDraft.u1),
      };
    if (!studyArea) return undefined;
    const a = toU(studyArea.sFrom);
    const b = toU(studyArea.sTo);
    return a === undefined || b === undefined
      ? undefined
      : { from: Math.min(a, b), to: Math.max(a, b) };
  })();
  const bandLabel = (u: number) => {
    const s = line.stationAt(u);
    return s === undefined ? '' : formatStation(road.stationing.toDisplay(s).station, 0);
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: body merania sa vyberajú kliknutím do profilu (dočasné meranie, len myšou)
    <div
      ref={ref}
      className="drawing"
      role="application"
      aria-label={sk.viewport.profile}
      data-area-mode={tool === 'area' ? '' : undefined}
      data-add-mode={tool === 'measure' || lineTool !== undefined || undefined}
      data-line-drag={overLine || lineDrag !== undefined || undefined}
      {...handlers}
      onClick={() => {
        if (tool === 'measure' && measure.hover && !wasDrag()) measure.click(measure.hover.point);
        if (lineTool && linePreview && !wasDrag()) {
          lineEditing?.place(linePreview, lineTool);
          setLinePreview(undefined);
        }
      }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerMove={onPointerMove}
      onPointerLeave={() => {
        onCursor(undefined);
        setLinePreview(undefined);
      }}
      onDoubleClick={reset}
    >
      <div className="drawing-toolbar">
        <span className="drawing-title">{title ?? sk.viewport.profile}</span>
      </div>
      {edgeTerrain && (
        <div className="drawing-legend">
          <span className="legend-terrain">{sk.viewport.legend.axis}</span>
          <span className="legend-terrain-left">{sk.viewport.legend.left}</span>
          <span className="legend-terrain-right">{sk.viewport.legend.right}</span>
        </div>
      )}
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
                x={toScreen({ x: band.from, y: 0 }).x}
                y={0}
                width={Math.max(
                  0,
                  toScreen({ x: band.to, y: 0 }).x - toScreen({ x: band.from, y: 0 }).x,
                )}
                height={size.height}
              />
              {[band.from, band.to].map((u, i) => {
                const x = toScreen({ x: u, y: 0 }).x;
                // v úzkom páse by sa popisy prekrývali → dajú sa von z pásu
                const inside =
                  toScreen({ x: band.to, y: 0 }).x - toScreen({ x: band.from, y: 0 }).x >
                  BAND_LABELS_INSIDE_PX;
                const toRight = (i === 0) === inside;
                return (
                  <g key={i === 0 ? 'from' : 'to'}>
                    <line x1={x} y1={0} x2={x} y2={size.height} />
                    <text x={toRight ? x + 4 : x - 4} y={56} textAnchor={toRight ? 'start' : 'end'}>
                      {bandLabel(u)}
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
              const x = toScreen({ x: t.u, y: 0 }).x;
              return (
                <g key={t.u}>
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
          {edgeTerrain &&
            (['left', 'right'] as const).map((side) =>
              edgeTerrain[side].map((run, i) => (
                <polyline
                  // biome-ignore lint/suspicious/noArrayIndexKey: úseky terénu sú určené poradím
                  key={`${side}-${i}`}
                  className={`edge-terrain edge-terrain-${side}`}
                  points={run
                    .map((p) => {
                      const q = toScreen(p);
                      return `${q.x.toFixed(1)},${q.y.toFixed(1)}`;
                    })
                    .join(' ')}
                />
              )),
            )}
          <polyline className="profile-line" points={gradeLine} />
          {cursorPoint && (
            <g className="cursor">
              <line x1={cursorPoint.x} y1={0} x2={cursorPoint.x} y2={size.height} />
              <circle className="cursor-marker" cx={cursorPoint.x} cy={cursorPoint.y} r={5} />
            </g>
          )}
          {dimensionFrame && dimensions && (
            <ProfileDimensions
              // pri návrhu osi sa rozpätia ukazujú živo (nižšie)
              chains={linePreview ? dimensions.filter((c) => c.kind !== 'spans') : dimensions}
              toX={(s) => {
                const u = toU(s);
                return u === undefined ? undefined : toScreen({ x: u, y: 0 }).x;
              }}
              top={dimensionFrame.top}
              bottom={dimensionFrame.bottom}
              height={size.height}
              onEdit={
                linesEditable && tool === 'none'
                  ? (seg, at) =>
                      seg.span !== undefined &&
                      setSpanEdit({ span: seg.span, value: seg.value, at })
                  : undefined
              }
            />
          )}
          {[linePreview, ...(linePreview?.extra ?? [])].map((p, i) =>
            p?.u === undefined ? null : (
              <line
                // biome-ignore lint/suspicious/noArrayIndexKey: náhľad osí je určený poradím
                key={i}
                className="line-preview"
                x1={toScreen({ x: p.u, y: 0 }).x}
                y1={0}
                x2={toScreen({ x: p.u, y: 0 }).x}
                y2={size.height}
              />
            ),
          )}
          {linePreview && dimensionFrame && linePreview.spans.length > 0 && (
            <ProfileDimensions
              chains={[{ kind: 'spans', segments: linePreview.spans }]}
              toX={(s) => {
                const u = toU(s);
                return u === undefined ? undefined : toScreen({ x: u, y: 0 }).x;
              }}
              top={dimensionFrame.top}
              bottom={dimensionFrame.bottom}
              height={size.height}
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
          {readout && (
            <g className="readout">
              {clearanceLine && (
                <line
                  className="readout-clearance"
                  x1={clearanceLine.bottom.x}
                  y1={clearanceLine.bottom.y}
                  x2={clearanceLine.ground.x}
                  y2={clearanceLine.ground.y}
                />
              )}
              {(
                [
                  ['deck', readout.deckTop],
                  ['deck', readout.deckBottom],
                  ['terrain', readout.terrain],
                  ['terrain-left', readout.terrainLeft],
                  ['terrain-right', readout.terrainRight],
                ] as const
              ).map(([kind, z], i) => {
                const q = mark(z);
                return q ? (
                  // biome-ignore lint/suspicious/noArrayIndexKey: pevné poradie značiek
                  <circle key={i} className={`readout-${kind}`} cx={q.x} cy={q.y} r={3.5} />
                ) : null;
              })}
            </g>
          )}
        </svg>
      )}
      {spanEdit && (
        <SpanInput
          at={spanEdit.at}
          value={spanEdit.value}
          onCommit={(length) => {
            lineEditing?.setSpan(undefined, spanEdit.span, length);
            setSpanEdit(undefined);
          }}
          onCancel={() => setSpanEdit(undefined)}
        />
      )}
    </div>
  );
}
