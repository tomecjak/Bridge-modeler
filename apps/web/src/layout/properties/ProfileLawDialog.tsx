import type { ProfileLaw } from '@bridge/model';
import type { SectionContext } from '@bridge/sections';
import { sk } from '../../i18n/sk.ts';
import { surveyLineOptions } from '../../store/curves.ts';
import { projectStore, useProject } from '../../store/projectStore.ts';
import { ProfileLawEditor } from '../../views/ProfileLawEditor.tsx';
import { Dialog } from './Dialog.tsx';

/**
 * Priebeh parametra prierezu v NK (Fáza 3, 8a): predvolená hodnota profilu alebo vlastný priebeh po staničení
 * či okraj podľa krivky, s grafom výsledných hodnôt.
 */
export function ProfileLawDialog({
  deckId,
  parameter,
  ctx,
  onClose,
}: {
  deckId: string;
  parameter: string;
  ctx: SectionContext | undefined;
  onClose: () => void;
}) {
  const deck = useProject((s) => s.project.superstructures.find((d) => d.id === deckId));
  const profiles = useProject((s) => s.project.profiles);
  const axes = useProject((s) => s.project.bridgeAxes);
  const alignmentNames = useProject((s) => s.project.alignments.map((a) => a.name).join('\n'));
  const planLines = useProject((s) => s.project.planLines);
  const surveys = useProject((s) => s.project.surveys);
  if (!deck) return null;
  const def = profiles
    .find((p) => p.id === deck.profile)
    ?.parameters.find((p) => p.name === parameter);
  if (!def) return null;
  const ownRoad = axes.find((a) => a.id === deck.bridgeAxis)?.alignment;
  // okraj sa meria k inej osi než k vlastnej osi cesty
  const curves = {
    alignments: alignmentNames.split('\n').filter((n) => n !== '' && n !== ownRoad),
    planLines: planLines.map((l) => ({ id: l.id, name: l.name })),
    surveyLines: surveyLineOptions(surveys),
  };
  const law = deck.parameterLaws[parameter];
  const setLaw = (next: ProfileLaw | undefined) => {
    const laws = { ...deck.parameterLaws };
    if (next) laws[parameter] = next;
    else delete laws[parameter];
    projectStore.getState().dispatch({
      type: 'updateElement',
      collection: 'superstructures',
      id: deck.id,
      changes: { parameterLaws: laws },
    });
  };
  return (
    <Dialog title={sk.properties.lawTitle(deck.name, parameter)} onClose={onClose} wide>
      {def.description && <p className="hint">{def.description}</p>}
      {law ? (
        <button type="button" className="link" onClick={() => setLaw(undefined)}>
          {sk.elements.defaultRestore(def.default)}
        </button>
      ) : (
        <button
          type="button"
          className="link"
          onClick={() => setLaw({ kind: 'constant', value: def.default })}
        >
          {sk.elements.defaultOverride(def.default)}
        </button>
      )}
      {law && (
        <ProfileLawEditor
          law={law}
          range={{ from: deck.from, to: deck.to }}
          defaultValue={def.default}
          curves={curves}
          onChange={setLaw}
          preview={ctx && { ctx, sup: deck, parameter, unit: def.unit }}
        />
      )}
    </Dialog>
  );
}
