import { formatStation } from '@bridge/alignment';
import type {
  AbutmentGeometry,
  BearingLine,
  BridgeAxis,
  EdgeBeam,
  FoundationMode,
  ModelIssue,
  ProfileDefinition,
  ProfileLaw,
  Superstructure,
  Support,
} from '@bridge/model';
import type { BearingLineResult, DeckWidthRange, SupportResult } from '@bridge/sections';
import { formatNumber, parseNumber } from '../../format/number.ts';
import { formatModelIssue } from '../../i18n/modelIssues.ts';
import { sk } from '../../i18n/sk.ts';
import type { Command } from '../../store/commands.ts';
import type { SectionResult } from '../../store/sections.ts';
import type { DeckSpans } from '../../store/supports.ts';
import { defaultGeometry } from '../../store/supports.ts';
import { AbutmentSketch } from '../../views/AbutmentSketch.tsx';
import { SectionResultDetails } from '../SectionPanel.tsx';
import type { PropertyGroup, PropertyRow, PropertySheet } from './PropertyGrid.tsx';
import { lawSummary } from './simpleSheets.tsx';

type Dispatch = (command: Command) => void;

/** Problémy prvku ako poznámky skupiny (chyby červeno, upozornenia oranžovo). */
function issueRows(issues: readonly ModelIssue[]): PropertyRow[] {
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

/**
 * Rozmery opory po častiach (ADR 0018): konštrukcia (s prahom / monolitická), pri opore s prahom prah, driek a záverný
 * múrik, pri monolitickej stena; krídla. Pozdĺžne rozmery sú v osi mosta, písmená zodpovedajú náčrtu.
 */
function abutmentGroups(
  g: AbutmentGeometry,
  set: (changes: Partial<Support>) => void,
  values: Readonly<Record<string, number | undefined>>,
): PropertyGroup[] {
  const dims = sk.supports.dimensions;
  const t = sk.supports.abutment;
  const d = (key: string) => dims[key] ?? key;
  const geometry = (changes: Partial<AbutmentGeometry>) => set({ geometry: { ...g, ...changes } });
  const wing = (k: 'angle' | 'length' | 'thickness' | 'endHeight') => (v: string) =>
    geometry({ wings: { ...g.wings, [k]: v } });
  const construction: PropertyRow = {
    kind: 'select',
    label: t.construction,
    value: g.construction,
    options: (['bearing', 'monolithic'] as const).map((v) => ({
      value: v,
      label: t.constructions[v],
    })),
    // monolitická opora je votknutá bez ložísk
    onChange: (v) =>
      set(
        v === 'monolithic'
          ? {
              geometry: { ...g, construction: 'monolithic' },
              connection: 'fixed',
              bearingHeight: '0',
            }
          : {
              geometry: { ...g, construction: 'bearing' },
              connection: 'bearing',
              bearingHeight: '0.35',
            },
      ),
  };
  const body: PropertyGroup[] =
    g.construction === 'monolithic'
      ? [
          {
            id: 'abutment-wall',
            title: t.wall,
            rows: [
              construction,
              expr(d('length'), g.length, (length) => geometry({ length })),
              expr(d('wallThickness'), g.wallThickness, (wallThickness) =>
                geometry({ wallThickness }),
              ),
              { kind: 'note', text: t.wallHint },
            ],
          },
        ]
      : [
          {
            id: 'abutment-seat',
            title: t.seat,
            rows: [
              construction,
              expr(d('length'), g.length, (length) => geometry({ length })),
              expr(d('frontOffset'), g.frontOffset, (frontOffset) => geometry({ frontOffset })),
              expr(d('endOffset'), g.endOffset, (endOffset) => geometry({ endOffset })),
              expr(d('seatHeight'), g.seatHeight, (seatHeight) => geometry({ seatHeight })),
              { kind: 'note', text: t.seatHint },
            ],
          },
          {
            id: 'abutment-stem',
            title: t.stem,
            rows: [
              expr(d('stemThickness'), g.stemThickness, (stemThickness) =>
                geometry({ stemThickness }),
              ),
              { kind: 'note', text: t.stemHint },
            ],
          },
          {
            id: 'abutment-backwall',
            title: t.backwall,
            rows: [
              expr(d('gap'), g.gap, (gap) => geometry({ gap })),
              expr(d('backwallThickness'), g.backwallThickness, (backwallThickness) =>
                geometry({ backwallThickness }),
              ),
            ],
          },
        ];
  return [
    {
      id: 'abutment-sketch',
      title: t.sketchTitle,
      content: <AbutmentSketch construction={g.construction} values={values} />,
    },
    ...body,
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
            geometry({ wings: { ...g.wings, support: v as AbutmentGeometry['wings']['support'] } }),
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

/** Hodnota výberu prierezu priečnika: nový prierez zo šablóny „Priečnik – plný blok“. */
const CROSSBEAM_TEMPLATE = 'template:crossbeam';

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
  /** prierezy projektu na výber priečnika */
  profiles: readonly Pick<ProfileDefinition, 'id' | 'name'>[];
  /** priečnik z novej šablóny „Priečnik – plný blok“ (pridá prierez do projektu) */
  onCrossbeamTemplate: () => void;
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
        ((i.code === 'BearingLineWithoutSupport' ||
          i.code === 'BearingLineOccupied' ||
          i.code === 'UnknownCrossbeamProfile' ||
          i.code === 'CrossbeamOutsideDeck') &&
          i.line === line.name) ||
        (i.code === 'CrossbeamOverlap' && i.lines.includes(line.name)),
    ),
  ];
  const setLine = (changes: Partial<BearingLine>) =>
    input.dispatch({ type: 'updateElement', collection: 'bearingLines', id: line.id, changes });
  const cb = line.crossbeam;
  const crossbeamRows: PropertyRow[] = [
    {
      kind: 'select',
      label: t.crossbeamProfile,
      value: cb?.profile ?? '',
      options: [
        { value: '', label: t.noCrossbeam },
        ...input.profiles.map((p) => ({ value: p.id, label: p.name })),
        ...(cb && !input.profiles.some((p) => p.id === cb.profile)
          ? [{ value: cb.profile, label: '—' }]
          : []),
        { value: CROSSBEAM_TEMPLATE, label: t.crossbeamTemplate },
      ],
      onChange: (v) =>
        v === CROSSBEAM_TEMPLATE
          ? input.onCrossbeamTemplate()
          : setLine({ crossbeam: v ? { profile: v, width: cb?.width ?? '1.2' } : undefined }),
    },
    ...(cb
      ? [
          expr(t.crossbeamWidth, cb.width, (width) => setLine({ crossbeam: { ...cb, width } })),
          { kind: 'note' as const, text: t.crossbeamHint, tone: 'muted' as const },
        ]
      : []),
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
      { id: 'line-crossbeam', title: t.crossbeam, rows: crossbeamRows },
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
 * Založenie podpery (ADR 0019): režim, pole zvoleného režimu, terén v strede podpery a vypočítaná horná hrana
 * základu a základová škára.
 */
function foundationRows(
  support: Support,
  result: SupportResult | undefined,
  z0: number,
  set: (changes: Partial<Support>) => void,
): PropertyRow[] {
  const t = sk.supports.foundation;
  const f = support.foundation;
  const field =
    f.mode === 'terrain'
      ? expr(t.cover, f.cover, (cover) => set({ foundation: { ...f, cover } }))
      : f.mode === 'height'
        ? expr(t.height, f.height, (height) => set({ foundation: { ...f, height } }))
        : expr(t.level, f.level, (level) => set({ foundation: { ...f, level } }));
  const top =
    result && Number.isFinite(result.foundationTop) ? result.foundationTop + z0 : undefined;
  const thickness = result?.footing.thickness;
  return [
    {
      kind: 'select',
      label: t.mode,
      value: f.mode,
      options: (['terrain', 'height', 'level'] as const).map((v) => ({
        value: v,
        label: t.modes[v],
      })),
      onChange: (v) => set({ foundation: { ...f, mode: v as FoundationMode } }),
    },
    field,
    {
      kind: 'readonly',
      label: t.terrain,
      value: f.terrain === undefined ? t.noTerrain : formatNumber(f.terrain, 3),
    },
    ...(top === undefined
      ? []
      : [
          { kind: 'readonly' as const, label: t.top, value: formatNumber(top, 3) },
          ...(thickness !== undefined && Number.isFinite(thickness)
            ? [
                {
                  kind: 'readonly' as const,
                  label: t.base,
                  value: formatNumber(top - thickness, 3),
                },
              ]
            : []),
        ]),
    { kind: 'note', text: t.hints[f.mode] },
  ];
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
  /** výška počiatku projektu (lokálne z → m n. m.) */
  z0?: number;
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
    ...(g.type === 'abutment' ? abutmentGroups(g, set, result?.dimensions ?? {}) : []),
    {
      id: 'support-founding',
      title: sk.properties.founding,
      rows: [
        ...foundationRows(support, result, input.z0 ?? 0, set),
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
  /** osi uloženia NK (spoločná šikmosť, ADR 0017) */
  lines: readonly Pick<BearingLine, 'id' | 'crossingAngle'>[];
  /** na krajnej osi stojí opora, z ktorej sa dá odvodiť koniec NK (ADR 0018) */
  abutmentAt: { start: boolean; end: boolean };
  result: SectionResult | undefined;
  station: number;
  /** šírky po dĺžke NK (ADR 0023) */
  widths: DeckWidthRange | undefined;
  /** voľná šírka zo zadania [m] (predvolená požadovaná) */
  briefFreeWidth: number | undefined;
  /** pôdorysná plocha mosta vrátane ríms [m²] (ADR 0023) */
  bridgeArea: number | undefined;
  onEditLaw: (parameter: string) => void;
  onAddSupport: () => void;
  onSpanLayout: () => void;
  onDelete: () => void;
  dispatch: Dispatch;
}): PropertySheet {
  const { deck, spans, lines } = input;
  const t = sk.properties;
  const mm = (m: number) => formatNumber(m * 1000, 0);
  const range = (r: { min: number; max: number }) => t.widthRange(mm(r.min), mm(r.max));
  const widthRows: PropertyRow[] = [
    {
      kind: 'text',
      label: t.requiredFreeWidth,
      value: deck.freeWidth === undefined ? '' : mm(deck.freeWidth),
      placeholder:
        input.briefFreeWidth === undefined
          ? t.requiredUnknown
          : t.requiredFromBrief(mm(input.briefFreeWidth)),
      onCommit: (text) => {
        if (text.trim() === '') {
          set({ freeWidth: undefined });
          return;
        }
        const value = parseNumber(text);
        if (value !== undefined && value > 0) set({ freeWidth: value / 1000 });
      },
      ...(deck.freeWidth !== undefined && input.briefFreeWidth !== undefined
        ? { action: { label: t.useBrief, onClick: () => set({ freeWidth: undefined }) } }
        : {}),
    },
    input.widths?.free
      ? { kind: 'readonly', label: t.freeWidth, value: range(input.widths.free) }
      : { kind: 'note', text: t.noFreeWidth, tone: 'muted' },
    ...(input.widths
      ? [
          { kind: 'readonly' as const, label: t.deckWidth, value: range(input.widths.deck) },
          { kind: 'readonly' as const, label: t.bridgeWidth, value: range(input.widths.bridge) },
        ]
      : []),
    ...(input.bridgeArea === undefined
      ? []
      : [
          {
            kind: 'readonly' as const,
            label: t.bridgeArea,
            value: formatNumber(input.bridgeArea, 1),
          },
        ]),
    { kind: 'note', text: t.widthsHint, tone: 'muted' },
  ];
  const ends = { start: deck.ends?.start ?? 'abutment', end: deck.ends?.end ?? 'abutment' };
  /** koniec NK: prepínač „podľa opory“ a staničenie (pri odvodenom konci len na čítanie, ADR 0018) */
  const endRows = (side: 'start' | 'end'): PropertyRow[] => {
    const t = sk.properties.deckEnds;
    const locked = ends[side] === 'abutment' && input.abutmentAt[side];
    const value = side === 'start' ? deck.from : deck.to;
    const label = side === 'start' ? sk.stationFunction.from : sk.stationFunction.to;
    return [
      {
        kind: 'toggle',
        label: t.fromAbutment[side],
        value: ends[side] === 'abutment',
        disabled: !input.abutmentAt[side],
        onChange: (v) => set({ ends: { ...ends, [side]: v ? 'abutment' : 'manual' } }),
      },
      locked
        ? { kind: 'readonly', label, value: formatStation(value, 3) }
        : {
            kind: 'station',
            label,
            value,
            onCommit: (station) => set(side === 'start' ? { from: station } : { to: station }),
          },
    ];
  };
  const angles = new Set(lines.map((l) => l.crossingAngle));
  const common = angles.size === 1 ? (lines[0]?.crossingAngle ?? '') : '';
  const lineRowsOfDeck: PropertyRow[] = [
    {
      kind: 'expression',
      label: sk.bearingLines.commonAngle,
      value: common,
      ...(angles.size > 1 ? { placeholder: sk.bearingLines.mixed } : {}),
      onCommit: (crossingAngle) =>
        input.dispatch({
          type: 'batch',
          commands: lines.map((l) => ({
            type: 'updateElement',
            collection: 'bearingLines',
            id: l.id,
            changes: { crossingAngle },
          })),
        }),
    },
    {
      kind: 'note',
      text: sk.bearingLines.commonAngleHint(lines.length),
      tone: 'muted',
    },
  ];
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
    { kind: 'note', text: sk.properties.freeWidthVariable, tone: 'muted' },
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
          ...endRows('start'),
          ...endRows('end'),
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
      { id: 'deck-widths', title: t.widths, rows: widthRows },
      { id: 'deck-spans', title: sk.supports.spans, rows: spanRows },
      ...(lines.length > 0
        ? [{ id: 'deck-lines', title: sk.bearingLines.group, rows: lineRowsOfDeck }]
        : []),
      {
        id: 'deck-section',
        title: sk.properties.sectionAt(formatStation(input.station, 3)),
        ...(input.result
          ? { content: <SectionResultDetails result={input.result} /> }
          : { rows: [{ kind: 'note' as const, text: sk.properties.noDeckResults }] }),
      },
    ],
    actions: [
      { label: sk.ribbon.spanLayout, icon: 'spans', onClick: input.onSpanLayout },
      { label: sk.supports.add, icon: 'pier', onClick: input.onAddSupport },
      { label: sk.properties.remove, icon: 'trash', danger: true, onClick: input.onDelete },
    ],
  };
}

const EDGE_BEAM_TEMPLATE = 'template:edgeBeam';

/**
 * Rímsa v mriežke vlastností (ADR 0023): prierez navrchu (aj nový zo šablóny), názov, NK a strana, parametre prierezu
 * po staničení („…“ = editor priebehu) a problémy.
 */
export function edgeBeamSheet(input: {
  beam: EdgeBeam;
  decks: readonly Pick<Superstructure, 'id' | 'name'>[];
  /** prierezy ríms v projekte */
  profiles: readonly Pick<ProfileDefinition, 'id' | 'name' | 'parameters'>[];
  issues: readonly ModelIssue[];
  /** nový prierez zo šablóny „Rímsa“ (pridá prierez do projektu) */
  onTemplate: () => void;
  onEditLaw: (parameter: string) => void;
  onDelete: () => void;
  dispatch: Dispatch;
}): PropertySheet {
  const { beam } = input;
  const t = sk.edgeBeams;
  const set = (changes: Partial<EdgeBeam>) =>
    input.dispatch({ type: 'updateElement', collection: 'edgeBeams', id: beam.id, changes });
  const profile = input.profiles.find((p) => p.id === beam.profile);
  const lawRows: PropertyRow[] = [
    ...(profile?.parameters.map(
      (p): PropertyRow => ({
        kind: 'edit',
        label: p.description ? `${p.name} — ${p.description}` : p.name,
        value: profileLawSummary(beam.parameterLaws[p.name], p.default, () => ''),
        onEdit: () => input.onEditLaw(p.name),
      }),
    ) ?? []),
    ...Object.keys(beam.parameterLaws)
      .filter((name) => !profile?.parameters.some((p) => p.name === name))
      .map(
        (name): PropertyRow => ({
          kind: 'note',
          text: formatModelIssue({ code: 'UnknownProfileParameter', name }),
          tone: 'error',
        }),
      ),
    { kind: 'note', text: t.hint, tone: 'muted' },
  ];
  return {
    heading: { icon: 'edgeBeam', label: t.kind },
    type: {
      label: t.profile,
      value: beam.profile,
      options: [
        ...input.profiles.map((p) => ({ value: p.id, label: p.name })),
        ...(profile ? [] : [{ value: beam.profile, label: '—' }]),
        { value: EDGE_BEAM_TEMPLATE, label: t.template },
      ],
      onChange: (v) => (v === EDGE_BEAM_TEMPLATE ? input.onTemplate() : set({ profile: v })),
    },
    groups: [
      {
        id: 'edge-beam-identity',
        title: sk.properties.identity,
        rows: [
          {
            kind: 'text',
            label: sk.properties.name,
            value: beam.name,
            onCommit: (name) => set({ name }),
          },
          {
            kind: 'readonly',
            label: t.deck,
            value: input.decks.find((d) => d.id === beam.superstructure)?.name ?? '—',
          },
          {
            kind: 'select',
            label: t.side,
            value: beam.side,
            options: (['left', 'right'] as const).map((v) => ({ value: v, label: t.sides[v] })),
            onChange: (v) => set({ side: v as EdgeBeam['side'] }),
          },
        ],
      },
      { id: 'edge-beam-laws', title: t.laws, rows: lawRows },
      ...(input.issues.length > 0
        ? [{ id: 'edge-beam-issues', title: sk.browser.problems, rows: issueRows(input.issues) }]
        : []),
    ],
    actions: [
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
