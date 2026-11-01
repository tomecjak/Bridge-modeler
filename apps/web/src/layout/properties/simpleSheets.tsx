import { type Alignment, type AlignmentIssue, formatStation } from '@bridge/alignment';
import type { Vec3 } from '@bridge/geom';
import type {
  BridgeAxis,
  PlanLine,
  StationFunction,
  StudyArea,
  Superstructure,
  TerrainSurface,
} from '@bridge/model';
import { formatNumber } from '../../format/number.ts';
import { sk } from '../../i18n/sk.ts';
import { terrainSize } from '../../import/importTerrain.ts';
import type { Command } from '../../store/commands.ts';
import type { EvaluatedAlignment } from '../../store/derived.ts';
import type { SectionResult } from '../../store/sections.ts';
import type { BasemapKind } from '../../viewer/basemap.ts';
import { StationControl } from '../../views/StationControl.tsx';
import { IssueList } from '../IssueList.tsx';
import { SectionResultDetails } from '../SectionPanel.tsx';
import type { PropertySheet } from './PropertyGrid.tsx';

type Dispatch = (command: Command) => void;

/** Krátky súhrn priebehu po staničení pre riadok s „…“. */
export function lawSummary(law: StationFunction): string {
  switch (law.kind) {
    case 'constant':
      return sk.properties.lawConstant(law.value);
    case 'piecewise':
      return sk.properties.lawPiecewise(law.segments.length);
    case 'expression':
      return sk.properties.lawExpression(law.expr);
  }
}

/** Os cesty z LandXML: geometria, niveleta, počiatok a upozornenia (len na čítanie). */
export function alignmentSheet(
  item: EvaluatedAlignment,
  issues: readonly AlignmentIssue[],
  origin: Vec3 | null,
): PropertySheet {
  const p = sk.properties;
  const { alignment } = item;
  const st = alignment.stationing;
  const count = (kind: string) => alignment.elements.filter((e) => e.kind === kind).length;
  const profile = alignment.profile;
  return {
    heading: { icon: 'landxml', label: p.alignmentKind },
    groups: [
      {
        id: 'alignment-identity',
        title: p.identity,
        rows: [{ kind: 'readonly', label: p.name, value: alignment.name }],
      },
      {
        id: 'alignment-geometry',
        title: p.geometry,
        rows: [
          { kind: 'readonly', label: p.length, value: `${formatNumber(alignment.length, 3)} m` },
          {
            kind: 'readonly',
            label: p.stationRange,
            value: `${formatStation(st.toDisplay(0).station)} – ${formatStation(st.toDisplay(alignment.length).station)}`,
          },
          {
            kind: 'readonly',
            label: p.elements,
            value: `${count('line')} ${p.lines}, ${count('arc')} ${p.arcs}, ${count('spiral')} ${p.spirals}`,
          },
          {
            kind: 'readonly',
            label: p.profile,
            value: profile
              ? `${profile.name}: ${formatStation(st.toDisplay(profile.startS).station)} – ${formatStation(st.toDisplay(profile.endS).station)}`
              : p.noProfile,
          },
          ...(origin
            ? [
                {
                  kind: 'readonly' as const,
                  label: p.origin,
                  value: `E ${formatNumber(origin.x, 0)}, N ${formatNumber(origin.y, 0)}`,
                },
              ]
            : []),
        ],
      },
      {
        id: 'alignment-issues',
        title: p.issues,
        ...(issues.length === 0
          ? { rows: [{ kind: 'note' as const, text: p.noIssues }] }
          : { content: <IssueList issues={issues} /> }),
      },
    ],
  };
}

/** Dĺžka oblasti po osi cesty (spojité staničenie, rešpektuje skoky v staničení). */
function areaLength(road: Alignment, area: StudyArea): number {
  const a = road.stationing.fromDisplay(area.from);
  const b = road.stationing.fromDisplay(area.to);
  return a === undefined || b === undefined ? area.to - area.from : b - a;
}

/** Oblasť mosta (Fáza 10a): os, od, do, dĺžka; vyznačenie v profile, zadanie staničeniami, zrušenie. */
export function studyAreaSheet(input: {
  road: Alignment | undefined;
  area: StudyArea | null;
  suggestion: { from: number; to: number } | undefined;
  onMark: () => void;
  dispatch: Dispatch;
}): PropertySheet {
  const t = sk.studyArea;
  const { road, area, dispatch } = input;
  const set = (studyArea: StudyArea | null) => dispatch({ type: 'setStudyArea', studyArea });
  const onRoad = area && road && area.alignment === road.name ? area : undefined;
  const change = (end: 'from' | 'to', value: number) => {
    if (!onRoad) return;
    const next = { ...onRoad, [end]: value };
    set({ ...next, from: Math.min(next.from, next.to), to: Math.max(next.from, next.to) });
  };
  return {
    heading: { icon: 'area', label: sk.properties.studyAreaKind },
    groups: [
      {
        id: 'study-area',
        title: t.title,
        rows: [
          { kind: 'note', text: t.hint },
          ...(onRoad && road
            ? [
                { kind: 'readonly' as const, label: t.alignment, value: road.name },
                {
                  kind: 'station' as const,
                  label: t.from,
                  value: onRoad.from,
                  onCommit: (v: number) => change('from', v),
                },
                {
                  kind: 'station' as const,
                  label: t.to,
                  value: onRoad.to,
                  onCommit: (v: number) => change('to', v),
                },
                {
                  kind: 'readonly' as const,
                  label: t.length,
                  value: `${formatNumber(areaLength(road, onRoad), 3)} m`,
                },
              ]
            : [{ kind: 'note' as const, text: area ? t.otherAlignment(area.alignment) : t.none }]),
        ],
      },
    ],
    actions: [
      { label: t.mark, icon: 'area', onClick: input.onMark, disabled: !road },
      ...(!onRoad && road
        ? [
            {
              label: t.enter,
              disabled: !input.suggestion,
              onClick: () => input.suggestion && set({ alignment: road.name, ...input.suggestion }),
            },
          ]
        : []),
      ...(area ? [{ label: t.clear, onClick: () => set(null) }] : []),
    ],
  };
}

/** Terén (ADR 0011): názov, zdroj, veľkosť, oblasť orezania; stiahnutý DMR sa dá stiahnuť znova. */
export function terrainSheet(input: {
  terrain: TerrainSurface;
  busy: boolean;
  onRedownload: () => void;
  dispatch: Dispatch;
}): PropertySheet {
  const t = sk.terrain;
  const { terrain } = input;
  const size = terrainSize(terrain);
  return {
    heading: { icon: 'terrain', label: sk.properties.terrainKind },
    groups: [
      {
        id: 'terrain-identity',
        title: sk.properties.identity,
        rows: [
          {
            kind: 'text',
            label: sk.properties.name,
            value: terrain.name,
            onCommit: (name) =>
              input.dispatch({
                type: 'updateElement',
                collection: 'terrains',
                id: terrain.id,
                changes: { name },
              }),
          },
          { kind: 'readonly', label: t.source, value: t.sources[terrain.source] },
          ...(terrain.attribution
            ? [{ kind: 'readonly' as const, label: t.attribution, value: terrain.attribution }]
            : []),
        ],
      },
      {
        id: 'terrain-data',
        title: sk.properties.geometry,
        rows: [
          {
            kind: 'readonly',
            label: t.size,
            value: `${t.points(size.points)} · ${terrain.data.kind === 'tin' ? t.triangles(size.cells) : t.cells(size.cells)}`,
          },
          {
            kind: 'readonly',
            label: t.area,
            value:
              terrain.corridor.shape === 'rectangle'
                ? t.rectangleUsed(terrain.corridor.margin)
                : t.corridorUsed(terrain.corridor.halfWidth, terrain.corridor.margin),
          },
          {
            kind: 'note',
            text: terrain.source === 'zbgis' ? t.redownloadHint : t.reimportHint,
          },
        ],
      },
    ],
    actions:
      terrain.source === 'zbgis'
        ? [{ label: t.redownload, icon: 'dmr', disabled: input.busy, onClick: input.onRedownload }]
        : [],
  };
}

/** Čiara v pôdoryse (Fáza 8a): názov, počet vrcholov („…“ = tabuľka v S-JTSK), NK, ktoré ju používajú. */
export function planLineSheet(input: {
  line: PlanLine;
  superstructures: readonly Superstructure[];
  onVertices: () => void;
  dispatch: Dispatch;
}): PropertySheet {
  const { line } = input;
  const users = input.superstructures.filter((sup) =>
    Object.values(sup.parameterLaws).some(
      (law) => law.kind === 'edge' && law.curve.type === 'planLine' && law.curve.id === line.id,
    ),
  );
  return {
    heading: { icon: 'line', label: sk.properties.planLineKind },
    groups: [
      {
        id: 'plan-line',
        title: sk.properties.identity,
        rows: [
          {
            kind: 'text',
            label: sk.properties.name,
            value: line.name,
            onCommit: (name) =>
              input.dispatch({
                type: 'updateElement',
                collection: 'planLines',
                id: line.id,
                changes: { name },
              }),
          },
          {
            kind: 'edit',
            label: sk.planLines.vertices,
            value: sk.properties.vertices(line.points.length),
            onEdit: input.onVertices,
          },
          {
            kind: 'readonly',
            label: sk.properties.usage,
            value:
              users.length > 0
                ? sk.planLines.usedBy(users.map((u) => u.name).join(', '))
                : sk.planLines.unused,
          },
          { kind: 'note', text: sk.planLines.vertexHint },
        ],
      },
    ],
  };
}

/** Os mosta (ADR 0007): os cesty a posuny po staničení („…“ = editor priebehu). */
export function bridgeAxisSheet(input: {
  axis: BridgeAxis;
  alignments: readonly { name: string }[];
  onEditOffset: (which: 'horizontalOffset' | 'verticalOffset') => void;
  dispatch: Dispatch;
}): PropertySheet {
  const { axis } = input;
  const set = (changes: Partial<BridgeAxis>) =>
    input.dispatch({ type: 'updateElement', collection: 'bridgeAxes', id: axis.id, changes });
  const names = input.alignments.map((a) => a.name);
  return {
    heading: { icon: 'axis', label: sk.properties.bridgeAxisKind },
    groups: [
      {
        id: 'axis-identity',
        title: sk.properties.identity,
        rows: [
          {
            kind: 'text',
            label: sk.properties.name,
            value: axis.name,
            onCommit: (name) => set({ name }),
          },
          {
            kind: 'select',
            label: sk.elements.alignment,
            value: axis.alignment,
            options: [
              ...(names.includes(axis.alignment)
                ? []
                : [{ value: axis.alignment, label: `${axis.alignment} (?)` }]),
              ...names.map((n) => ({ value: n, label: n })),
            ],
            onChange: (alignment) => set({ alignment }),
          },
        ],
      },
      {
        id: 'axis-offsets',
        title: sk.properties.offsets,
        rows: [
          {
            kind: 'edit',
            label: sk.elements.horizontalOffset,
            value: lawSummary(axis.horizontalOffset),
            onEdit: () => input.onEditOffset('horizontalOffset'),
          },
          {
            kind: 'edit',
            label: sk.elements.verticalOffset,
            value: lawSummary(axis.verticalOffset),
            onEdit: () => input.onEditOffset('verticalOffset'),
          },
        ],
      },
    ],
  };
}

/** Vlastnosti aktívneho pohľadu, keď nie je nič vybrané (ako v Revite). */
export function viewSheet(input: {
  mode: '3d' | '2d' | 'section' | 'parameters';
  exaggeration: number;
  setExaggeration: (value: number) => void;
  decks: readonly { id: string; name: string }[];
  profileDeckId: string | undefined;
  setProfileDeckId: (id: string) => void;
  /** os pozdĺžneho profilu (Fáza 10b) */
  profileAxis: string;
  profileAxes: readonly { value: string; label: string }[];
  setProfileAxis: (key: string) => void;
  edgeTerrain: boolean;
  setEdgeTerrain: (on: boolean) => void;
  canEdgeTerrain: boolean;
  section: {
    station: number;
    range: { from: number; to: number } | undefined;
    onStation: (station: number) => void;
    results: readonly SectionResult[];
  };
  view3d: { cut: boolean; terrain: boolean; basemap: BasemapKind; exact: boolean };
  setView3d: (
    changes: Partial<{ cut: boolean; terrain: boolean; basemap: BasemapKind; exact: boolean }>,
  ) => void;
  hasTerrain: boolean;
  hasDeck: boolean;
}): PropertySheet {
  const p = sk.properties;
  const heading = { icon: 'cube' as const, label: p.viewKinds[input.mode] };
  switch (input.mode) {
    case '2d':
      return {
        heading: { icon: 'plan', label: heading.label },
        groups: [
          {
            id: 'view-2d',
            title: p.longitudinal,
            rows: [
              {
                kind: 'select',
                label: sk.ribbon.exaggeration,
                value: String(input.exaggeration),
                options: [1, 2, 5, 10].map((k) => ({ value: String(k), label: `${k}×` })),
                onChange: (v) => input.setExaggeration(Number(v)),
              },
              ...(input.decks.length > 0
                ? [
                    {
                      kind: 'select' as const,
                      label: sk.ribbon.profileDeck,
                      value: input.profileDeckId ?? '',
                      options: input.decks.map((d) => ({ value: d.id, label: d.name })),
                      onChange: input.setProfileDeckId,
                      disabled: input.decks.length < 2,
                    },
                  ]
                : []),
              {
                kind: 'select',
                label: sk.ribbon.profileAxis,
                value: input.profileAxis,
                options: [...input.profileAxes],
                onChange: input.setProfileAxis,
                disabled: input.profileAxes.length < 2,
              },
              {
                kind: 'toggle',
                label: sk.ribbon.edgeTerrain,
                value: input.edgeTerrain && input.canEdgeTerrain,
                disabled: !input.canEdgeTerrain,
                onChange: input.setEdgeTerrain,
              },
              { kind: 'note', text: sk.viewport.exaggerationTitle },
            ],
          },
        ],
      };
    case 'section':
      return {
        heading: { icon: 'section', label: heading.label },
        groups: [
          {
            id: 'view-section',
            title: p.sectionCut,
            rows: [
              {
                kind: 'custom',
                label: sk.section.station,
                node: (
                  <div className="prop-station">
                    <StationControl
                      station={input.section.station}
                      range={input.section.range}
                      onStation={input.section.onStation}
                      compact
                    />
                  </div>
                ),
              },
            ],
          },
          {
            id: 'view-section-results',
            title: p.results,
            ...(input.section.results.length === 0
              ? { rows: [{ kind: 'note' as const, text: p.noDeckResults }] }
              : {
                  content: input.section.results.map((r) => (
                    <section key={r.superstructure.id} className="result">
                      <h3 className="panel-subtitle">{r.superstructure.name}</h3>
                      <SectionResultDetails result={r} />
                    </section>
                  )),
                }),
          },
        ],
      };
    case '3d':
      return {
        heading,
        groups: [
          {
            id: 'view-3d',
            title: p.display3d,
            rows: [
              {
                kind: 'toggle',
                label: sk.ribbon.cut,
                value: input.view3d.cut,
                onChange: (cut) => input.setView3d({ cut }),
              },
              {
                kind: 'toggle',
                label: sk.ribbon.terrain,
                value: input.view3d.terrain && input.hasTerrain,
                disabled: !input.hasTerrain,
                onChange: (terrain) => input.setView3d({ terrain }),
              },
              {
                kind: 'select',
                label: sk.ribbon.basemap,
                value: input.view3d.basemap,
                options: (['none', 'ortofoto', 'mapa'] as const).map((k) => ({
                  value: k,
                  label: sk.viewer3d.basemaps[k],
                })),
                onChange: (v) => input.setView3d({ basemap: v as BasemapKind }),
                disabled: !input.hasTerrain || !input.view3d.terrain,
              },
              {
                kind: 'toggle',
                label: sk.ribbon.exact,
                value: input.view3d.exact,
                disabled: !input.hasDeck,
                onChange: (exact) => input.setView3d({ exact }),
              },
            ],
          },
        ],
      };
    case 'parameters':
      return {
        heading: { icon: 'parameters', label: heading.label },
        groups: [
          {
            id: 'view-parameters',
            title: p.view,
            rows: [{ kind: 'note', text: p.nothingSelected }],
          },
        ],
      };
  }
}
