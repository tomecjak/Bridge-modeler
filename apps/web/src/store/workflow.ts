import type { Brief } from '@bridge/model';

/**
 * Kroky postupu návrhu mosta (Fáza 10a). Prekážky, kontroly a varianty pribudnú vo Fázach 10f, 10g a 10h.
 */
export type StepId = 'brief' | 'sources' | 'studyArea' | 'deck' | 'supports' | 'outputs';

/** `none` = krok nemá stav (napr. výstupy sú vždy k dispozícii). */
export type StepStatus = 'done' | 'warning' | 'todo' | 'none';

export type StepHint =
  | 'briefMissing'
  | 'briefDone'
  | 'noAlignment'
  | 'alignmentErrors'
  | 'noTerrain'
  | 'sourcesDone'
  | 'needsAlignment'
  | 'noStudyArea'
  | 'studyAreaDone'
  | 'noDeck'
  | 'deckErrors'
  | 'deckDone'
  | 'noSupports'
  | 'spanErrors'
  | 'spanWarnings'
  | 'supportsDone'
  | 'outputs';

export interface WorkflowStep {
  id: StepId;
  status: StepStatus;
  hint: StepHint;
}

export interface WorkflowInput {
  brief: Brief;
  /** osi cesty: má niveletu, počet chýb (parser + výpočet) */
  alignments: readonly { hasProfile: boolean; errors: number }[];
  terrains: number;
  hasStudyArea: boolean;
  /** NK s počtom chýb prierezu */
  decks: readonly { errors: number }[];
  /** polia každej NK: počet podpier, chyby a upozornenia (podpery aj polia) */
  spans: readonly { supports: number; errors: number; warnings: number }[];
}

/** Druhy mostov, ktoré prevádzajú cestu → potrebujú kategóriu cesty v zadaní. */
const needsCategory = (brief: Brief) => brief.bridgeType === null || brief.bridgeType === 'road';

/** Stav krokov postupu z projektu a vyhodnotených výsledkov (čistá funkcia). */
export function workflowSteps(input: WorkflowInput): WorkflowStep[] {
  const { brief } = input;
  const briefDone =
    brief.construction.name.trim() !== '' &&
    (brief.object.number.trim() !== '' || brief.object.name.trim() !== '') &&
    (!needsCategory(brief) || brief.roadCategory.trim() !== '');

  const usable = input.alignments.filter((a) => a.hasProfile);
  const sources: WorkflowStep =
    usable.length === 0
      ? { id: 'sources', status: 'todo', hint: 'noAlignment' }
      : input.alignments.some((a) => a.errors > 0)
        ? { id: 'sources', status: 'warning', hint: 'alignmentErrors' }
        : { id: 'sources', status: 'done', hint: input.terrains > 0 ? 'sourcesDone' : 'noTerrain' };

  const hasDeck = input.decks.length > 0;
  const studyArea: WorkflowStep =
    input.hasStudyArea || hasDeck
      ? { id: 'studyArea', status: 'done', hint: 'studyAreaDone' }
      : usable.length === 0
        ? { id: 'studyArea', status: 'todo', hint: 'needsAlignment' }
        : { id: 'studyArea', status: 'todo', hint: 'noStudyArea' };

  const deck: WorkflowStep = !hasDeck
    ? { id: 'deck', status: 'todo', hint: 'noDeck' }
    : input.decks.some((d) => d.errors > 0)
      ? { id: 'deck', status: 'warning', hint: 'deckErrors' }
      : { id: 'deck', status: 'done', hint: 'deckDone' };

  const supports: WorkflowStep =
    !hasDeck || input.spans.length < input.decks.length || input.spans.some((s) => s.supports < 2)
      ? { id: 'supports', status: 'todo', hint: 'noSupports' }
      : input.spans.some((s) => s.errors > 0)
        ? { id: 'supports', status: 'warning', hint: 'spanErrors' }
        : input.spans.some((s) => s.warnings > 0)
          ? { id: 'supports', status: 'warning', hint: 'spanWarnings' }
          : { id: 'supports', status: 'done', hint: 'supportsDone' };

  return [
    {
      id: 'brief',
      status: briefDone ? 'done' : 'todo',
      hint: briefDone ? 'briefDone' : 'briefMissing',
    },
    sources,
    studyArea,
    deck,
    supports,
    { id: 'outputs', status: 'none', hint: 'outputs' },
  ];
}
