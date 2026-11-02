import { formatStation } from '@bridge/alignment';
import {
  type BridgeAxis,
  CLEARANCE_PRESETS,
  type Clearance,
  defaultClearance,
  type Obstacle,
  type ObstacleKind,
  type PlanLine,
} from '@bridge/model';
import type { ClearanceCheck, ObstacleResult } from '@bridge/sections';
import { formatNumber } from '../../format/number.ts';
import { formatModelIssue } from '../../i18n/modelIssues.ts';
import { sk } from '../../i18n/sk.ts';
import type { Command } from '../../store/commands.ts';
import { curveFromKey, curveKey } from '../../store/curves.ts';
import type { PropertyRow, PropertySheet } from './PropertyGrid.tsx';

type Dispatch = (command: Command) => void;

const KINDS: readonly ObstacleKind[] = [
  'road',
  'railway',
  'water',
  'fieldRoad',
  'footpath',
  'other',
];
const CLEARANCE_KEYS = ['left', 'right', 'height', 'slopeLeft', 'slopeRight', 'chamfer'] as const;

/** Kľúč výberu osi prekážky: os z LandXML, čiara v pôdoryse, čiara meračky alebo ručné kríženie. */
export function referenceKey(reference: Obstacle['reference']): string {
  return reference.type === 'station' ? 'station' : curveKey(reference.curve);
}

/** Predvoľba, ktorej rozmery má voľný prierez (inak vlastné). */
export function presetOf(clearance: Clearance): string {
  return (
    CLEARANCE_PRESETS.find((p) => CLEARANCE_KEYS.every((k) => p.clearance[k] === clearance[k]))
      ?.key ?? ''
  );
}

/**
 * Prekážka v mriežke vlastností (ADR 0020): názov a druh (zmena druhu nastaví jeho predvoľbu), os (krivka alebo
 * ručné kríženie na km), úroveň spodku voľného prierezu, voľný prierez s predvoľbou a označením zástupných hodnôt,
 * kríženia s osami mostov a problémy.
 */
export function obstacleSheet(input: {
  obstacle: Obstacle;
  result: ObstacleResult | undefined;
  /** voľná výška pod NK a kontroly (ADR 0020) */
  check?: ClearanceCheck | undefined;
  alignments: readonly { name: string }[];
  planLines: readonly Pick<PlanLine, 'id' | 'name'>[];
  /** čiary meračiek (kľúč `curveKey`, popis) — ADR 0021 */
  surveyLines?: readonly { value: string; label: string }[];
  bridgeAxes: readonly Pick<BridgeAxis, 'id' | 'name'>[];
  onDelete: () => void;
  dispatch: Dispatch;
}): PropertySheet {
  const t = sk.obstacles;
  const { obstacle, result } = input;
  const set = (changes: Partial<Obstacle>) =>
    input.dispatch({ type: 'updateElement', collection: 'obstacles', id: obstacle.id, changes });
  const ref = obstacle.reference;
  const c = obstacle.clearance;
  const expr = (label: string, value: string, onCommit: (v: string) => void): PropertyRow => ({
    kind: 'expression',
    label,
    value,
    onCommit,
  });
  const firstRoad = input.alignments[0]?.name ?? '';

  const referenceRows: PropertyRow[] = [
    {
      kind: 'select',
      label: t.axis,
      value: referenceKey(ref),
      options: [
        ...input.alignments.map((a) => ({
          value: `alignment:${a.name}`,
          label: t.curveAlignment(a.name),
        })),
        ...input.planLines.map((l) => ({
          value: `planLine:${l.id}`,
          label: t.curvePlanLine(l.name),
        })),
        ...(input.surveyLines ?? []).map((l) => ({
          value: l.value,
          label: t.curveSurvey(l.label),
        })),
        { value: 'station', label: t.manual },
      ],
      onChange: (v) => {
        if (v === 'station') {
          const crossing = result?.crossings[0];
          set({
            reference: {
              type: 'station',
              alignment: firstRoad,
              station: Math.round((crossing?.station ?? 0) * 1e4) / 1e4,
              angle: crossing ? String(Math.round(crossing.angle * 100) / 100) : '90',
            },
          });
          return;
        }
        const curve = curveFromKey(v);
        if (curve) set({ reference: { type: 'curve', curve } });
      },
    },
    ...(ref.type === 'station'
      ? [
          {
            kind: 'select' as const,
            label: t.road,
            value: ref.alignment,
            options: input.alignments.map((a) => ({ value: a.name, label: a.name })),
            onChange: (alignment: string) => set({ reference: { ...ref, alignment } }),
          },
          {
            kind: 'station' as const,
            label: t.station,
            value: ref.station,
            onCommit: (station: number) => set({ reference: { ...ref, station } }),
          },
          expr(t.angle, ref.angle, (angle) => set({ reference: { ...ref, angle } })),
        ]
      : []),
  ];

  const level = obstacle.level;
  const levelRows: PropertyRow[] = [
    {
      kind: 'select',
      label: t.level,
      value: level.kind,
      options: (['grade', 'line', 'constant'] as const).map((k) => ({
        value: k,
        label: t.levels[k],
      })),
      onChange: (k) =>
        set({
          level:
            k === 'constant'
              ? { kind: 'constant', value: level.kind === 'constant' ? level.value : '0' }
              : { kind: k as 'grade' | 'line' },
        }),
    },
    ...(level.kind === 'constant'
      ? [expr(t.levelValue, level.value, (value) => set({ level: { kind: 'constant', value } }))]
      : []),
  ];

  const setClearance = (key: keyof Clearance) => (v: string) =>
    set({ clearance: { ...c, [key]: v } });
  const clearanceRows: PropertyRow[] = [
    {
      kind: 'select',
      label: t.preset,
      value: presetOf(c),
      options: [
        { value: '', label: t.custom },
        ...CLEARANCE_PRESETS.map((p) => ({ value: p.key, label: t.presets[p.key] ?? p.key })),
      ],
      onChange: (key) => {
        const p = CLEARANCE_PRESETS.find((x) => x.key === key);
        if (p) set({ clearance: { ...p.clearance } });
      },
    },
    expr(t.left, c.left, setClearance('left')),
    expr(t.right, c.right, setClearance('right')),
    expr(obstacle.kind === 'water' ? t.reserve : t.height, c.height, setClearance('height')),
    expr(t.slopeLeft, c.slopeLeft, setClearance('slopeLeft')),
    expr(t.slopeRight, c.slopeRight, setClearance('slopeRight')),
    expr(t.chamfer, c.chamfer, setClearance('chamfer')),
    { kind: 'note', text: t.placeholder, tone: 'warning' },
    { kind: 'note', text: t.clearanceHint },
  ];

  const axisName = (id: string) => input.bridgeAxes.find((a) => a.id === id)?.name ?? id;
  const crossings = result?.crossings ?? [];
  const issues = [...(result?.issues ?? []), ...(input.check?.issues ?? [])];
  const minimum = input.check?.minimum;

  return {
    heading: { icon: 'obstacle', label: sk.elements.titles.obstacles },
    type: {
      label: t.kind,
      value: obstacle.kind,
      options: KINDS.map((k) => ({ value: k, label: t.kinds[k] })),
      // zmena druhu nastaví jeho predvoľbu voľného prierezu
      onChange: (k) =>
        set({ kind: k as ObstacleKind, clearance: defaultClearance(k as ObstacleKind) }),
    },
    groups: [
      {
        id: 'obstacle-identity',
        title: sk.properties.identity,
        rows: [
          {
            kind: 'text',
            label: sk.properties.name,
            value: obstacle.name,
            onCommit: (name) => set({ name }),
          },
        ],
      },
      { id: 'obstacle-reference', title: t.reference, rows: referenceRows },
      { id: 'obstacle-level', title: t.level, rows: levelRows },
      { id: 'obstacle-clearance', title: t.clearance, rows: clearanceRows },
      {
        id: 'obstacle-crossings',
        title: t.crossings,
        rows:
          crossings.length === 0
            ? [{ kind: 'note', text: t.noCrossing, tone: 'muted' }]
            : [
                ...crossings.map(
                  (x): PropertyRow => ({
                    kind: 'readonly',
                    label: axisName(x.bridgeAxis),
                    value: t.crossing(formatStation(x.station), formatNumber(x.angle, 2)),
                  }),
                ),
                ...(minimum
                  ? [
                      {
                        kind: 'readonly' as const,
                        label: t.freeHeight,
                        value: t.freeHeightValue(
                          formatNumber(minimum.free, 2),
                          formatNumber(minimum.required, 2),
                          formatStation(minimum.station),
                        ),
                      },
                    ]
                  : []),
              ],
      },
      ...(issues.length > 0
        ? [
            {
              id: 'obstacle-issues',
              title: sk.properties.warnings,
              rows: issues.map(
                (i): PropertyRow => ({
                  kind: 'note',
                  text: formatModelIssue(i),
                  tone: i.severity === 'warning' ? 'warning' : 'error',
                }),
              ),
            },
          ]
        : []),
    ],
    actions: [
      { label: sk.properties.remove, icon: 'trash', danger: true, onClick: input.onDelete },
    ],
  };
}
