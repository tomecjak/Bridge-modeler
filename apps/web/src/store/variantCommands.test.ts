import {
  buildParameterSet,
  createEmptyProject,
  effectiveParameters,
  type ProjectFile,
  ProjectFileSchema,
  type Superstructure,
  variantElements,
} from '@bridge/model';
import { describe, expect, it } from 'vitest';
import { createProjectStore } from './projectStore.ts';

const deck = (id: string): Superstructure => ({
  id,
  name: id,
  bridgeAxis: 'os',
  from: 0,
  to: 50,
  profile: 'pr',
  parameterLaws: {},
  orientation: 'vertical',
});

/** Variant A (aktívny, NK „a“) a B (NK „b“, h0 prepísané na 2). */
function project(): ProjectFile {
  const p = createEmptyProject('Most');
  p.parameters.push(
    { id: 'p1', name: 'h0', unit: 'length', law: { kind: 'constant', value: '1' } },
    { id: 'p2', name: 'h', unit: 'length', law: { kind: 'expression', expr: 'h0 + 0.5' } },
  );
  p.superstructures.push(deck('a'));
  p.variants.push({
    id: 'vb',
    name: 'Variant B',
    parameters: { p1: { kind: 'constant', value: '2' } },
    elements: { ...variantElements(createEmptyProject('x')), superstructures: [deck('b')] },
  });
  return p;
}

const h = (p: ProjectFile) =>
  buildParameterSet(effectiveParameters(p)).evaluateAt(0).values.get('h');

describe('variant commands (ADR 0024)', () => {
  it('switches the active variant by swapping the bridge elements as one undoable step', () => {
    const store = createProjectStore(project());
    const a = store.getState().project.superstructures;
    store.getState().dispatch({ type: 'setActiveVariant', id: 'vb' });
    let p = store.getState().project;
    expect(p.activeVariant).toBe('vb');
    expect(p.superstructures.map((d) => d.id)).toEqual(['b']);
    expect(p.variants[0]?.elements?.superstructures).toBe(a);
    expect(p.variants[1]?.elements).toBeUndefined();
    expect(ProjectFileSchema.safeParse(p).success).toBe(true);
    expect(h(p)).toBeCloseTo(2.5, 12);

    // príkazom späť na A: tie isté kolekcie (lacná memoizácia), jeden krok na prepnutie
    store.getState().dispatch({ type: 'setActiveVariant', id: 'variant-a' });
    expect(store.getState().project.superstructures).toBe(a);
    expect(store.getState().past).toHaveLength(2);

    store.getState().undo();
    expect(store.getState().project.superstructures.map((d) => d.id)).toEqual(['b']);
    store.getState().undo();
    p = store.getState().project;
    expect(p.activeVariant).toBe('variant-a');
    expect(p.superstructures).toEqual(a);
    expect(h(p)).toBeCloseTo(1.5, 12);
    store.getState().redo();
    expect(store.getState().project.superstructures.map((d) => d.id)).toEqual(['b']);
  });

  it('ignores switching to the active or an unknown variant', () => {
    const store = createProjectStore(project());
    store.getState().dispatch({ type: 'setActiveVariant', id: 'variant-a' });
    store.getState().dispatch({ type: 'setActiveVariant', id: 'nie' });
    expect(store.getState().past).toHaveLength(0);
  });

  it('overrides a global parameter in the active variant only', () => {
    const store = createProjectStore(project());
    store.getState().dispatch({
      type: 'setParameterOverride',
      id: 'p1',
      law: { kind: 'constant', value: '3' },
    });
    expect(h(store.getState().project)).toBeCloseTo(3.5, 12);
    store.getState().dispatch({ type: 'setActiveVariant', id: 'vb' });
    expect(h(store.getState().project)).toBeCloseTo(2.5, 12);
    store.getState().dispatch({ type: 'setParameterOverride', id: 'p1', law: null });
    expect(h(store.getState().project)).toBeCloseTo(1.5, 12);
    expect(store.getState().project.variants[1]?.parameters).toEqual({});
    // neznámy parameter sa neprepisuje
    store.getState().dispatch({
      type: 'setParameterOverride',
      id: 'nie',
      law: { kind: 'constant', value: '1' },
    });
    expect(store.getState().project.variants[1]?.parameters).toEqual({});
  });

  it('renames references in the overrides and removes the overrides of a removed parameter', () => {
    const p = project();
    (p.variants[1] as (typeof p.variants)[number]).parameters.p2 = {
      kind: 'expression',
      expr: 'h0 * 2',
    };
    const store = createProjectStore(p);
    store.getState().dispatch({ type: 'renameParameter', id: 'p1', name: 'hMin' });
    expect(store.getState().project.variants[1]?.parameters.p2).toEqual({
      kind: 'expression',
      expr: 'hMin * 2',
    });
    store.getState().dispatch({ type: 'removeParameter', id: 'p1' });
    expect(Object.keys(store.getState().project.variants[1]?.parameters ?? {})).toEqual(['p2']);
  });

  it('duplicates the active variant with the same ids and overrides as the new active one', () => {
    const store = createProjectStore(project());
    store.getState().dispatch({ type: 'setActiveVariant', id: 'vb' });
    store.getState().dispatch({ type: 'duplicateVariant', id: 'vc', name: 'Variant C' });
    let p = store.getState().project;
    expect(p.activeVariant).toBe('vc');
    expect(p.variants.map((v) => v.name)).toEqual(['Variant A', 'Variant B', 'Variant C']);
    expect(p.superstructures.map((d) => d.id)).toEqual(['b']);
    expect(p.variants[1]?.elements?.superstructures.map((d) => d.id)).toEqual(['b']);
    expect(p.variants[2]?.parameters).toEqual({ p1: { kind: 'constant', value: '2' } });
    expect(ProjectFileSchema.safeParse(p).success).toBe(true);
    // zmena v kópii nemení pôvodný variant
    store.getState().dispatch({
      type: 'updateElement',
      collection: 'superstructures',
      id: 'b',
      changes: { name: 'NK C' },
    });
    p = store.getState().project;
    expect(p.variants[1]?.elements?.superstructures[0]?.name).toBe('b');
    // existujúce id sa nepoužije znova
    store.getState().dispatch({ type: 'duplicateVariant', id: 'vb', name: 'X' });
    expect(store.getState().project.variants).toHaveLength(3);
    store.getState().undo();
    store.getState().undo();
    p = store.getState().project;
    expect(p.variants).toHaveLength(2);
    expect(p.activeVariant).toBe('vb');
    expect(p.variants[1]?.elements).toBeUndefined();
  });

  it('renames a variant and removes it, switching away from the active one first', () => {
    const store = createProjectStore(project());
    store.getState().dispatch({ type: 'renameVariant', id: 'vb', name: 'Komora' });
    expect(store.getState().project.variants[1]?.name).toBe('Komora');
    store.getState().dispatch({ type: 'removeVariant', id: 'variant-a' });
    const p = store.getState().project;
    expect(p.variants.map((v) => v.id)).toEqual(['vb']);
    expect(p.activeVariant).toBe('vb');
    expect(p.superstructures.map((d) => d.id)).toEqual(['b']);
    expect(p.variants[0]?.elements).toBeUndefined();
    expect(ProjectFileSchema.safeParse(p).success).toBe(true);
    // posledný variant ostane
    store.getState().dispatch({ type: 'removeVariant', id: 'vb' });
    expect(store.getState().project.variants).toHaveLength(1);
    store.getState().undo();
    expect(store.getState().project.variants.map((v) => v.id)).toEqual(['variant-a', 'vb']);
    expect(store.getState().project.superstructures.map((d) => d.id)).toEqual(['a']);
  });
});
