import { describe, expect, it } from 'vitest';
import { openProject, serializeProject } from './project.ts';
import { createEmptyProject, type ProjectFile, ProjectFileSchema } from './schema.ts';
import type { Superstructure } from './types.ts';
import {
  activeVariantOf,
  DEFAULT_VARIANT_ID,
  effectiveParameters,
  nextVariantName,
  type Variant,
  variantElements,
  variantProject,
} from './variants.ts';

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

/** Projekt s aktívnym variantom A (NK „a“) a neaktívnym B (NK „b“). */
function twoVariants(): ProjectFile {
  const p = createEmptyProject('Most');
  p.parameters.push(
    { id: 'p1', name: 'h0', unit: 'length', law: { kind: 'constant', value: '1' } },
    { id: 'p2', name: 'b', unit: 'length', law: { kind: 'constant', value: '12' } },
  );
  p.superstructures.push(deck('a'));
  const empty = variantElements(createEmptyProject('x'));
  p.variants.push({
    id: 'vb',
    name: 'Variant B',
    parameters: { p1: { kind: 'constant', value: '2' } },
    elements: { ...empty, superstructures: [deck('b')] },
  });
  return p;
}

describe('variants (ADR 0024)', () => {
  it('starts a new project with one active variant A without stored elements', () => {
    const p = createEmptyProject('Most');
    expect(p.activeVariant).toBe(DEFAULT_VARIANT_ID);
    expect(p.variants).toEqual([{ id: DEFAULT_VARIANT_ID, name: 'Variant A', parameters: {} }]);
    expect(activeVariantOf(p).name).toBe('Variant A');
  });

  it('requires elements on every inactive variant and none on the active one', () => {
    const p = twoVariants();
    expect(ProjectFileSchema.safeParse(p).success).toBe(true);
    const unknown = { ...p, activeVariant: 'nie' };
    expect(ProjectFileSchema.safeParse(unknown).success).toBe(false);
    const missing = { ...p, variants: p.variants.map(({ elements: _e, ...v }) => v) };
    expect(ProjectFileSchema.safeParse(missing).success).toBe(false);
    const both = {
      ...p,
      variants: p.variants.map((v) => ({ ...v, elements: variantElements(p) })),
    };
    expect(ProjectFileSchema.safeParse(both).success).toBe(false);
    const duplicate = { ...p, variants: [...p.variants, p.variants[1] as Variant] };
    expect(ProjectFileSchema.safeParse(duplicate).success).toBe(false);
  });

  it('saves and opens a project with variants without loss', () => {
    const p = twoVariants();
    const opened = openProject(serializeProject(p));
    expect(opened).toEqual({ ok: true, project: p });
  });

  it('views another variant as the active one with the current one stored', () => {
    const p = twoVariants();
    expect(variantProject(p, DEFAULT_VARIANT_ID)).toBe(p);
    const b = variantProject(p, 'vb');
    expect(b.activeVariant).toBe('vb');
    expect(b.superstructures.map((d) => d.id)).toEqual(['b']);
    expect(b.variants[0]?.elements?.superstructures.map((d) => d.id)).toEqual(['a']);
    expect(b.variants[1]?.elements).toBeUndefined();
    // podklady a parametre sú spoločné
    expect(b.parameters).toBe(p.parameters);
    expect(b.alignments).toBe(p.alignments);
    expect(ProjectFileSchema.safeParse(b).success).toBe(true);
    // späť na A = pôvodný obsah
    expect(variantProject(b, DEFAULT_VARIANT_ID)).toEqual(p);
  });

  it('applies the parameter overrides of the active variant', () => {
    const p = twoVariants();
    expect(effectiveParameters(p)).toBe(p.parameters);
    const b = variantProject(p, 'vb');
    const params = effectiveParameters(b);
    expect(params.map((x) => x.law)).toEqual([
      { kind: 'constant', value: '2' },
      { kind: 'constant', value: '12' },
    ]);
    // neprepísaný parameter je ten istý objekt, výsledok je pri tých istých vstupoch ten istý
    expect(params[1]).toBe(p.parameters[1]);
    expect(effectiveParameters(b)).toBe(params);
  });

  it('names a new variant with the next free letter', () => {
    const named = (...names: string[]) => names.map((name, i) => ({ id: `v${i}`, name }));
    expect(nextVariantName(named('Variant A'))).toBe('Variant B');
    expect(nextVariantName(named('Variant A', 'Variant C'))).toBe('Variant B');
    expect(nextVariantName(named('Variant A', 'Variant B', 'Variant C'))).toBe('Variant D');
    const all = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((c) => `Variant ${c}`);
    expect(nextVariantName(named(...all))).toBe('Variant 27');
  });
});
