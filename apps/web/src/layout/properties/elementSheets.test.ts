import { defaultAbutmentGeometry, type Superstructure, type Support } from '@bridge/model';
import { profileTemplate } from '@bridge/sections';
import { describe, expect, it } from 'vitest';
import type { Command } from '../../store/commands.ts';
import type { DeckSpans } from '../../store/supports.ts';
import { deckSheet, profileLawSummary, profileSheet, supportSheet } from './elementSheets.tsx';
import type { PropertyRow, PropertySheet } from './PropertyGrid.tsx';

const pier: Support = {
  id: 'p1',
  name: 'P1',
  kind: 'pier',
  superstructure: 'nk',
  station: 1116,
  crossingAngle: '76.5',
  offset: '0',
  geometry: { type: 'wall', thickness: '1.2', length: '4' },
  footing: { length: '8', width: '4', thickness: '1.2' },
  connection: 'bearing',
  bearingHeight: '0.35',
  bearings: ['-1.8', '1.8'],
  foundationTop: '240',
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

  it('writes changes as updateElement commands', () => {
    const commands: Command[] = [];
    const sheet = support(pier, commands);
    const angle = sheet.groups
      .find((g) => g.id === 'support-position')
      ?.rows?.find((r) => r.kind === 'expression');
    if (angle?.kind === 'expression') angle.onCommit('68.71');
    sheet.type?.onChange('columns');
    expect(commands[0]).toEqual({
      type: 'updateElement',
      collection: 'supports',
      id: 'p1',
      changes: { crossingAngle: '68.71' },
    });
    expect(commands[1]).toMatchObject({ changes: { geometry: { type: 'columns' } } });
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
    supports: [],
    spans: [
      {
        index: 0,
        from: { support: { id: 'o1', name: 'O1', kind: 'abutment' }, s: 100, station: 1100 },
        to: { support: { id: 'p1', name: 'P1', kind: 'pier' }, s: 116, station: 1116 },
        length: 16,
      },
    ],
    issues: [],
    deckLength: 55,
    overallLength: 64.84,
  } as DeckSpans;

  it('lists profile parameters with their laws and flags unknown ones', () => {
    const sheet = deckSheet({
      deck,
      profiles: [profile],
      axes: [{ id: 'ax', name: 'Os mosta' }],
      curveName: () => '',
      spans,
      result: undefined,
      station: 1120,
      onEditLaw: () => {},
      onAddSupport: () => {},
      onDelete: () => {},
      dispatch: () => {},
    });
    const laws = sheet.groups.find((g) => g.id === 'deck-laws')?.rows ?? [];
    const h = laws.find((r) => r.kind === 'edit' && r.label.startsWith('h '));
    expect(h).toMatchObject({ value: '1.1 m' });
    expect(laws.filter((r) => r.kind === 'note')).toHaveLength(1);
    expect(labels(sheet, 'deck-spans')).toEqual([
      '1. pole (O1 – P1)',
      'Dĺžka NK',
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
