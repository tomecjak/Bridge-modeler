import { syntheticAlignmentData } from '@bridge/alignment/testing';
import { levelFoundation, type Parameter, type TerrainSurface } from '@bridge/model';
import { reference212Project } from '@bridge/sections/testing';
import { describe, expect, it } from 'vitest';
import { syncDeckEnds } from './deckEnds.ts';
import { createProjectStore, normalizeProject } from './projectStore.ts';

const param = (id: string, name: string, value: string): Parameter => ({
  id,
  name,
  unit: 'length',
  law: { kind: 'constant', value },
});

describe('project store', () => {
  it('applies commands and undoes / redoes them', () => {
    const store = createProjectStore();
    const { dispatch, undo, redo } = store.getState();
    dispatch({ type: 'addParameter', parameter: param('a', 'h0', '1.0') });
    dispatch({
      type: 'updateParameter',
      id: 'a',
      changes: { law: { kind: 'constant', value: '1.2' } },
    });
    expect(store.getState().project.parameters[0]?.law).toEqual({ kind: 'constant', value: '1.2' });

    undo();
    expect(store.getState().project.parameters[0]?.law).toEqual({ kind: 'constant', value: '1.0' });
    undo();
    expect(store.getState().project.parameters).toEqual([]);
    redo();
    redo();
    expect(store.getState().project.parameters[0]?.law).toEqual({ kind: 'constant', value: '1.2' });
    expect(store.getState().future).toEqual([]);
  });

  it('clears redo history after a new command and counts revisions', () => {
    const store = createProjectStore();
    const s = store.getState();
    s.dispatch({ type: 'setProjectName', name: 'A' });
    s.dispatch({ type: 'setProjectName', name: 'B' });
    s.undo();
    s.dispatch({ type: 'setProjectName', name: 'C' });
    expect(store.getState().future).toEqual([]);
    expect(store.getState().project.name).toBe('C');
    expect(store.getState().revision).toBe(4);
  });

  it('renames a parameter with its references in one undoable step', () => {
    const store = createProjectStore();
    const s = store.getState();
    s.dispatch({ type: 'addParameter', parameter: param('a', 'h0', '1.0') });
    s.dispatch({ type: 'addParameter', parameter: param('b', 'h1', 'h0 + 0.6') });
    s.dispatch({ type: 'renameParameter', id: 'a', name: 'hNK' });
    expect(store.getState().project.parameters[1]?.law).toEqual({
      kind: 'constant',
      value: 'hNK + 0.6',
    });
    store.getState().undo();
    expect(store.getState().project.parameters.map((p) => p.name)).toEqual(['h0', 'h1']);
    expect(store.getState().project.parameters[1]?.law).toEqual({
      kind: 'constant',
      value: 'h0 + 0.6',
    });
  });

  it('adds, updates and removes bridge elements; adding several is one undo step', () => {
    const store = createProjectStore();
    const s = store.getState();
    const law = { kind: 'constant' as const, value: '0' };
    s.dispatch({
      type: 'addElements',
      bridgeAxes: [
        { id: 'a', name: 'Os', alignment: 'A', horizontalOffset: law, verticalOffset: law },
      ],
      superstructures: [
        {
          id: 'n',
          name: 'NK',
          bridgeAxis: 'a',
          from: 0,
          to: 10,
          profile: 'p',
          parameterLaws: {},
          orientation: 'vertical',
        },
      ],
    });
    s.dispatch({
      type: 'updateElement',
      collection: 'superstructures',
      id: 'n',
      changes: { to: 20 },
    });
    expect(store.getState().project.superstructures[0]?.to).toBe(20);
    s.dispatch({ type: 'removeElement', collection: 'bridgeAxes', id: 'a' });
    expect(store.getState().project.bridgeAxes).toEqual([]);
    store.getState().undo();
    store.getState().undo();
    store.getState().undo();
    expect(store.getState().project.superstructures).toEqual([]);
    expect(store.getState().project.bridgeAxes).toEqual([]);
  });

  it('adds a plan line and moves its vertex as undoable steps', () => {
    const store = createProjectStore();
    const s = store.getState();
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    s.dispatch({ type: 'addElements', planLines: [{ id: 'c', name: 'Čiara 1', points }] });
    s.dispatch({
      type: 'updateElement',
      collection: 'planLines',
      id: 'c',
      changes: { points: [points[0] as (typeof points)[number], { x: 10, y: 2 }] },
    });
    expect(store.getState().project.planLines[0]?.points[1]).toEqual({ x: 10, y: 2 });
    store.getState().undo();
    expect(store.getState().project.planLines[0]?.points).toEqual(points);
    store.getState().undo();
    expect(store.getState().project.planLines).toEqual([]);
  });

  it('moves bearing lines and the deck end in one batch step and removes a line with its support', () => {
    const store = createProjectStore();
    const s = store.getState();
    const line = (id: string, station: number) => ({
      id,
      name: id,
      superstructure: 'n',
      station,
      crossingAngle: '90',
    });
    s.dispatch({ type: 'addElements', bearingLines: [line('1', 100), line('2', 116)] });
    const support = {
      id: 'o1',
      name: 'O1',
      kind: 'abutment' as const,
      bearingLine: '1',
      offset: '0',
      geometry: { type: 'wall' as const, thickness: '1', length: '4' },
      footing: { length: '0', width: '0', thickness: '0' },
      connection: 'bearing' as const,
      bearingHeight: '0.35',
      bearings: ['0'],
      foundation: levelFoundation('240'),
    };
    s.dispatch({ type: 'addElements', supports: [support] });
    s.dispatch({
      type: 'batch',
      commands: [
        { type: 'updateElement', collection: 'bearingLines', id: '1', changes: { station: 99 } },
        { type: 'updateElement', collection: 'bearingLines', id: '2', changes: { station: 117 } },
      ],
    });
    expect(store.getState().project.bearingLines.map((l) => l.station)).toEqual([99, 117]);
    store.getState().undo();
    expect(store.getState().project.bearingLines.map((l) => l.station)).toEqual([100, 116]);
    store.getState().redo();
    s.dispatch({ type: 'removeElement', collection: 'bearingLines', id: '1' });
    expect(store.getState().project.supports).toEqual([]);
    store.getState().undo();
    expect(store.getState().project.supports.map((x) => x.id)).toEqual(['o1']);
  });

  it('removes the edge beams with their deck in one undoable step', () => {
    const ref = reference212Project();
    const store = createProjectStore(ref);
    const deck = ref.superstructures[0]?.id ?? '';
    const beam = (id: string, side: 'left' | 'right') => ({
      id,
      name: id,
      superstructure: deck,
      side,
      profile: 'rimsa',
      parameterLaws: {},
    });
    store
      .getState()
      .dispatch({ type: 'addElements', edgeBeams: [beam('r1', 'left'), beam('r2', 'right')] });
    expect(store.getState().project.edgeBeams.map((b) => b.id)).toEqual(['r1', 'r2']);
    store.getState().dispatch({ type: 'removeElement', collection: 'superstructures', id: deck });
    expect(store.getState().project.edgeBeams).toEqual([]);
    store.getState().undo();
    expect(store.getState().project.edgeBeams.map((b) => b.id)).toEqual(['r1', 'r2']);
  });

  it('keeps the deck ends on the abutments in the same undoable step', () => {
    const ref = reference212Project();
    const store = createProjectStore(
      { ...ref, superstructures: ref.superstructures.map((d) => ({ ...d, from: 9300, to: 9370 })) },
      syncDeckEnds,
    );
    const deck = () => store.getState().project.superstructures[0];
    // otvorenie zosúladí rozsah NK s oporami
    expect(deck()).toMatchObject({ from: expect.closeTo(9307.31, 9), to: 9363.31 });
    store.getState().dispatch({
      type: 'updateElement',
      collection: 'bearingLines',
      id: 'l4',
      changes: { station: 9364.81 },
    });
    expect(deck()?.to).toBeCloseTo(9365.31, 9);
    store.getState().undo();
    expect(deck()?.to).toBeCloseTo(9363.31, 9);
    store.getState().redo();
    expect(deck()?.to).toBeCloseTo(9365.31, 9);
    // odomknutý koniec ostáva
    store.getState().dispatch({
      type: 'updateElement',
      collection: 'superstructures',
      id: 'nk',
      changes: { ends: { start: 'abutment', end: 'manual' } },
    });
    store.getState().dispatch({
      type: 'updateElement',
      collection: 'bearingLines',
      id: 'l4',
      changes: { station: 9362.81 },
    });
    expect(deck()?.to).toBeCloseTo(9365.31, 9);
  });

  it('samples the terrain in the support centres in the same undoable step', () => {
    const plane = (x: number, y: number) => 300 + 0.01 * x + 0.02 * y;
    const corners = [
      [-300, -300],
      [400, -300],
      [400, 400],
      [-300, 400],
    ] as const;
    const terrain: TerrainSurface = {
      id: 't',
      name: 'DMR',
      source: 'landxml',
      corridor: { halfWidth: 60, margin: 50 },
      data: {
        kind: 'tin',
        points: corners.flatMap(([x, y]) => [x, y, plane(x, y)]),
        triangles: [0, 1, 2, 0, 2, 3],
      },
    };
    const store = createProjectStore(reference212Project(), normalizeProject);
    const terrainOf = (id: string) =>
      store.getState().project.supports.find((s) => s.id === id)?.foundation.terrain;
    expect(terrainOf('p2')).toBeUndefined();
    store.getState().dispatch({ type: 'addElements', terrains: [terrain] });
    const before = terrainOf('p2') ?? Number.NaN;
    expect(before).toBeGreaterThan(290);
    // os 2 o 1 m ďalej po osi cesty (azimut 1,1 rad) → terén v strede piliera sa zmení
    store.getState().dispatch({
      type: 'updateElement',
      collection: 'bearingLines',
      id: 'l2',
      changes: { station: 9324.81 },
    });
    expect((terrainOf('p2') ?? 0) - before).toBeCloseTo(
      0.01 * Math.sin(1.1) + 0.02 * Math.cos(1.1),
      3,
    );
    store.getState().undo();
    expect(terrainOf('p2')).toBe(before);
    // len povrchy pre založenie: vyšší návrhový povrch bez príznaku sa neberie
    const higher: TerrainSurface = {
      ...terrain,
      id: 'htu',
      name: 'HTU',
      data: {
        kind: 'tin',
        points: corners.flatMap(([x, y]) => [x, y, plane(x, y) + 10]),
        triangles: [0, 1, 2, 0, 2, 3],
      },
    };
    store.getState().dispatch({ type: 'addElements', terrains: [higher] });
    expect(store.getState().project.terrains.map((t) => t.foundation)).toEqual([true, undefined]);
    expect(terrainOf('p2')).toBe(before);
    store.getState().dispatch({
      type: 'updateElement',
      collection: 'terrains',
      id: 'htu',
      changes: { foundation: true },
    });
    expect(terrainOf('p2')).toBeCloseTo(before + 10, 6);
    store.getState().dispatch({ type: 'removeElement', collection: 'terrains', id: 'htu' });
    store.getState().dispatch({ type: 'removeElement', collection: 'terrains', id: 't' });
    expect(terrainOf('p2')).toBeUndefined();
  });

  it('edits the brief and the study area as undoable steps', () => {
    const store = createProjectStore();
    const { dispatch, undo, redo } = store.getState();
    dispatch({ type: 'updateBrief', changes: { roadCategory: 'C 9,5/70' } });
    dispatch({ type: 'updateBrief', changes: { object: { number: '201-00', name: 'Most' } } });
    dispatch({ type: 'setStudyArea', studyArea: { alignment: 'Os', from: 100, to: 250 } });
    expect(store.getState().project.brief).toMatchObject({
      roadCategory: 'C 9,5/70',
      object: { number: '201-00', name: 'Most' },
    });
    expect(store.getState().project.studyArea).toEqual({ alignment: 'Os', from: 100, to: 250 });

    undo();
    expect(store.getState().project.studyArea).toBeNull();
    undo();
    expect(store.getState().project.brief.object).toEqual({ number: '', name: '' });
    expect(store.getState().project.brief.roadCategory).toBe('C 9,5/70');
    redo();
    redo();
    expect(store.getState().project.studyArea?.to).toBe(250);
  });

  it('ignores commands that change nothing', () => {
    const store = createProjectStore();
    store.getState().dispatch({ type: 'removeParameter', id: 'missing' });
    expect(store.getState().past).toEqual([]);
  });

  it('imports alignments, sets the origin once and replaces alignments with the same name', () => {
    const store = createProjectStore();
    const a = syntheticAlignmentData();
    store
      .getState()
      .dispatch({ type: 'importAlignments', alignments: [a], origin: { x: 1, y: 2, z: 0 } });
    store.getState().dispatch({
      type: 'importAlignments',
      alignments: [{ ...a, staStart: 500 }],
      origin: { x: 9, y: 9, z: 0 },
    });
    const { project } = store.getState();
    expect(project.crs.origin).toEqual({ x: 1, y: 2, z: 0 });
    expect(project.alignments).toHaveLength(1);
    expect(project.alignments[0]?.staStart).toBe(500);
  });

  it('keeps unchanged parts of the project referentially equal (cheap memoization)', () => {
    const store = createProjectStore();
    store.getState().dispatch({
      type: 'importAlignments',
      alignments: [syntheticAlignmentData()],
      origin: { x: 0, y: 0, z: 0 },
    });
    const before = store.getState().project.alignments;
    store.getState().dispatch({ type: 'addParameter', parameter: param('a', 'h0', '1') });
    expect(store.getState().project.alignments).toBe(before);
  });
});
