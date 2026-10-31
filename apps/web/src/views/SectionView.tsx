import type { Drawing, DrawnSection, LayerId } from '@bridge/drawing';
import type { Vec2 } from '@bridge/geom';
import { useEffect, useMemo } from 'react';
import { formatNumber } from '../format/number.ts';
import { sk } from '../i18n/sk.ts';
import { DrawingEntities } from './DrawingEntities.tsx';
import { StationControl } from './StationControl.tsx';
import { useElementSize } from './useElementSize.ts';
import { usePanZoom } from './usePanZoom.ts';
import type { FitRequest } from './viewState.ts';
import { boundsOf, fitView, worldToScreen } from './viewTransform.ts';

interface Props {
  sections: readonly DrawnSection[];
  station: number;
  range: { from: number; to: number } | undefined;
  onStation: (station: number) => void;
  /** čas posledného výpočtu prierezov [ms] */
  elapsed: number;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  emptyActions: React.ReactNode;
  /** je načítaná os cesty s niveletou (inak sa NK nedá vytvoriť) */
  canInsert: boolean;
  /** pohľady na podpery na tomto staničení (X od osi cesty, Y m n. m.) */
  supports: readonly {
    id: string;
    name: string;
    body: readonly (readonly Vec2[])[];
    footing: readonly Vec2[] | undefined;
  }[];
  /** priečne terénne čiary (x od osi cesty, y v m n. m.) */
  terrain?: readonly { id: string; runs: readonly (readonly Vec2[])[] }[];
  /** priečny rez ako výkres (terén, podpery; ADR 0012); NK s výberom a kótami kreslí pohľad sám */
  drawing?: Drawing | undefined;
  /** Prispôsobiť z ribbonu */
  fitRequest: FitRequest;
}

const OWN_LAYERS: ReadonlySet<LayerId> = new Set(['deck', 'deckVoid', 'roadAxis']);

const mm = (m: number) => formatNumber(m * 1000, 0);

/** Priečny rez všetkými NK na zvolenom staničení s kótami šírky a výšky v osi. */
export function SectionView({
  sections,
  station,
  range,
  onStation,
  elapsed,
  selectedId,
  onSelect,
  emptyActions,
  canInsert,
  supports,
  terrain = [],
  drawing,
  fitRequest,
}: Props) {
  const [ref, size] = useElementSize<HTMLDivElement>();

  // pohľad sa prispôsobí len pri zmene zostavy NK, nie pri každom staničení
  const layoutKey = [
    ...sections.map((s) => s.id),
    ...supports.map((s) => s.id),
    ...terrain.map((t) => t.id),
  ].join('|');
  // biome-ignore lint/correctness/useExhaustiveDependencies: pohľad sa prepočíta zámerne len pri zmene zostavy NK
  const bounds = useMemo(() => {
    const pts = [
      ...sections.flatMap((s) => s.loops.flatMap((l) => l.points)),
      ...supports.flatMap((s) => [...(s.footing ?? []), ...s.body.flat()]),
    ];
    // terén pod mostom (v šírke NK + 10 m) sa zmestí do pohľadu, celý koridor nie
    const deck = boundsOf(pts);
    const ground = terrain.flatMap((t) =>
      t.runs.flatMap((r) => r.filter((p) => p.x >= deck.minX - 10 && p.x <= deck.maxX + 10)),
    );
    const b = boundsOf([...pts, ...ground]);
    return { minX: b.minX, maxX: b.maxX, minY: b.minY - 1.2, maxY: b.maxY + 1.5 };
  }, [layoutKey, size.width > 0]);
  const fit = size.width > 0 && sections.length > 0 ? fitView(bounds, size, 40) : undefined;
  const { view, handlers, dragMove, reset } = usePanZoom(ref, size, fit);
  // biome-ignore lint/correctness/useExhaustiveDependencies: prispôsobí sa len pri novej žiadosti z ribbonu
  useEffect(() => {
    if (fitRequest.nonce > 0) reset();
  }, [fitRequest.nonce]);

  const toScreen = (p: Vec2) => (view ? worldToScreen(view, size, p) : p);
  const path = (pts: readonly Vec2[]) =>
    `${pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${toScreen(p).x.toFixed(1)},${toScreen(p).y.toFixed(1)}`).join('')}Z`;

  return (
    <div className="section-view">
      <div
        ref={ref}
        className="drawing section-drawing"
        role="application"
        aria-label={sk.section.title}
        {...handlers}
        onPointerMove={(e) => dragMove(e)}
        onDoubleClick={reset}
      >
        {sections.length === 0 && (
          <div className="section-empty">
            <p className="panel-empty">{sk.section.empty}</p>
            {!canInsert && <p className="notice">{sk.section.needsAlignment}</p>}
            {emptyActions}
          </div>
        )}
        {view && sections.length > 0 && (
          <svg width={size.width} height={size.height} role="img" aria-label={sk.section.title}>
            <line
              className="road-axis"
              x1={toScreen({ x: 0, y: 0 }).x}
              x2={toScreen({ x: 0, y: 0 }).x}
              y1={0}
              y2={size.height}
            />
            {drawing && (
              <DrawingEntities entities={drawing.entities} toScreen={toScreen} skip={OWN_LAYERS} />
            )}
            {sections.map((s) => {
              const selected = s.id === selectedId;
              const topY = toScreen({ x: 0, y: s.top }).y - 18;
              const left = toScreen({ x: s.left, y: s.top }).x;
              const right = toScreen({ x: s.right, y: s.top }).x;
              const axis = toScreen(s.axis);
              const bottom =
                s.heightAtAxis === undefined
                  ? undefined
                  : toScreen({ x: s.axis.x, y: s.axis.y - s.heightAtAxis });
              return (
                // biome-ignore lint/a11y/useSemanticElements: v SVG nemožno použiť <button>; <g> s rolou je správna náhrada
                <g
                  key={s.id}
                  className={selected ? 'deck deck-selected' : 'deck'}
                  role="button"
                  tabIndex={0}
                  aria-label={s.name}
                  onClick={() => onSelect(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') onSelect(s.id);
                  }}
                >
                  <path
                    className="deck-fill"
                    d={s.loops.map((l) => path(l.points)).join('')}
                    fillRule="evenodd"
                  />
                  <line
                    className="deck-axis"
                    x1={axis.x}
                    x2={axis.x}
                    y1={axis.y - 30}
                    y2={axis.y + 10}
                  />
                  <circle className="deck-ref" cx={axis.x} cy={axis.y} r={3} />
                  <g className="dimension">
                    <line x1={left} x2={right} y1={topY} y2={topY} />
                    <line x1={left} x2={left} y1={topY - 4} y2={topY + 4} />
                    <line x1={right} x2={right} y1={topY - 4} y2={topY + 4} />
                    <text x={(left + right) / 2} y={topY - 5} textAnchor="middle">
                      {mm(s.width)}
                    </text>
                    {bottom && (
                      <>
                        <line x1={axis.x + 8} x2={bottom.x + 8} y1={axis.y} y2={bottom.y} />
                        <text x={axis.x + 12} y={(axis.y + bottom.y) / 2} dominantBaseline="middle">
                          {mm(s.heightAtAxis ?? 0)}
                        </text>
                      </>
                    )}
                  </g>
                  <text
                    className="deck-label"
                    x={(left + right) / 2}
                    y={topY - 20}
                    textAnchor="middle"
                  >
                    {s.name}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
      <div className="view-bar">
        <StationControl station={station} range={range} onStation={onStation} />
        <span className="hint">{sk.section.elapsed(formatNumber(elapsed, 1))}</span>
      </div>
    </div>
  );
}
