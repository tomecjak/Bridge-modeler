import {
  type BearingLine,
  defaultAbutmentGeometry,
  levelFoundation,
  type Superstructure,
  type Support,
} from '@bridge/model';
import { type DeckWidthRange, profileTemplate } from '@bridge/sections';
import { describe, expect, it } from 'vitest';
import type { Command } from '../../store/commands.ts';
import type { DeckSpans } from '../../store/supports.ts';
import {
  bearingLineSheet,
  deckSheet,
  profileLawSummary,
  profileSheet,
  supportSheet,
} from './elementSheets.tsx';
import type { PropertyRow, PropertySheet } from './PropertyGrid.tsx';

const line2: BearingLine = {
  id: 'l2',
  name: '2',
  superstructure: 'nk',
  station: 1116,
  crossingAngle: '76.5',
};
const lines: BearingLine[] = [
  { ...line2, id: 'l1', name: '1', station: 1100 },
  line2,
  { ...line2, id: 'l3', name: '3', station: 1139 },
];

const pier: Support = {
  id: 'p1',
  name: 'P1',
  kind: 'pier',
  bearingLine: 'l2',
  offset: '0',
  geometry: { type: 'wall', thickness: '1.2', length: '4' },
  footing: { length: '8', width: '4', thickness: '1.2' },
  connection: 'bearing',
  bearingHeight: '0.35',
  bearings: ['-1.8', '1.8'],
  foundation: levelFoundation('240 - 1.2'),
};

const groupIds = (sheet: PropertySheet) => sheet.groups.map((g) => g.id);
const labels = (sheet: PropertySheet, id: string) =>
  (sheet.groups.find((g) => g.id === id)?.rows ?? []).map((r: PropertyRow) =>
    r.kind === 'note' ? 'note' : r.label,
  );

function support(s: Support, commands: Command[] = []) {
  return supportSheet({
    support: s,
    result: undefined,
    decks: [{ id: 'nk', name: 'NK' }],
    lines,
    occupied: new Set(['l1', 'l2']),
    onBearings: () => {},
    onDelete: () => {},
    dispatch: (c) => commands.push(c),
  });
}

describe('supportSheet', () => {
  it('shows a wall pier with position, dimensions, founding and bearings', () => {
    const sheet = support(pier);
    expect(sheet.heading.label).toBe('Pilier');
    expect(sheet.type?.value).toBe('wall');
    expect(groupIds(sheet)).toEqual([
      'support-identity',
      'support-position',
      'support-dimensions',
      'support-founding',
      'support-bearings',
    ]);
    expect(labels(sheet, 'support-dimensions')).toEqual([
      'hrúbka (kolmo na os podpery)',
      'dĺžka (pozdĺž osi podpery)',
    ]);
    const bearings = sheet.groups.find((g) => g.id === 'support-bearings')?.rows ?? [];
    expect(bearings.find((r) => r.kind === 'edit')).toMatchObject({ value: '-1.8; 1.8' });
  });

  it('shows the field of the foundation mode, the terrain and switches the mode', () => {
    const commands: Command[] = [];
    expect(labels(support(pier), 'support-founding').slice(0, 3)).toEqual([
      'Založenie',
      'Kóta základovej škáry [m n. m.]',
      'Terén v strede podpery [m n. m.]',
    ]);
    const onTerrain: Support = {
      ...pier,
      foundation: { ...pier.foundation, mode: 'terrain', terrain: 245.123 },
    };
    const rows = support(onTerrain, commands).groups.find((g) => g.id === 'support-founding')?.rows;
    expect(rows?.[1]).toMatchObject({ label: 'Krytie pod terénom [m]', value: '0.5' });
    expect(rows?.[2]).toMatchObject({ kind: 'readonly', value: '245,123' });
    const mode = rows?.[0];
    if (mode?.kind === 'select') mode.onChange('height');
    expect(commands[0]).toMatchObject({
      changes: { foundation: { mode: 'height', height: '8', terrain: 245.123 } },
    });
  });

  it('shows the column shape and switches dimensions for rectangular columns', () => {
    const columns: Support = {
      ...pier,
      geometry: {
        type: 'columns',
        shape: 'rect',
        diameter: '1.2',
        width: '1.5',
        depth: '1',
        count: '2',
        spacing: '4',
      },
    };
    expect(labels(support(columns), 'support-dimensions')).toEqual([
      'Prierez stĺpa',
      'šírka stĺpa (pozdĺž osi podpery)',
      'hĺbka stĺpa',
      'počet stĺpov',
      'osová vzdialenosť stĺpov',
    ]);
  });

  it('splits an abutment into seat, stem, backwall and wings', () => {
    const sheet = support({ ...pier, kind: 'abutment', geometry: defaultAbutmentGeometry('12') });
    expect(sheet.heading.label).toBe('Opora');
    expect(groupIds(sheet)).toEqual([
      'support-identity',
      'support-position',
      'abutment-sketch',
      'abutment-seat',
      'abutment-stem',
      'abutment-backwall',
      'abutment-wings',
      'support-founding',
      'support-bearings',
    ]);
    // zavesené krídlo má výšku na konci, založené nie
    expect(
      labels(support({ ...pier, geometry: defaultAbutmentGeometry() }), 'abutment-wings'),
    ).toContain('výška krídla na konci');
  });

  it('labels the abutment dimensions with the sketch letters and switches to a fixed monolithic wall', () => {
    const commands: Command[] = [];
    const abutment: Support = {
      ...pier,
      kind: 'abutment',
      geometry: defaultAbutmentGeometry('12'),
    };
    const sheet = support(abutment, commands);
    expect(labels(sheet, 'abutment-seat')).toEqual([
      'Konštrukcia',
      'dĺžka (pozdĺž osi podpery)',
      'a — predsadenie prahu',
      'e — odsadenie konca NK',
      'h_p — výška prahu',
      'note',
    ]);
    const row = sheet.groups.find((g) => g.id === 'abutment-seat')?.rows?.[0];
    if (row?.kind === 'select') row.onChange('monolithic');
    expect(commands[0]).toMatchObject({
      collection: 'supports',
      changes: {
        geometry: { construction: 'monolithic' },
        connection: 'fixed',
        bearingHeight: '0',
      },
    });
    const monolithic = support({
      ...abutment,
      geometry: { ...defaultAbutmentGeometry('12'), construction: 'monolithic' },
    });
    expect(groupIds(monolithic)).toEqual([
      'support-identity',
      'support-position',
      'abutment-sketch',
      'abutment-wall',
      'abutment-wings',
      'support-founding',
      'support-bearings',
    ]);
    expect(labels(monolithic, 'abutment-wall')).toContain('t_s — hrúbka steny');
  });

  it('writes the station and crossing angle to its bearing line, other changes to the support', () => {
    const commands: Command[] = [];
    const sheet = support(pier, commands);
    const angle = sheet.groups
      .find((g) => g.id === 'support-position')
      ?.rows?.find((r) => r.kind === 'expression');
    if (angle?.kind === 'expression') angle.onCommit('68.71');
    sheet.type?.onChange('columns');
    expect(commands[0]).toEqual({
      type: 'updateElement',
      collection: 'bearingLines',
      id: 'l2',
      changes: { crossingAngle: '68.71' },
    });
    expect(commands[1]).toMatchObject({
      collection: 'supports',
      changes: { geometry: { type: 'columns' } },
    });
  });

  it('offers its own and free bearing lines only', () => {
    const identity = support(pier).groups.find((g) => g.id === 'support-identity');
    const select = identity?.rows?.find((r) => r.kind === 'select' && r.label === 'Os uloženia');
    expect(select?.kind === 'select' && select.options.map((o) => o.value)).toEqual(['l2', 'l3']);
    expect(select?.kind === 'select' && select.options[0]?.label).toBe(
      'NK · Os uloženia 2 · km 1,116 000',
    );
  });
});

describe('bearingLineSheet', () => {
  const sheet = (supports: Pick<Support, 'id' | 'name' | 'kind'>[]) =>
    bearingLineSheet({
      line: line2,
      result: undefined,
      decks: [{ id: 'nk', name: 'NK' }],
      supports,
      spans: undefined,
      profiles: [{ id: 'cb', name: 'Priečnik' }],
      onCrossbeamTemplate: () => {},
      onAddSupport: () => {},
      onSelectSupport: () => {},
      onDelete: () => {},
      dispatch: () => {},
    });

  it('shows position and the support standing on it', () => {
    const s = sheet([{ id: 'p1', name: 'P1', kind: 'pier' }]);
    expect(s.heading.label).toBe('Os uloženia');
    expect(groupIds(s)).toEqual([
      'line-identity',
      'line-position',
      'line-support',
      'line-crossbeam',
    ]);
    expect(labels(s, 'line-position')).toEqual(['Staničenie', 'Uhol kríženia [°] (90 = kolmá)']);
    expect(s.actions?.map((a) => a.label)).toEqual(['Odstrániť']);
  });

  it('chooses a crossbeam profile and width on the line', () => {
    const commands: Command[] = [];
    const s = bearingLineSheet({
      line: { ...line2, crossbeam: { profile: 'cb', width: '1.0' } },
      result: undefined,
      decks: [{ id: 'nk', name: 'NK' }],
      supports: [],
      spans: undefined,
      profiles: [{ id: 'cb', name: 'Priečnik' }],
      onCrossbeamTemplate: () => {},
      onAddSupport: () => {},
      onSelectSupport: () => {},
      onDelete: () => {},
      dispatch: (c) => commands.push(c),
    });
    expect(labels(s, 'line-crossbeam')).toEqual([
      'Prierez priečnika',
      'Šírka v osi mosta [m]',
      'note',
    ]);
    const select = s.groups.find((g) => g.id === 'line-crossbeam')?.rows?.[0];
    expect(select?.kind === 'select' && select.options.map((o) => o.value)).toEqual([
      '',
      'cb',
      'template:crossbeam',
    ]);
    if (select?.kind === 'select') select.onChange('');
    expect(commands[0]).toMatchObject({
      collection: 'bearingLines',
      changes: { crossbeam: undefined },
    });
  });

  it('offers to insert a support on a free line', () => {
    expect(sheet([]).actions?.map((a) => a.label)).toEqual(['Vložiť podperu', 'Odstrániť']);
  });
});

describe('deckSheet', () => {
  const profile = profileTemplate('slab', 'pr');
  if (!profile) throw new Error('chýba šablóna');
  const deck: Superstructure = {
    id: 'nk',
    name: 'NK',
    bridgeAxis: 'ax',
    from: 1100,
    to: 1155,
    profile: 'pr',
    parameterLaws: {
      h: { kind: 'constant', value: '1.1' },
      chyba: { kind: 'constant', value: '1' },
    },
    orientation: 'vertical',
  };
  const spans = {
    lines: [],
    spans: [
      {
        index: 0,
        from: {
          line: { id: 'l1', name: '1' },
          supports: [{ id: 'o1', name: 'O1', kind: 'abutment' }],
          s: 100,
          station: 1100,
        },
        to: {
          line: { id: 'l2', name: '2' },
          supports: [{ id: 'p1', name: 'P1', kind: 'pier' }],
          s: 116,
          station: 1116,
        },
        length: 16,
      },
    ],
    issues: [],
    lengths: {
      deck: { sFrom: 99.5, sTo: 154.5, lFrom: 99.5, lTo: 154.5, length: 55 },
      bridged: { sFrom: 100.9, sTo: 153.1, lFrom: 100.9, lTo: 153.1, length: 52.2 },
      overall: { sFrom: 94.58, sTo: 159.42, lFrom: 94.58, lTo: 159.42, length: 64.84 },
    },
  } as DeckSpans;

  const sheetOf = (
    lines: Pick<BearingLine, 'id' | 'crossingAngle'>[] = [],
    commands: Command[] = [],
    widths: { deck?: Superstructure; widths?: DeckWidthRange; brief?: number } = {},
  ) =>
    deckSheet({
      deck: widths.deck ?? deck,
      widths: widths.widths,
      briefFreeWidth: widths.brief,
      profiles: [profile],
      axes: [{ id: 'ax', name: 'Os mosta' }],
      curveName: () => '',
      spans,
      lines,
      abutmentAt: { start: true, end: false },
      result: undefined,
      station: 1120,
      onEditLaw: () => {},
      onAddSupport: () => {},
      onSpanLayout: () => {},
      onDelete: () => {},
      dispatch: (c) => commands.push(c),
    });

  it('sets the crossing angle of all bearing lines in one step and shows mixed angles', () => {
    const commands: Command[] = [];
    const sheet = sheetOf(
      [
        { id: 'l1', crossingAngle: '90' },
        { id: 'l2', crossingAngle: '80' },
      ],
      commands,
    );
    const row = sheet.groups.find((g) => g.id === 'deck-lines')?.rows?.[0];
    expect(row).toMatchObject({ kind: 'expression', value: '', placeholder: 'rôzne' });
    if (row?.kind === 'expression') row.onCommit('68.71 * 0.9');
    expect(commands).toEqual([
      {
        type: 'batch',
        commands: ['l1', 'l2'].map((id) => ({
          type: 'updateElement',
          collection: 'bearingLines',
          id,
          changes: { crossingAngle: '68.71 * 0.9' },
        })),
      },
    ]);
    expect(
      sheetOf([{ id: 'l1', crossingAngle: '76' }]).groups.find((g) => g.id === 'deck-lines')
        ?.rows?.[0],
    ).toMatchObject({ value: '76' });
    expect(sheetOf().groups.some((g) => g.id === 'deck-lines')).toBe(false);
    expect(sheet.actions?.[0]?.label).toBe('Rozloženie polí');
  });

  it('edits the required free width (empty = from the brief) and shows the free width range', () => {
    const commands: Command[] = [];
    const range = { min: 12.75, max: 12.8, at: 100 };
    const rowsOf = (sheet: ReturnType<typeof sheetOf>) =>
      sheet.groups.find((g) => g.id === 'deck-widths')?.rows ?? [];
    const rows = rowsOf(
      sheetOf([], commands, {
        widths: { deck: range, bridge: range, free: range },
        brief: 12.75,
      }),
    );
    expect(rows[0]).toMatchObject({ kind: 'text', value: '', placeholder: 'zo zadania 12 750' });
    expect(rows[1]).toMatchObject({ kind: 'readonly', value: '12 750 – 12 800' });
    if (rows[0]?.kind === 'text') rows[0].onCommit('13 000');
    expect(commands.at(-1)).toMatchObject({ changes: { freeWidth: 13 } });
    const own = rowsOf(sheetOf([], commands, { deck: { ...deck, freeWidth: 13 }, brief: 12.75 }));
    expect(own[0]).toMatchObject({ value: '13 000', action: { label: 'Podľa zadania' } });
    if (own[0]?.kind === 'text') own[0].onCommit('');
    expect(commands.at(-1)).toMatchObject({ changes: { freeWidth: undefined } });
    // bez ríms na oboch stranách sa voľná šírka nemeria
    expect(rowsOf(sheetOf())[1]).toMatchObject({ kind: 'note', tone: 'muted' });
  });

  it('derives the deck start from the abutment and lets it be unlocked', () => {
    const commands: Command[] = [];
    const sheet = sheetOf([], commands);
    const rows = sheet.groups.find((g) => g.id === 'deck-range')?.rows ?? [];
    expect(rows.map((r) => (r.kind === 'note' ? 'note' : `${r.kind}:${r.label}`))).toEqual([
      'select:Os mosta',
      'toggle:Začiatok podľa opory',
      'readonly:Od',
      'toggle:Koniec podľa opory',
      'station:Do',
      'select:Rovina prierezu',
    ]);
    // koniec bez opory sa nedá zamknúť
    expect(rows[3]).toMatchObject({ kind: 'toggle', disabled: true });
    const toggle = rows[1];
    if (toggle?.kind === 'toggle') toggle.onChange(false);
    expect(commands[0]).toMatchObject({
      changes: { ends: { start: 'manual', end: 'abutment' } },
    });
  });

  it('lists profile parameters with their laws and flags unknown ones', () => {
    const sheet = sheetOf();
    const laws = sheet.groups.find((g) => g.id === 'deck-laws')?.rows ?? [];
    const h = laws.find((r) => r.kind === 'edit' && r.label.startsWith('h '));
    expect(h).toMatchObject({ value: '1.1 m' });
    expect(laws.filter((r) => r.kind === 'note')).toHaveLength(1);
    expect(labels(sheet, 'deck-spans')).toEqual([
      '1. pole (1 – 2)',
      'Dĺžka NK',
      'Dĺžka premostenia (líca úložných prahov)',
      'Celková dĺžka mosta (po konce krídel)',
    ]);
  });

  it('summarises edge laws by curve and side', () => {
    expect(
      profileLawSummary(
        { kind: 'edge', curve: { type: 'alignment', name: '125_L' }, side: 'left', add: '0' },
        '6',
        (law) => (law.curve.type === 'alignment' ? law.curve.name : ''),
      ),
    ).toBe('okraj podľa 125_L (vľavo od osi mosta)');
    expect(profileLawSummary(undefined, '6', () => '')).toBe('predvolená 6');
  });
});

describe('profileSheet', () => {
  it('edits parameter defaults and opens the tables for points and loops', () => {
    const profile = profileTemplate('box', 'pr');
    if (!profile) throw new Error('chýba šablóna');
    const commands: Command[] = [];
    let tables = 0;
    const sheet = profileSheet({
      profile,
      onTables: () => tables++,
      onEditGraphically: () => {},
      onDelete: () => {},
      dispatch: (c) => commands.push(c),
    });
    const defaults = sheet.groups.find((g) => g.id === 'profile-defaults')?.rows ?? [];
    expect(defaults).toHaveLength(profile.parameters.length);
    const first = defaults[0];
    if (first?.kind === 'expression') first.onCommit('3.8');
    const change = commands[0];
    expect(change?.type === 'updateElement' && change.collection).toBe('profiles');
    const parameters =
      change?.type === 'updateElement' && 'parameters' in change.changes
        ? change.changes.parameters
        : undefined;
    expect(parameters?.map((p) => p.default)).toEqual([
      '3.8',
      ...profile.parameters.slice(1).map((p) => p.default),
    ]);
    const geometry = sheet.groups.find((g) => g.id === 'profile-geometry')?.rows ?? [];
    const edit = geometry.find((r) => r.kind === 'edit');
    if (edit?.kind === 'edit') edit.onEdit();
    expect(tables).toBe(1);
  });
});
