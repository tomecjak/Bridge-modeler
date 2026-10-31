import { syntheticAlignmentData } from '@bridge/alignment/testing';
import type { Parameter } from '@bridge/model';
import { describe, expect, it } from 'vitest';
import { createProjectStore } from './projectStore.ts';

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
