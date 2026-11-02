import type { StationFunction } from '@bridge/model';
import { sk } from '../../i18n/sk.ts';
import { projectStore, useProject } from '../../store/projectStore.ts';
import { StationFunctionEditor } from '../../views/StationFunctionEditor.tsx';
import { Dialog } from './Dialog.tsx';

/** Priebeh parametra prierezu rímsy (ADR 0023): predvolená hodnota prierezu alebo staničná funkcia v rozsahu NK. */
export function EdgeBeamLawDialog({
  beamId,
  parameter,
  onClose,
}: {
  beamId: string;
  parameter: string;
  onClose: () => void;
}) {
  const beam = useProject((s) => s.project.edgeBeams.find((b) => b.id === beamId));
  const deck = useProject((s) =>
    s.project.superstructures.find((d) => d.id === beam?.superstructure),
  );
  const profiles = useProject((s) => s.project.profiles);
  if (!beam) return null;
  const def = profiles
    .find((p) => p.id === beam.profile)
    ?.parameters.find((p) => p.name === parameter);
  if (!def) return null;
  const law = beam.parameterLaws[parameter];
  const setLaw = (next: StationFunction | undefined) => {
    const laws = { ...beam.parameterLaws };
    if (next) laws[parameter] = next;
    else delete laws[parameter];
    projectStore.getState().dispatch({
      type: 'updateElement',
      collection: 'edgeBeams',
      id: beam.id,
      changes: { parameterLaws: laws },
    });
  };
  return (
    <Dialog title={sk.edgeBeams.lawTitle(beam.name, parameter)} onClose={onClose} wide>
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
        <StationFunctionEditor
          law={law}
          range={{ from: deck?.from ?? 0, to: deck?.to ?? 0 }}
          onChange={setLaw}
        />
      )}
    </Dialog>
  );
}
