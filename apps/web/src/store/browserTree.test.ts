import { syntheticAlignmentData } from '@bridge/alignment/testing';
import {
  type BearingLine,
  createEmptyProject,
  defaultAbutmentGeometry,
  levelFoundation,
  type Support,
} from '@bridge/model';
import { deckFromProfile, profileTemplate } from '@bridge/sections';
import { describe, expect, it } from 'vitest';
import { type BrowserInput, type BrowserNode, browserTree, sameTarget } from './browserTree.ts';

const road = syntheticAlignmentData(undefined, 1000);

function line(id: string, station: number, deck = 'nk'): BearingLine {
  return { id, name: id.slice(1), superstructure: deck, station, crossingAngle: '90' };
}

function support(id: string, kind: Support['kind'], bearingLine: string): Support {
  return {
    id,
    name: id.toUpperCase(),
    kind,
    bearingLine,
    offset: '0',
    geometry:
      kind === 'abutment'
        ? defaultAbutmentGeometry()
        : { type: 'wall', thickness: '1.2', length: '4' },
    footing: { length: '8', width: '4', thickness: '1.2' },
    connection: 'bearing',
    bearingHeight: '0.35',
    bearings: ['0'],
    foundation: levelFoundation('240 - 1.2'),
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
  // osi v opačnom poradí ako staničenie, os 3 bez podpery, os 9 bez NK, podpera p8 bez osi
  project.bearingLines.push(
    line('l4', 1155),
    line('l3', 1140),
    line('l2', 1116),
    line('l1', 1100),
    line('l9', 1130, 'chýba'),
  );
  project.supports.push(
    support('o2', 'abutment', 'l4'),
    support('p1', 'pier', 'l2'),
    support('o1', 'abutment', 'l1'),
    support('p9', 'pier', 'l9'),
    support('p8', 'pier', 'chýba'),
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

  it('nests the deck under its bridge axis and road, with bearing lines by station and their supports', () => {
    const tree = browserTree(input());
    const model = find(tree, 'model');
    // vetva bez prvkov mosta v modeli nie je, len v podkladoch
    expect(model?.children?.map((n) => n.label)).toEqual([road.name, 'Nepriradené']);
    const deck = find(tree, 'superstructures:nk');
    expect(deck?.detail).toBe('Komora · 16,00 + 23,00 + 16,00');
    expect(deck?.children?.map((n) => n.label)).toEqual([
      'Os uloženia 1',
      'Os uloženia 2',
      'Os uloženia 3',
      'Os uloženia 4',
    ]);
    expect(deck?.children?.map((n) => n.children?.map((s) => s.label))).toEqual([
      ['O1'],
      ['P1'],
      [],
      ['O2'],
    ]);
    expect(find(tree, 'bearingLines:l2')).toMatchObject({
      detail: 'km 1,116 000 · 90°',
      icon: 'bearingLine',
    });
    expect(find(tree, 'supports:p1')).toMatchObject({ issues: 1, icon: 'pier' });
    expect(find(tree, 'supports:o1')?.icon).toBe('abutment');
    expect(find(tree, 'bridgeAxes:ax')?.children?.[0]?.key).toBe('superstructures:nk');
    expect(find(tree, 'studyArea')?.detail).toBe('km 1,080 – km 1,180');
  });

  it('keeps elements with a missing parent under Unassigned', () => {
    const tree = browserTree(input());
    expect(find(tree, 'unassigned')?.children?.map((n) => n.key)).toEqual([
      'bearingLines:l9',
      'supports:p8',
    ]);
    expect(find(tree, 'bearingLines:l9')?.children?.map((n) => n.key)).toEqual(['supports:p9']);
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
