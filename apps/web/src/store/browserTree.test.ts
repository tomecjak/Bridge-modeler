import { syntheticAlignmentData } from '@bridge/alignment/testing';
import { createEmptyProject, defaultAbutmentGeometry, type Support } from '@bridge/model';
import { deckFromProfile, profileTemplate } from '@bridge/sections';
import { describe, expect, it } from 'vitest';
import { type BrowserInput, type BrowserNode, browserTree, sameTarget } from './browserTree.ts';

const road = syntheticAlignmentData(undefined, 1000);

function support(id: string, kind: Support['kind'], station: number, deck = 'nk'): Support {
  return {
    id,
    name: id.toUpperCase(),
    kind,
    superstructure: deck,
    station,
    crossingAngle: '90',
    offset: '0',
    geometry:
      kind === 'abutment'
        ? defaultAbutmentGeometry()
        : { type: 'wall', thickness: '1.2', length: '4' },
    footing: { length: '8', width: '4', thickness: '1.2' },
    connection: 'bearing',
    bearingHeight: '0.35',
    bearings: ['0'],
    foundationTop: '240',
  };
}

function input(): BrowserInput {
  const project = createEmptyProject('Most');
  project.alignments.push(road, { ...road, name: 'Vetva' });
  const profile = profileTemplate('box', 'pr');
  if (!profile) throw new Error('chýba šablóna');
  project.profiles.push(profile);
  const { bridgeAxis, superstructure } = deckFromProfile(road.name, 1100, 1155, 'pr', {
    deck: 'nk',
    axis: 'ax',
  });
  project.bridgeAxes.push(bridgeAxis);
  project.superstructures.push(superstructure);
  // podpery v opačnom poradí ako staničenie, jedna bez NK
  project.supports.push(
    support('o2', 'abutment', 1155),
    support('p1', 'pier', 1116),
    support('o1', 'abutment', 1100),
    support('p9', 'pier', 1130, 'chýba'),
  );
  project.studyArea = { alignment: road.name, from: 1080, to: 1180 };
  return {
    project,
    issues: {
      alignment: (name) => (name === 'Vetva' ? 2 : 0),
      element: (id) => (id === 'p1' ? 1 : 0),
      parameter: () => 0,
    },
    spans: new Map([['nk', [16, 23, 16]]]),
    views: [
      { mode: '3d', label: '3D' },
      { mode: '2d', label: '2D' },
    ],
  };
}

const find = (nodes: readonly BrowserNode[], key: string): BrowserNode | undefined => {
  for (const n of nodes) {
    if (n.key === key) return n;
    const inner = n.children && find(n.children, key);
    if (inner) return inner;
  }
  return undefined;
};

describe('browserTree', () => {
  it('lists views, the model, sources, profiles and parameters', () => {
    const tree = browserTree(input());
    expect(tree.map((n) => n.key)).toEqual(['views', 'model', 'sources', 'profiles', 'parameters']);
    expect(find(tree, 'views')?.children?.map((n) => n.label)).toEqual(['3D', '2D']);
  });

  it('nests the deck under its bridge axis and road, with supports ordered by station', () => {
    const tree = browserTree(input());
    const model = find(tree, 'model');
    // vetva bez prvkov mosta v modeli nie je, len v podkladoch
    expect(model?.children?.map((n) => n.label)).toEqual([road.name, 'Nepriradené']);
    const deck = find(tree, 'superstructures:nk');
    expect(deck?.detail).toBe('Komora · 16,00 + 23,00 + 16,00');
    expect(deck?.children?.map((n) => n.label)).toEqual(['O1', 'P1', 'O2']);
    expect(find(tree, 'supports:p1')).toMatchObject({ issues: 1, icon: 'pier' });
    expect(find(tree, 'supports:o1')?.icon).toBe('abutment');
    expect(find(tree, 'bridgeAxes:ax')?.children?.[0]?.key).toBe('superstructures:nk');
    expect(find(tree, 'studyArea')?.detail).toBe('km 1,080 – km 1,180');
  });

  it('keeps elements with a missing parent under Unassigned', () => {
    const tree = browserTree(input());
    expect(find(tree, 'unassigned')?.children?.map((n) => n.key)).toEqual(['supports:p9']);
  });

  it('shows all LandXML alignments with their issues among the sources', () => {
    const tree = browserTree(input());
    const alignments = find(tree, 'alignments')?.children ?? [];
    expect(alignments.map((n) => [n.label, n.issues])).toEqual([
      [road.name, undefined],
      ['Vetva', 2],
    ]);
    expect(sameTarget(alignments[1]?.target, { type: 'alignment', index: 1 })).toBe(true);
    expect(sameTarget(alignments[1]?.target, { type: 'alignment', index: 0 })).toBe(false);
  });
});
