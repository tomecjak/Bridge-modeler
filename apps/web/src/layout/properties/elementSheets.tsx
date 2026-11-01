import { formatStation } from '@bridge/alignment';
import type {
  AbutmentGeometry,
  BearingLine,
  BridgeAxis,
  ProfileDefinition,
  ProfileLaw,
  Superstructure,
  Support,
} from '@bridge/model';
import type { BearingLineResult, SupportResult } from '@bridge/sections';
import { formatNumber } from '../../format/number.ts';
import { formatModelIssue } from '../../i18n/modelIssues.ts';
import { sk } from '../../i18n/sk.ts';
import type { Command } from '../../store/commands.ts';
import type { SectionResult } from '../../store/sections.ts';
import type { DeckSpans } from '../../store/supports.ts';
import { defaultGeometry } from '../../store/supports.ts';
import { SectionResultDetails } from '../SectionPanel.tsx';
import type { PropertyGroup, PropertyRow, PropertySheet } from './PropertyGrid.tsx';
import { lawSummary } from './simpleSheets.tsx';

type Dispatch = (command: Command) => void;

/** Problémy prvku ako poznámky skupiny (chyby červeno, upozornenia oranžovo). */
function issueRows(issues: SupportResult['issues']): PropertyRow[] {
  return issues.map((i) => ({
    kind: 'note',
    text: formatModelIssue(i),
    tone: i.severity === 'warning' ? 'warning' : 'error',
  }));
}

const expr = (label: string, value: string, onCommit: (value: string) => void): PropertyRow => ({
  kind: 'expression',
  label,
  value,
  onCommit,
});

/** Rozmery opory po častiach (ADR 0010): prah, driek, záverný múrik, krídla. */
function abutmentGroups(
  g: AbutmentGeometry,
  set: (geometry: AbutmentGeometry) => void,
): PropertyGroup[] {
  const dims = sk.supports.dimensions;
  const t = sk.supports.abutment;
  const d = (key: string) => dims[key] ?? key;
  const wing = (k: 'angle' | 'length' | 'thickness' | 'endHeight') => (v: string) =>
    set({ ...g, wings: { ...g.wings, [k]: v } });
  return [
    {
      id: 'abutment-seat',
      title: t.seat,
      rows: [
        expr(d('length'), g.length, (length) => set({ ...g, length })),
        expr(d('seatLength'), g.seatLength, (seatLength) => set({ ...g, seatLength })),
        expr(d('seatHeight'), g.seatHeight, (seatHeight) => set({ ...g, seatHeight })),
        expr(d('frontOffset'), g.frontOffset, (frontOffset) => set({ ...g, frontOffset })),
      ],
    },
    {
      id: 'abutment-stem',
      title: t.stem,
      rows: [
        expr(d('stemThickness'), g.stemThickness, (stemThickness) => set({ ...g, stemThickness })),
        { kind: 'note', text: t.stemHint },
      ],
    },
    {
      id: 'abutment-backwall',
      title: t.backwall,
      rows: [
        expr(d('backwallThickness'), g.backwallThickness, (backwallThickness) =>
          set({ ...g, backwallThickness }),
        ),
        expr(d('gap'), g.gap, (gap) => set({ ...g, gap })),
      ],
    },
    {
      id: 'abutment-wings',
      title: t.wings,
      rows: [
        {
          kind: 'select',
          label: t.wingSupport,
          value: g.wings.support,
          options: (['hung', 'founded'] as const).map((v) => ({
            value: v,
            label: t.wingSupports[v],
          })),
          onChange: (v) =>
            set({
              ...g,
              wings: { ...g.wings, support: v as AbutmentGeometry['wings']['support'] },
            }),
        },
        expr(d('wingAngle'), g.wings.angle, wing('angle')),
        expr(d('wingLength'), g.wings.length, wing('length')),
        expr(d('wingThickness'), g.wings.thickness, wing('thickness')),
        ...(g.wings.support === 'hung'
          ? [expr(d('wingEndHeight'), g.wings.endHeight, wing('endHeight'))]
          : []),
      ],
    },
  ];
}

/** Riadky polohy osi uloženia (staničenie, uhol kríženia); spoločné pre os aj podperu na nej (ADR 0017). */
function lineRows(line: BearingLine, dispatch: Dispatch): PropertyRow[] {
  const set = (changes: Partial<BearingLine>) =>
    dispatch({ type: 'updateElement', collection: 'bearingLines', id: line.id, changes });
  return [
    {
      kind: 'station',
      label: sk.supports.station,
      value: line.station,
      onCommit: (station) => set({ station }),
    },
    expr(sk.supports.crossingAngle, line.crossingAngle, (crossingAngle) => set({ crossingAngle })),
  ];
}

/** Popis osi uloženia vo výbere: NK, číslo osi a staničenie. */
const lineLabel = (line: BearingLine, decks: readonly Pick<Superstructure, 'id' | 'name'>[]) =>
  `${decks.find((d) => d.id === line.superstructure)?.name ?? '—'} · ${sk.bearingLines.label(line.name)} · ${formatStation(line.station, 3)}`;

/**
 * Os uloženia v mriežke vlastností (ADR 0017): číslo, NK, staničenie a uhol kríženia, podpera na osi, susedné
 * polia a problémy.
 */
export function bearingLineSheet(input: {
  line: BearingLine;
  result: BearingLineResult | undefined;
  decks: readonly Pick<Superstructure, 'id' | 'name'>[];
  /** podpery na osi (správne najviac jedna) */
  supports: readonly Pick<Support, 'id' | 'name' | 'kind'>[];
  spans: DeckSpans | undefined;
  onAddSupport: () => void;
  onSelectSupport: (id: string) => void;
  onDelete: () => void;
  dispatch: Dispatch;
}): PropertySheet {
  const { line, result, supports } = input;
  const t = sk.bearingLines;
  const adjacent = (input.spans?.spans ?? []).filter(
    (sp) => sp.from.line.id === line.id || sp.to.line.id === line.id,
  );
  const issues = [
    ...(result?.issues ?? []),
    ...(input.spans?.issues ?? []).filter(
      (i) =>
        (i.code === 'BearingLineWithoutSupport' || i.code === 'BearingLineOccupied') &&
        i.line === line.name,
    ),
  ];
  return {
    heading: { icon: 'bearingLine', label: t.kind },
    groups: [
      {
        id: 'line-identity',
        title: sk.properties.identity,
        rows: [
          {
            kind: 'text',
            label: sk.properties.name,
            value: line.name,
            onCommit: (name) =>
              input.dispatch({
                type: 'updateElement',
                collection: 'bearingLines',
                id: line.id,
                changes: { name },
              }),
          },
          {
            kind: 'readonly',
            label: sk.supports.deck,
            value: input.decks.find((d) => d.id === line.superstructure)?.name ?? '—',
          },
        ],
      },
      { id: 'line-position', title: sk.properties.position, rows: lineRows(line, input.dispatch) },
      {
        id: 'line-support',
        title: t.support,
        rows:
          supports.length === 0
            ? [{ kind: 'note', text: t.noSupport, tone: 'muted' }]
            : supports.map(
                (s): PropertyRow => ({
                  kind: 'edit',
                  label: sk.properties.supportKinds[s.kind],
                  value: s.name,
                  onEdit: () => input.onSelectSupport(s.id),
                }),
              ),
      },
      ...(adjacent.length > 0
        ? [
            {
              id: 'line-spans',
              title: sk.supports.spans,
              rows: adjacent.map(
                (sp): PropertyRow => ({
                  kind: 'readonly',
                  label: sk.properties.spanRow(sp.index + 1, sp.from.line.name, sp.to.line.name),
                  value: `${formatNumber(sp.length, 3)} m`,
                }),
              ),
            },
          ]
        : []),
      ...(issues.length > 0
        ? [{ id: 'line-issues', title: sk.properties.warnings, rows: issueRows(issues) }]
        : []),
    ],
    actions: [
      ...(supports.length === 0
        ? [{ label: t.addSupport, icon: 'pier' as const, onClick: input.onAddSupport }]
        : []),
      { label: sk.properties.remove, icon: 'trash', danger: true, onClick: input.onDelete },
    ],
  };
}

/**
 * Podpera v mriežke vlastností (ADR 0008, 0010, 0017): typ geometrie navrchu, identita s osou uloženia, poloha
 * (staničenie a uhol mení os uloženia), rozmery (pri opore po častiach), založenie, uloženie s ložiskami
 * („…“ = tabuľka) a výsledky výpočtu.
 */
export function supportSheet(input: {
  support: Support;
  result: SupportResult | undefined;
  decks: readonly Pick<Superstructure, 'id' | 'name'>[];
  /** všetky osi uloženia projektu */
  lines: readonly BearingLine[];
  /** id osí, na ktorých už stojí iná podpera */
  occupied: ReadonlySet<string>;
  onBearings: () => void;
  onDelete: () => void;
  dispatch: Dispatch;
}): PropertySheet {
  const { support, result } = input;
  const s = sk.supports;
  const set = (changes: Partial<Support>) =>
    input.dispatch({ type: 'updateElement', collection: 'supports', id: support.id, changes });
  const line = input.lines.find((l) => l.id === support.bearingLine);
  const g = support.geometry;
  const dims = s.dimensions;
  const d = (key: string) => dims[key] ?? key;

  const dimensionRows: PropertyRow[] =
    g.type === 'abutment'
      ? []
      : g.type === 'wall'
        ? [
            expr(d('thickness'), g.thickness, (thickness) =>
              set({ geometry: { ...g, thickness } }),
            ),
            expr(d('length'), g.length, (length) => set({ geometry: { ...g, length } })),
          ]
        : [
            {
              kind: 'select',
              label: s.shape,
              value: g.shape,
              options: (['circle', 'rect'] as const).map((v) => ({ value: v, label: s.shapes[v] })),
              onChange: (v) => set({ geometry: { ...g, shape: v as 'circle' | 'rect' } }),
            },
            ...(g.shape === 'circle'
              ? [
                  expr(d('diameter'), g.diameter, (diameter) =>
                    set({ geometry: { ...g, diameter } }),
                  ),
                ]
              : [
                  expr(d('width'), g.width, (width) => set({ geometry: { ...g, width } })),
                  expr(d('depth'), g.depth, (depth) => set({ geometry: { ...g, depth } })),
                ]),
            expr(d('count'), g.count, (count) => set({ geometry: { ...g, count } })),
            expr(d('spacing'), g.spacing, (spacing) => set({ geometry: { ...g, spacing } })),
          ];

  const bearingList = support.bearings.join('; ');
  const groups: PropertyGroup[] = [
    {
      id: 'support-identity',
      title: sk.properties.identity,
      rows: [
        {
          kind: 'text',
          label: sk.properties.name,
          value: support.name,
          onCommit: (name) => set({ name }),
        },
        {
          kind: 'select',
          label: s.kind,
          value: support.kind,
          options: (['abutment', 'pier'] as const).map((v) => ({ value: v, label: s.kinds[v] })),
          onChange: (v) => set({ kind: v as Support['kind'] }),
        },
        {
          kind: 'select',
          label: sk.bearingLines.kind,
          value: support.bearingLine,
          options: [
            ...(line ? [] : [{ value: support.bearingLine, label: '—' }]),
            ...input.lines
              .filter((l) => l.id === support.bearingLine || !input.occupied.has(l.id))
              .map((l) => ({ value: l.id, label: lineLabel(l, input.decks) })),
          ],
          onChange: (bearingLine) => set({ bearingLine }),
        },
      ],
    },
    {
      id: 'support-position',
      title: sk.properties.position,
      rows: [
        ...(line ? lineRows(line, input.dispatch) : []),
        expr(s.offset, support.offset, (offset) => set({ offset })),
      ],
    },
    ...(dimensionRows.length > 0
      ? [{ id: 'support-dimensions', title: sk.properties.dimensions, rows: dimensionRows }]
      : []),
    ...(g.type === 'abutment' ? abutmentGroups(g, (geometry) => set({ geometry })) : []),
    {
      id: 'support-founding',
      title: sk.properties.founding,
      rows: [
        expr(s.foundationTop, support.foundationTop, (foundationTop) => set({ foundationTop })),
        ...(['length', 'width', 'thickness'] as const).map((k) =>
          expr(s.footingFields[k], support.footing[k], (v) =>
            set({ footing: { ...support.footing, [k]: v } }),
          ),
        ),
        { kind: 'note', text: s.footingHint },
      ],
    },
    {
      id: 'support-bearings',
      title: s.bearings,
      rows: [
        {
          kind: 'select',
          label: s.connection,
          value: support.connection,
          options: (['bearing', 'hinge', 'fixed'] as const).map((v) => ({
            value: v,
            label: s.connections[v],
          })),
          onChange: (v) => set({ connection: v as Support['connection'] }),
        },
        expr(s.bearingHeight, support.bearingHeight, (bearingHeight) => set({ bearingHeight })),
        {
          kind: 'edit',
          label: s.bearingX,
          value: sk.properties.bearingsSummary(bearingList),
          onEdit: input.onBearings,
        },
        ...(result && result.bearings.length > 0
          ? [
              {
                kind: 'readonly' as const,
                label: s.height,
                value: `${formatNumber(result.height.min, 3)} – ${formatNumber(result.height.max, 3)} m`,
              },
            ]
          : []),
      ],
    },
    ...(result && result.issues.length > 0
      ? [{ id: 'support-issues', title: sk.properties.warnings, rows: issueRows(result.issues) }]
      : []),
  ];

  return {
    heading: {
      icon: support.kind === 'abutment' ? 'abutment' : 'pier',
      label: sk.properties.supportKinds[support.kind],
    },
    type: {
      label: s.type,
      value: g.type,
      options: (['wall', 'columns', 'abutment'] as const).map((v) => ({
        value: v,
        label: s.types[v],
      })),
      onChange: (v) => set({ geometry: defaultGeometry(v as Support['geometry']['type']) }),
    },
    groups,
    actions: [
      { label: sk.properties.remove, icon: 'trash', danger: true, onClick: input.onDelete },
    ],
  };
}

/** Súhrn priebehu parametra profilu v NK (staničná funkcia alebo okraj podľa krivky). */
export function profileLawSummary(
  law: ProfileLaw | undefined,
  defaultValue: string,
  curveName: (law: Extract<ProfileLaw, { kind: 'edge' }>) => string,
): string {
  if (!law) return sk.properties.lawDefault(defaultValue);
  if (law.kind === 'edge') return sk.properties.lawEdge(curveName(law), sk.edgeLaw.sides[law.side]);
  return lawSummary(law);
}

/**
 * NK v mriežke vlastností (ADR 0007, 0008): prierez navrchu, rozsah, parametre prierezu po staničení
 * („…“ = editor priebehu), polia a prierez na aktuálnom staničení.
 */
export function deckSheet(input: {
  deck: Superstructure;
  profiles: readonly Pick<ProfileDefinition, 'id' | 'name' | 'parameters'>[];
  axes: readonly Pick<BridgeAxis, 'id' | 'name'>[];
  /** názov krivky okraja (os z LandXML alebo čiara v pôdoryse) */
  curveName: (law: Extract<ProfileLaw, { kind: 'edge' }>) => string;
  spans: DeckSpans | undefined;
  result: SectionResult | undefined;
  station: number;
  onEditLaw: (parameter: string) => void;
  onAddSupport: () => void;
  onDelete: () => void;
  dispatch: Dispatch;
}): PropertySheet {
  const { deck, spans } = input;
  const set = (changes: Partial<Superstructure>) =>
    input.dispatch({ type: 'updateElement', collection: 'superstructures', id: deck.id, changes });
  const profile = input.profiles.find((p) => p.id === deck.profile);
  const lawRows: PropertyRow[] = [
    ...(profile?.parameters.map(
      (p): PropertyRow => ({
        kind: 'edit',
        label: p.description ? `${p.name} — ${p.description}` : p.name,
        value: profileLawSummary(deck.parameterLaws[p.name], p.default, input.curveName),
        onEdit: () => input.onEditLaw(p.name),
      }),
    ) ?? []),
    ...Object.keys(deck.parameterLaws)
      .filter((name) => !profile?.parameters.some((p) => p.name === name))
      .map(
        (name): PropertyRow => ({
          kind: 'note',
          text: formatModelIssue({ code: 'UnknownProfileParameter', name }),
          tone: 'error',
        }),
      ),
  ];
  const spanRows: PropertyRow[] = !spans
    ? [{ kind: 'note', text: sk.supports.noSupports }]
    : [
        ...spans.spans.map(
          (sp): PropertyRow => ({
            kind: 'readonly',
            label: sk.properties.spanRow(sp.index + 1, sp.from.line.name, sp.to.line.name),
            value: `${formatNumber(sp.length, 3)} m`,
          }),
        ),
        ...(spans.lengths
          ? [
              { label: sk.supports.deckLength, length: spans.lengths.deck.length },
              { label: sk.supports.bridgedLength, length: spans.lengths.bridged?.length },
              { label: sk.supports.overallLength, length: spans.lengths.overall.length },
            ].flatMap(({ label, length }): PropertyRow[] =>
              length === undefined
                ? []
                : [{ kind: 'readonly', label, value: `${formatNumber(length, 3)} m` }],
            )
          : []),
        ...issueRows(spans.issues),
      ];

  return {
    heading: { icon: 'deck', label: sk.properties.deckKind },
    type: {
      label: sk.elements.profile,
      value: deck.profile,
      options: input.profiles.map((p) => ({ value: p.id, label: p.name })),
      onChange: (profileId) => set({ profile: profileId }),
    },
    groups: [
      {
        id: 'deck-identity',
        title: sk.properties.identity,
        rows: [
          {
            kind: 'text',
            label: sk.properties.name,
            value: deck.name,
            onCommit: (name) => set({ name }),
          },
        ],
      },
      {
        id: 'deck-range',
        title: sk.properties.range,
        rows: [
          {
            kind: 'select',
            label: sk.elements.bridgeAxis,
            value: deck.bridgeAxis,
            options: input.axes.map((a) => ({ value: a.id, label: a.name })),
            onChange: (bridgeAxis) => set({ bridgeAxis }),
          },
          {
            kind: 'station',
            label: sk.stationFunction.from,
            value: deck.from,
            onCommit: (from) => set({ from }),
          },
          {
            kind: 'station',
            label: sk.stationFunction.to,
            value: deck.to,
            onCommit: (to) => set({ to }),
          },
          {
            kind: 'select',
            label: sk.elements.orientation,
            value: deck.orientation,
            options: (['vertical', 'normalToGrade'] as const).map((v) => ({
              value: v,
              label: sk.elements.orientations[v],
            })),
            onChange: (v) => set({ orientation: v as Superstructure['orientation'] }),
          },
        ],
      },
      { id: 'deck-laws', title: sk.properties.profileLaws, rows: lawRows },
      { id: 'deck-spans', title: sk.supports.spans, rows: spanRows },
      {
        id: 'deck-section',
        title: sk.properties.sectionAt(formatStation(input.station, 3)),
        ...(input.result
          ? { content: <SectionResultDetails result={input.result} /> }
          : { rows: [{ kind: 'note' as const, text: sk.properties.noDeckResults }] }),
      },
    ],
    actions: [
      { label: sk.supports.add, icon: 'pier', onClick: input.onAddSupport },
      { label: sk.properties.remove, icon: 'trash', danger: true, onClick: input.onDelete },
    ],
  };
}

/**
 * Prierez v mriežke vlastností (ADR 0007, 0013): identita, referenčný bod, predvolené hodnoty parametrov a počet
 * bodov a obrysov („…“ = tabuľky); graficky sa upravuje v záložke Prierez.
 */
export function profileSheet(input: {
  profile: ProfileDefinition;
  onTables: () => void;
  onEditGraphically: () => void;
  onDelete: () => void;
  dispatch: Dispatch;
}): PropertySheet {
  const { profile } = input;
  const p = sk.properties;
  const set = (changes: Partial<ProfileDefinition>) =>
    input.dispatch({ type: 'updateElement', collection: 'profiles', id: profile.id, changes });
  return {
    heading: { icon: 'section', label: p.profileKind },
    groups: [
      {
        id: 'profile-identity',
        title: p.identity,
        rows: [
          { kind: 'text', label: p.name, value: profile.name, onCommit: (name) => set({ name }) },
          { kind: 'readonly', label: p.typology, value: profile.typology ?? '—' },
          {
            kind: 'select',
            label: sk.elements.referencePoint,
            value: profile.referencePoint,
            options: profile.points.map((pt) => ({ value: pt.name, label: pt.name })),
            onChange: (referencePoint) => set({ referencePoint }),
          },
        ],
      },
      {
        id: 'profile-defaults',
        title: p.defaults,
        rows: profile.parameters.map(
          (par, i): PropertyRow => ({
            kind: 'expression',
            label: par.description ? `${par.name} — ${par.description}` : par.name,
            value: par.default,
            onCommit: (value) =>
              set({
                parameters: profile.parameters.map((x, j) =>
                  j === i ? { ...x, default: value } : x,
                ),
              }),
          }),
        ),
      },
      {
        id: 'profile-geometry',
        title: p.pointsAndLoops,
        rows: [
          {
            kind: 'edit',
            label: p.tables,
            value: p.geometryCount(profile.points.length, profile.loops.length),
            onEdit: input.onTables,
          },
          { kind: 'note', text: p.graphicalHint },
        ],
      },
    ],
    actions: [
      { label: p.editGraphically, icon: 'section', onClick: input.onEditGraphically },
      { label: p.remove, icon: 'trash', danger: true, onClick: input.onDelete },
    ],
  };
}
