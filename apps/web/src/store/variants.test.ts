import { type ProjectFile, variantProject } from '@bridge/model';
import { profileTemplate, UNIT_PRICES } from '@bridge/sections';
import { reference212Project } from '@bridge/sections/testing';
import { describe, expect, it } from 'vitest';
import { sk } from '../i18n/sk.ts';
import { createProjectStore } from './projectStore.ts';
import {
  bestVariants,
  evaluateVariant,
  INDICATORS,
  type Indicators,
  variantIndicators,
} from './variants.ts';

/** 212-00 ako variant A (3 polia, jednotrám) a B (1 pole, komora) — hotové, keď 10h. */
function twoVariants(): ProjectFile {
  const store = createProjectStore(reference212Project());
  const { dispatch } = store.getState();
  dispatch({ type: 'renameVariant', id: 'variant-a', name: 'Jednotrám 3 polia' });
  dispatch({ type: 'duplicateVariant', id: 'variant-b', name: 'Komora 1 pole' });
  dispatch({ type: 'removeElement', collection: 'bearingLines', id: 'l2' });
  dispatch({ type: 'removeElement', collection: 'bearingLines', id: 'l3' });
  const box = profileTemplate('box', 'komora');
  if (!box) throw new Error('chýba šablóna komory');
  dispatch({ type: 'addElements', profiles: [box] });
  dispatch({
    type: 'updateElement',
    collection: 'superstructures',
    id: 'nk',
    changes: { profile: 'komora', parameterLaws: {} },
  });
  return store.getState().project;
}

const number = (i: Indicators, key: keyof Indicators) => {
  const v = i[key];
  return v?.kind === 'number' ? v.value : undefined;
};

describe('variant comparison of 212-00 (ADR 0024)', () => {
  const project = twoVariants();
  const models = project.variants.map((v) => evaluateVariant(variantProject(project, v.id)));
  const [a, b] = models.map((m) => (m ? variantIndicators(m) : {}));
  if (!a || !b) throw new Error('varianty sa nevyhodnotili');

  it('evaluates each variant with its own spans, supports and section', () => {
    expect(number(a, 'spanCount')).toBe(3);
    expect(number(b, 'spanCount')).toBe(1);
    expect(number(a, 'maxSpan')).toBeCloseTo(23, 9);
    expect(number(b, 'maxSpan')).toBeCloseTo(55, 9);
    expect([number(a, 'piers'), number(b, 'piers')]).toEqual([2, 0]);
    expect([number(a, 'abutments'), number(b, 'abutments')]).toEqual([2, 2]);
    expect([number(a, 'bearings'), number(b, 'bearings')]).toEqual([8, 4]);
    expect(number(a, 'bridgeArea')).toBeCloseTo(53.2 * 16.5, 6);
    expect(number(a, 'economicSpan')).toBeGreaterThan(0);
  });

  it('prices the bridge area with the placeholder unit price of the deck typology', () => {
    expect(number(a, 'cost')).toBeCloseTo(
      (number(a, 'bridgeArea') ?? 0) * (UNIT_PRICES.singleBeamHaunched ?? 0),
      3,
    );
    expect(number(b, 'cost')).toBeCloseTo(
      (number(b, 'bridgeArea') ?? 0) * (UNIT_PRICES.box ?? 0),
      3,
    );
  });

  it('integrates the deck volume of both variants to A·L of their constant sections', () => {
    for (const [i, m] of models.entries()) {
      const deck = m?.decks[0];
      const area = deck?.drawing.samples.sections[0]?.area ?? 0;
      expect(area).toBeGreaterThan(0);
      expect(number(i === 0 ? a : b, 'deckVolume')).toBeCloseTo(area * 56, 6);
    }
    const volumes = [number(a, 'deckVolume'), number(b, 'deckVolume')];
    expect(volumes[0]).not.toBeCloseTo(volumes[1] ?? 0, 1);
    expect(number(a, 'substructureVolume')).toBeGreaterThan(number(b, 'substructureVolume') ?? 0);
    expect(number(a, 'equivalentThickness')).toBeCloseTo(
      (volumes[0] ?? 0) / (number(a, 'deckPlanArea') ?? 1),
      12,
    );
  });

  it('highlights the better value of rated rows only', () => {
    const row = (key: keyof Indicators) => {
      const def = INDICATORS.find((d) => d.key === key);
      return bestVariants([a[key], b[key]], def && 'better' in def ? def.better : undefined);
    };
    expect(row('piers')).toEqual([1]);
    expect(row('bearings')).toEqual([1]);
    expect(row('abutments')).toEqual([]);
    expect(row('spanCount')).toEqual([]);
    const smaller = (number(a, 'deckVolume') ?? 0) < (number(b, 'deckVolume') ?? 0) ? 0 : 1;
    expect(row('deckVolume')).toEqual([smaller]);
    // rovnaké hodnoty sa nezvýrazňujú
    expect(row('minCrossingAngle')).toEqual([]);
  });
});

describe('bestVariants', () => {
  const n = (value: number) => ({ kind: 'number' as const, value });
  it('marks every tie and needs two numeric values', () => {
    expect(bestVariants([n(2), n(1), n(1)], 'min')).toEqual([1, 2]);
    expect(bestVariants([n(2), undefined, n(3)], 'max')).toEqual([2]);
    expect(bestVariants([n(2), undefined], 'min')).toEqual([]);
    expect(bestVariants([n(2), n(1)], undefined)).toEqual([]);
  });
});

describe('indicator texts', () => {
  it('has a label and an explanation for every indicator', () => {
    expect(Object.keys(sk.variants.indicators).sort()).toEqual(INDICATORS.map((d) => d.key).sort());
    expect(Object.keys(sk.variants.groups).sort()).toEqual(
      [...new Set(INDICATORS.map((d) => d.group))].sort(),
    );
  });
});
