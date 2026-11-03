import type { Entity, LayerId } from '@bridge/drawing';
import type { Vec2 } from '@bridge/geom';

/** Trieda CSS pre hladinu výkresu v pohľade (farby z témy aplikácie, nie z ACI). */
const LAYER_CLASS: Record<LayerId, string> = {
  roadAxis: 'road-axis',
  bridgeAxis: 'deck-axis',
  supportAxis: 'dw-support-axis',
  stationing: 'dw-stationing',
  deck: 'dw-deck',
  deckVoid: 'dw-void',
  edgeBeam: 'dw-edge-beam',
  support: 'support-body',
  footing: 'support-footing',
  bearing: 'support-bearing',
  terrain: 'terrain-line',
  grade: 'profile-line',
  label: 'dw-label',
  planLine: 'dw-plan-line',
  obstacle: 'dw-obstacle',
  clearance: 'dw-clearance',
  survey: 'dw-survey',
  surveyText: 'dw-survey-text',
};

interface Props {
  entities: readonly Entity[];
  toScreen: (p: Vec2) => Vec2;
  /** hladiny, ktoré pohľad kreslí sám (napr. os s farbami prvkov) */
  skip?: ReadonlySet<LayerId>;
  /** id vybraného objektu (zvýrazní jeho entity) */
  selected?: string | undefined;
  /** objekty, ktorých popis kreslí pohľad sám (osi uloženia v krúžkoch nad kótami, ADR 0026) */
  hideLabels?: ReadonlySet<string> | undefined;
}

const ANCHOR = { left: 'start', center: 'middle', right: 'end' } as const;

const fixed = (p: Vec2) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;

/**
 * Entity výkresového modelu v pohľade (ADR 0012): čiary a obrysy v súradniciach obrazovky, texty pevnou veľkosťou
 * písma podľa CSS (nezávisle od priblíženia).
 */
export function DrawingEntities({ entities, toScreen, skip, selected, hideLabels }: Props) {
  return (
    <g className="drawing-entities">
      {entities.map((e, i) => {
        if (skip?.has(e.layer)) return null;
        if (e.layer === 'label' && e.owner !== undefined && hideLabels?.has(e.owner)) return null;
        const className = `${LAYER_CLASS[e.layer]}${e.owner !== undefined && e.owner === selected ? ' dw-selected' : ''}`;
        if (e.kind === 'polyline') {
          const points = e.points.map((p) => fixed(toScreen(p))).join(' ');
          return e.closed ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: entity výkresu sú určené poradím (generujú sa nanovo)
            <polygon key={i} className={className} points={points} />
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: entity výkresu sú určené poradím (generujú sa nanovo)
            <polyline key={i} className={className} points={points} />
          );
        }
        const at = toScreen(e.at);
        const deg = (-e.rotation * 180) / Math.PI;
        return (
          <text
            // biome-ignore lint/suspicious/noArrayIndexKey: entity výkresu sú určené poradím (generujú sa nanovo)
            key={i}
            className={className}
            x={at.x}
            y={at.y}
            textAnchor={ANCHOR[e.align]}
            transform={
              Math.abs(deg) > 1e-9 ? `rotate(${deg.toFixed(2)} ${at.x} ${at.y})` : undefined
            }
          >
            {e.text}
          </text>
        );
      })}
    </g>
  );
}
