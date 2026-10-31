import type { Scope } from '@bridge/expr';
import type { Vec2 } from '@bridge/geom';
import type { ProfileDefinition, ProfileLoop, ProfilePoint } from '@bridge/model';
import {
  type ConstraintSpec,
  constrainPoint,
  constraintExpressions,
  dragPoint,
  drivingIdentifiers,
  evaluateProfileDefinition,
  recognizeConstraint,
} from '@bridge/sections';
import { type PointerEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { formatNumber } from '../format/number.ts';
import { formatModelIssue } from '../i18n/modelIssues.ts';
import { sk } from '../i18n/sk.ts';
import {
  addLoop,
  addPoint,
  nextPointName,
  removePoint,
  type Snapped,
  setPointExpressions,
  snapPoint,
} from '../store/profileSketch.ts';
import { useElementSize } from './useElementSize.ts';
import { usePanZoom } from './usePanZoom.ts';
import type { FitRequest } from './viewState.ts';
import { boundsOf, fitView, niceStep, screenToWorld, worldToScreen } from './viewTransform.ts';

interface Props {
  profile: ProfileDefinition;
  /** hodnoty parametrov profilu (z NK na staničení, inak predvolené) */
  values: ReadonlyMap<string, number>;
  globals: Scope;
  station: number;
  /** odkiaľ sú hodnoty parametrov (NK a staničenie / predvolené) */
  source: string;
  stationControl: ReactNode;
  selectedPoint: string | undefined;
  onSelectPoint: (name: string | undefined) => void;
  onChange: (def: ProfileDefinition) => void;
  onMessage: (text: string | undefined) => void;
  /** nástroj a druh nového obrysu z kontextovej karty ribbonu (ADR 0016) */
  tool: ProfileTool;
  loopRole: ProfileLoop['role'];
  /** Prispôsobiť z ribbonu */
  fitRequest: FitRequest;
}

/** Nástroj editora prierezu (kontextová karta „Upraviť | Prierez“). */
export type ProfileTool = 'select' | 'point' | 'loop' | 'delete';
/** Vzdialenosť, do ktorej klik zasiahne bod [px]. */
const HIT_PX = 8;

const mm = (m: number) => formatNumber(m * 1000, 0);

/**
 * Grafický editor prierezu (Fáza 8b): body s menami, obrysy a dutiny v rámci prierezu, ťahanie bodov (mení voľné
 * hodnoty väzby, `dragPoint`), pridanie bodu, obrys klikaním bodov, odstránenie bodu. Prichytávanie na mriežku
 * 10 mm a zarovnanie s inými bodmi. Každá úprava = jeden príkaz (späť / znova).
 */
export function ProfileEditorView({
  profile,
  values,
  globals,
  station,
  source,
  stationControl,
  selectedPoint,
  onSelectPoint,
  onChange,
  onMessage,
  tool,
  loopRole,
  fitRequest,
}: Props) {
  const t = sk.profileEditor;
  const [ref, size] = useElementSize<HTMLDivElement>();
  const [loopDraft, setLoopDraft] = useState<string[]>([]);
  // zmena nástroja zahodí rozkreslený obrys
  // biome-ignore lint/correctness/useExhaustiveDependencies: reaguje len na zmenu nástroja
  useEffect(() => setLoopDraft([]), [tool]);
  const [second, setSecond] = useState<string>();
  const [drag, setDrag] = useState<{
    name: string;
    start: ProfilePoint;
    from: Vec2;
    expr: { x: string; y: string };
  }>();
  const [hover, setHover] = useState<Snapped>();

  const shown = drag ? setPointExpressions(profile, drag.name, drag.expr) : profile;
  const evaluated = useMemo(
    () => evaluateProfileDefinition(shown, values, globals, station),
    [shown, values, globals, station],
  );
  const points = evaluated.points;

  // pohľad sa prispôsobí pri zmene prierezu, nie pri každej úprave
  // biome-ignore lint/correctness/useExhaustiveDependencies: zámerne len podľa id prierezu a veľkosti
  const bounds = useMemo(() => {
    const b = boundsOf([...evaluated.points.values()]);
    return { minX: b.minX - 0.5, maxX: b.maxX + 0.5, minY: b.minY - 0.5, maxY: b.maxY + 0.5 };
  }, [profile.id, size.width > 0]);
  const fit = size.width > 0 && points.size > 0 ? fitView(bounds, size, 48) : undefined;
  const { view, handlers, dragMove, wasDrag, reset } = usePanZoom(ref, size, fit);
  // biome-ignore lint/correctness/useExhaustiveDependencies: prispôsobí sa len pri novej žiadosti z ribbonu
  useEffect(() => {
    if (fitRequest.nonce > 0) reset();
  }, [fitRequest.nonce]);
  const toScreen = (p: Vec2) => (view ? worldToScreen(view, size, p) : p);

  const worldAt = (e: { clientX: number; clientY: number }): Vec2 | undefined => {
    if (!view || !ref.current) return undefined;
    const r = ref.current.getBoundingClientRect();
    return screenToWorld(view, size, { x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const hit = (e: { clientX: number; clientY: number }): string | undefined => {
    const w = worldAt(e);
    if (!w || !view) return undefined;
    let best: { name: string; d: number } | undefined;
    for (const [name, p] of points) {
      const d = Math.hypot(p.x - w.x, p.y - w.y) * view.sx;
      if (d <= HIT_PX && (!best || d < best.d)) best = { name, d };
    }
    return best?.name;
  };
  const snapAt = (e: { clientX: number; clientY: number }, except?: string) => {
    const w = worldAt(e);
    if (!w || !view) return undefined;
    const others = [...points].filter(([n]) => n !== except).map(([, p]) => p);
    return snapPoint(w, others, view.sx);
  };

  function closeLoop(names: string[]) {
    if (names.length >= 3) onChange(addLoop(profile, names, loopRole));
    setLoopDraft([]);
  }

  // Enter uzavrie obrys, Esc zruší rozpracovaný obrys alebo ťahanie, Delete odstráni vybraný bod
  // biome-ignore lint/correctness/useExhaustiveDependencies: poslucháč sa obnoví pri zmene stavu, ktorý číta
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select')) return;
      if (e.key === 'Enter' && tool === 'loop') closeLoop(loopDraft);
      if (e.key === 'Escape') {
        setLoopDraft([]);
        setDrag(undefined);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPoint) {
        onChange(removePoint(profile, selectedPoint));
        onSelectPoint(undefined);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tool, loopDraft, selectedPoint, profile, loopRole]);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    // panel s údajmi a väzbou nad výkresom nepohybuje bodmi ani pohľadom
    if (e.target instanceof Element && e.target.closest('.pe-readout')) return;
    if (e.button === 0 && tool === 'select' && view) {
      const name = hit(e);
      const point = profile.points.find((p) => p.name === name);
      const at = name ? points.get(name) : undefined;
      if (name && point && at) {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag({ name, start: point, from: at, expr: { x: point.x, y: point.y } });
        return;
      }
    }
    handlers.onPointerDown(e);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (drag) {
      const s = snapAt(e, drag.name);
      if (!s) return;
      setHover(s);
      const next = dragPoint(drag.start, s.point, drag.from);
      if (next) setDrag({ ...drag, expr: next });
      return;
    }
    if (dragMove(e)) return;
    setHover(tool === 'point' || tool === 'loop' ? snapAt(e) : undefined);
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    handlers.onPointerUp(e);
    if (!drag) return;
    const changed = drag.expr.x !== drag.start.x || drag.expr.y !== drag.start.y;
    if (changed) {
      onChange(setPointExpressions(profile, drag.name, drag.expr));
      onSelectPoint(drag.name);
    } else if (e.shiftKey && selectedPoint && selectedPoint !== drag.name) {
      setSecond(drag.name);
    } else {
      onSelectPoint(drag.name);
      setSecond(undefined);
      // zamknutý bod: ktoré parametre ho riadia
      if (!dragPoint(drag.start, drag.from, drag.from)) {
        const names = [
          ...new Set([...drivingIdentifiers(drag.start.x), ...drivingIdentifiers(drag.start.y)]),
        ];
        onMessage(t.locked(drag.name, names.join(', ') || '—'));
      } else onMessage(undefined);
    }
    setDrag(undefined);
    setHover(undefined);
  }

  function onClick(e: React.MouseEvent<HTMLDivElement>) {
    if (wasDrag() || !view) return;
    if (e.target instanceof Element && e.target.closest('button, select, label, .pe-readout'))
      return;
    const name = hit(e);
    if (tool === 'point') {
      const s = snapAt(e);
      if (!s) return;
      const o = evaluated.origin;
      const n = nextPointName(profile);
      onChange(
        addPoint(
          profile,
          n,
          constraintExpressions({ kind: 'fixed', x: s.point.x + o.x, y: s.point.y + o.y }),
        ),
      );
      onSelectPoint(n);
    } else if (tool === 'loop' && name) {
      if (name === loopDraft[0] && loopDraft.length >= 3) closeLoop(loopDraft);
      else if (!loopDraft.includes(name)) setLoopDraft([...loopDraft, name]);
    } else if (tool === 'delete' && name) {
      if (name === profile.referencePoint) {
        onMessage(t.referenceNotRemovable);
        return;
      }
      onChange(removePoint(profile, name));
      if (selectedPoint === name) onSelectPoint(undefined);
    } else if (tool === 'select' && !name) {
      onSelectPoint(undefined);
      setSecond(undefined);
    }
  }

  const selected = selectedPoint ? profile.points.find((p) => p.name === selectedPoint) : undefined;
  const selectedAt = selectedPoint ? points.get(selectedPoint) : undefined;
  const secondAt = second ? points.get(second) : undefined;
  const constraint = selected && recognizeConstraint(selected);
  const errorPoints = new Set(evaluated.issues.flatMap((i) => (i.point ? [i.point] : [])));

  const grid = useMemo(() => {
    if (!view) return { xs: [] as number[], ys: [] as number[] };
    const step = niceStep(40 / view.sx);
    const a = screenToWorld(view, size, { x: 0, y: size.height });
    const b = screenToWorld(view, size, { x: size.width, y: 0 });
    const xs: number[] = [];
    const ys: number[] = [];
    for (let x = Math.ceil(a.x / step) * step; x <= b.x && xs.length < 400; x += step) xs.push(x);
    for (let y = Math.ceil(a.y / step) * step; y <= b.y && ys.length < 400; y += step) ys.push(y);
    return { xs, ys };
  }, [view, size]);

  const path = (pts: readonly Vec2[]) =>
    `${pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${toScreen(p).x.toFixed(1)},${toScreen(p).y.toFixed(1)}`).join('')}Z`;

  return (
    <div className="section-view">
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: kreslenie myšou; body sa dajú upraviť aj v tabuľke v pravom paneli */}
      <div
        ref={ref}
        className="drawing section-drawing profile-editor"
        role="application"
        aria-label={t.title(profile.name)}
        {...handlers}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => !drag && setHover(undefined)}
        onClick={onClick}
        data-tool={tool}
      >
        {view && (
          <svg
            width={size.width}
            height={size.height}
            role="img"
            aria-label={t.title(profile.name)}
          >
            <g className="pe-grid">
              {grid.xs.map((x) => (
                <line
                  key={`x${x}`}
                  x1={toScreen({ x, y: 0 }).x}
                  x2={toScreen({ x, y: 0 }).x}
                  y1={0}
                  y2={size.height}
                />
              ))}
              {grid.ys.map((y) => (
                <line
                  key={`y${y}`}
                  y1={toScreen({ x: 0, y }).y}
                  y2={toScreen({ x: 0, y }).y}
                  x1={0}
                  x2={size.width}
                />
              ))}
            </g>
            <line
              className="road-axis"
              x1={toScreen({ x: 0, y: 0 }).x}
              x2={toScreen({ x: 0, y: 0 }).x}
              y1={0}
              y2={size.height}
            />
            <path
              className="deck-fill"
              d={evaluated.loops.map((l) => path(l.polygon)).join('')}
              fillRule="evenodd"
            />
            {hover?.guides.x !== undefined && (
              <line
                className="pe-guide"
                x1={toScreen({ x: hover.guides.x, y: 0 }).x}
                x2={toScreen({ x: hover.guides.x, y: 0 }).x}
                y1={0}
                y2={size.height}
              />
            )}
            {hover?.guides.y !== undefined && (
              <line
                className="pe-guide"
                y1={toScreen({ x: 0, y: hover.guides.y }).y}
                y2={toScreen({ x: 0, y: hover.guides.y }).y}
                x1={0}
                x2={size.width}
              />
            )}
            {loopDraft.length > 0 && (
              <polyline
                className="pe-draft"
                points={[
                  ...loopDraft.flatMap((n) => (points.get(n) ? [points.get(n) as Vec2] : [])),
                  ...(hover ? [hover.point] : []),
                ]
                  .map((p) => `${toScreen(p).x.toFixed(1)},${toScreen(p).y.toFixed(1)}`)
                  .join(' ')}
              />
            )}
            {selectedAt && secondAt && (
              <line
                className="pe-measure"
                x1={toScreen(selectedAt).x}
                y1={toScreen(selectedAt).y}
                x2={toScreen(secondAt).x}
                y2={toScreen(secondAt).y}
              />
            )}
            {[...points].map(([name, p]) => {
              const q = toScreen(p);
              const cls = [
                'pe-point',
                name === selectedPoint || name === second ? 'pe-point-selected' : '',
                errorPoints.has(name) ? 'pe-point-error' : '',
                name === profile.referencePoint ? 'pe-point-reference' : '',
                loopDraft.includes(name) ? 'pe-point-draft' : '',
              ].join(' ');
              return (
                <g key={name} className={cls}>
                  <circle cx={q.x} cy={q.y} r={name === selectedPoint ? 5 : 4} />
                  <text x={q.x + 7} y={q.y - 7}>
                    {name}
                  </text>
                </g>
              );
            })}
            {tool === 'point' && hover && (
              <circle
                className="pe-cursor"
                cx={toScreen(hover.point).x}
                cy={toScreen(hover.point).y}
                r={4}
              />
            )}
          </svg>
        )}
        <div className="pe-readout">
          <div className="hint">{source}</div>
          {selected && selectedAt && (
            <>
              <div>
                <strong>{selected.name}</strong> x = {mm(selectedAt.x)} mm, y = {mm(selectedAt.y)}{' '}
                mm
              </div>
              <div className="mono">
                x: {selected.x} · y: {selected.y}
              </div>
              <div className="hint">
                {constraint ? t.constraints[constraint.kind] : t.parametric}
              </div>
              {selected.name !== profile.referencePoint && (
                <ConstraintEditor
                  key={`${selected.name}:${selected.x}:${selected.y}`}
                  current={constraint}
                  earlier={profile.points
                    .slice(
                      0,
                      profile.points.findIndex((p) => p.name === selected.name),
                    )
                    .map((p) => p.name)}
                  onApply={(spec) =>
                    onChange(
                      setPointExpressions(
                        profile,
                        selected.name,
                        constrainPoint(spec, selectedAt, points, evaluated.origin),
                      ),
                    )
                  }
                />
              )}
            </>
          )}
          {selectedAt && secondAt && second && (
            <div>
              {t.distance(selectedPoint ?? '', second)}: Δx = {mm(secondAt.x - selectedAt.x)} mm, Δy
              = {mm(secondAt.y - selectedAt.y)} mm
            </div>
          )}
          {evaluated.issues.length > 0 && (
            <ul className="issues">
              {evaluated.issues.map((i) => (
                <li
                  key={formatModelIssue(i)}
                  className={i.severity === 'warning' ? 'issue issue-warning' : 'issue issue-error'}
                >
                  {formatModelIssue(i)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="view-bar">{stationControl}</div>
    </div>
  );
}

type Kind = ConstraintSpec['kind'];
const KINDS: Kind[] = [
  'fixed',
  'offset',
  'below',
  'level',
  'slope',
  'onLine',
  'intersection',
  'mirror',
];
/** Počet referenčných bodov podľa druhu väzby. */
const REFS: Record<Kind, number> = {
  fixed: 0,
  offset: 1,
  below: 1,
  level: 1,
  slope: 1,
  mirror: 1,
  onLine: 2,
  intersection: 4,
};

/** Druh väzby a referenčné body (len skoršie body — bod nesmie odkazovať na neskorší). */
function ConstraintEditor({
  current,
  earlier,
  onApply,
}: {
  current: ReturnType<typeof recognizeConstraint>;
  earlier: readonly string[];
  onApply: (spec: ConstraintSpec) => void;
}) {
  const t = sk.profileEditor;
  const initialRefs = (): string[] => {
    if (!current) return [];
    if ('ref' in current) return [current.ref];
    if (current.kind === 'onLine') return [current.a, current.b];
    if (current.kind === 'intersection') return [current.a, current.b, current.c, current.d];
    return [];
  };
  const [kind, setKind] = useState<Kind>(current?.kind ?? 'fixed');
  const [refs, setRefs] = useState<string[]>(initialRefs);
  const need = REFS[kind];
  const chosen = Array.from({ length: need }, (_, i) => refs[i] ?? earlier[earlier.length - 1 - i]);
  const ready = chosen.every((r) => r !== undefined && earlier.includes(r));
  const spec = (): ConstraintSpec | undefined => {
    if (!ready) return undefined;
    const [a, b, c, d] = chosen as string[];
    switch (kind) {
      case 'fixed':
        return { kind };
      case 'onLine':
        return { kind, a: a as string, b: b as string };
      case 'intersection':
        return { kind, a: a as string, b: b as string, c: c as string, d: d as string };
      default:
        return { kind, ref: a as string };
    }
  };
  return (
    <div className="pe-constraint">
      <label className="field">
        <span>{t.constraint}</span>
        <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {t.constraints[k]}
            </option>
          ))}
        </select>
      </label>
      {chosen.map((r, i) => (
        <label
          // biome-ignore lint/suspicious/noArrayIndexKey: referenčné body sú určené poradím (A, B, C, D)
          key={i}
          className="field"
        >
          <span>{need === 1 ? t.refPoint : t.refPoints[i]}</span>
          <select
            value={r ?? ''}
            onChange={(e) => {
              const next = [...chosen] as string[];
              next[i] = e.target.value;
              setRefs(next);
            }}
          >
            {earlier.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      ))}
      {need > earlier.length && <p className="hint">{t.needsEarlier}</p>}
      <button
        type="button"
        className="button"
        disabled={!ready}
        onClick={() => {
          const s = spec();
          if (s) onApply(s);
        }}
      >
        {t.applyConstraint}
      </button>
    </div>
  );
}
