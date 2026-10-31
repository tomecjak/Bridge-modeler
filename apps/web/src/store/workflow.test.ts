import { emptyBrief } from '@bridge/model';
import { describe, expect, it } from 'vitest';
import { type WorkflowInput, workflowSteps } from './workflow.ts';

const empty: WorkflowInput = {
  brief: emptyBrief(),
  alignments: [],
  terrains: 0,
  hasStudyArea: false,
  decks: [],
  spans: [],
};

const status = (input: WorkflowInput) =>
  Object.fromEntries(workflowSteps(input).map((s) => [s.id, `${s.status}:${s.hint}`]));

describe('workflowSteps', () => {
  it('starts an empty project with everything to do', () => {
    expect(status(empty)).toEqual({
      brief: 'todo:briefMissing',
      sources: 'todo:noAlignment',
      studyArea: 'todo:needsAlignment',
      deck: 'todo:noDeck',
      supports: 'todo:noSupports',
      outputs: 'none:outputs',
    });
  });

  it('needs the road category only for bridges carrying a road', () => {
    const brief = {
      ...emptyBrief(),
      construction: { number: '', name: 'I/68 Sabinov' },
      object: { number: '212-00', name: '' },
    };
    expect(status({ ...empty, brief }).brief).toBe('todo:briefMissing');
    expect(status({ ...empty, brief: { ...brief, roadCategory: 'C 9,5/70' } }).brief).toBe(
      'done:briefDone',
    );
    expect(status({ ...empty, brief: { ...brief, bridgeType: 'footbridge' } }).brief).toBe(
      'done:briefDone',
    );
  });

  it('accepts only an alignment with a vertical profile and reports its errors', () => {
    expect(status({ ...empty, alignments: [{ hasProfile: false, errors: 0 }] }).sources).toBe(
      'todo:noAlignment',
    );
    const road = { ...empty, alignments: [{ hasProfile: true, errors: 0 }] };
    expect(status(road).sources).toBe('done:noTerrain');
    expect(status({ ...road, terrains: 1 }).sources).toBe('done:sourcesDone');
    expect(status({ ...road, alignments: [{ hasProfile: true, errors: 2 }] }).sources).toBe(
      'warning:alignmentErrors',
    );
    expect(status(road).studyArea).toBe('todo:noStudyArea');
    expect(status({ ...road, hasStudyArea: true }).studyArea).toBe('done:studyAreaDone');
  });

  it('follows the deck and its spans', () => {
    const road = { ...empty, alignments: [{ hasProfile: true, errors: 0 }] };
    const deck = { ...road, decks: [{ errors: 0 }] };
    expect(status(deck)).toMatchObject({
      studyArea: 'done:studyAreaDone',
      deck: 'done:deckDone',
      supports: 'todo:noSupports',
    });
    expect(status({ ...deck, decks: [{ errors: 1 }] }).deck).toBe('warning:deckErrors');
    const spans = (s: { supports: number; errors: number; warnings: number }) =>
      status({ ...deck, spans: [s] }).supports;
    expect(spans({ supports: 1, errors: 1, warnings: 0 })).toBe('todo:noSupports');
    expect(spans({ supports: 4, errors: 1, warnings: 0 })).toBe('warning:spanErrors');
    expect(spans({ supports: 4, errors: 0, warnings: 1 })).toBe('warning:spanWarnings');
    expect(spans({ supports: 4, errors: 0, warnings: 0 })).toBe('done:supportsDone');
    // druhá NK bez podpier
    expect(
      status({
        ...deck,
        decks: [{ errors: 0 }, { errors: 0 }],
        spans: [{ supports: 4, errors: 0, warnings: 0 }],
      }).supports,
    ).toBe('todo:noSupports');
  });
});
