import { copyForProject, type EdgeBeam } from '@bridge/model';
import { useState } from 'react';
import { sk } from '../i18n/sk.ts';
import { freeSides, isEdgeBeamProfile, newEdgeBeams } from '../store/edgeBeams.ts';
import { newId } from '../store/parameters.ts';
import { projectStore, useProject } from '../store/projectStore.ts';
import { Field } from '../views/Field.tsx';
import { ProfileThumbnail } from '../views/ProfileThumbnail.tsx';
import { type SourceKey, useProfileSources } from './useProfileSources.ts';

interface Props {
  /** predvolená NK (vybraná), inak prvá */
  deckId: string | undefined;
  onClose: () => void;
  /** vložené rímsy (výber prvej) */
  onInserted: (beams: readonly EdgeBeam[], deckName: string) => void;
}

/**
 * Vloženie ríms na okraje NK (ADR 0023): prierez zo šablón, firemnej knižnice alebo projektu, strany bez rímsy.
 * Kópia prierezu a rímsy sa pridajú jedným príkazom (jeden krok späť).
 */
export function EdgeBeamInsertDialog({ deckId, onClose, onInserted }: Props) {
  const t = sk.edgeBeams.insert;
  const project = useProject((s) => s.project);
  const profileSources = useProfileSources();
  const { sources, cloudError } = profileSources;
  const entries = Object.fromEntries(
    Object.entries(profileSources.entries).map(([key, list]) => [
      key,
      list.filter((e) => isEdgeBeamProfile(e)),
    ]),
  ) as typeof profileSources.entries;
  const [deck, setDeck] = useState(deckId ?? project.superstructures[0]?.id ?? '');
  const free = freeSides(project.edgeBeams, deck);
  const [sides, setSides] = useState<Record<EdgeBeam['side'], boolean>>({
    left: true,
    right: true,
  });
  const [choice, setChoice] = useState<{ source: SourceKey; id: string }>();
  // bez výberu prvá ponúknutá položka (šablóna „Rímsa“)
  const firstSource = sources.find((s) => entries[s.key].length > 0);
  const chosen =
    choice ??
    (firstSource && { source: firstSource.key, id: entries[firstSource.key][0]?.id ?? '' });
  const entry = chosen && entries[chosen.source].find((e) => e.id === chosen.id);
  const selectedSides = free.filter((side) => sides[side]);
  const deckName = project.superstructures.find((d) => d.id === deck)?.name ?? '';
  const valid = entry !== undefined && deckName !== '' && selectedSides.length > 0;

  function insert() {
    if (!entry || !chosen) return;
    const profile =
      chosen.source === 'project'
        ? undefined
        : copyForProject(entry, project.profiles, newId('prof'));
    const beams = newEdgeBeams(deck, selectedSides, profile?.id ?? entry.id, newId);
    projectStore.getState().dispatch({
      type: 'addElements',
      profiles: profile ? [profile] : [],
      edgeBeams: beams,
    });
    onInserted(beams, deckName);
  }

  return (
    <div className="modal-backdrop">
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edge-beam-insert-title"
      >
        <h2 id="edge-beam-insert-title" className="panel-title">
          {t.title}
        </h2>
        <p className="hint">{t.hint}</p>
        {cloudError && <p className="issue issue-error">{cloudError}</p>}
        <div className="library-sources">
          {sources
            .filter((s) => entries[s.key].length > 0)
            .map((s) => (
              <fieldset key={s.key} className="modal-group">
                <legend>{s.title}</legend>
                <ul className="library-list">
                  {entries[s.key].map((e) => {
                    const checked = chosen?.source === s.key && chosen.id === e.id;
                    return (
                      <li key={e.id} className="library-item" data-selected={checked || undefined}>
                        <label className="checkbox">
                          <input
                            type="radio"
                            name="edge-beam-profile"
                            aria-label={t.select(e.name)}
                            checked={checked}
                            onChange={() => setChoice({ source: s.key, id: e.id })}
                          />
                        </label>
                        <ProfileThumbnail profile={e.profile} />
                        <span className="library-name">{e.name}</span>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            ))}
        </div>
        <div className="deck-insert-fields">
          <Field label={t.deck}>
            <select value={deck} aria-label={t.deck} onChange={(e) => setDeck(e.target.value)}>
              {project.superstructures.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <fieldset className="modal-group">
            <legend>{t.sides}</legend>
            {(['left', 'right'] as const).map((side) => {
              const taken = !free.includes(side);
              return (
                <label key={side} className="checkbox" title={taken ? t.exists : undefined}>
                  <input
                    type="checkbox"
                    checked={!taken && sides[side]}
                    disabled={taken}
                    onChange={(e) => setSides((x) => ({ ...x, [side]: e.target.checked }))}
                  />
                  {sk.edgeBeams.name(side)}
                </label>
              );
            })}
          </fieldset>
        </div>
        <div className="toolbar modal-actions">
          <span className="toolbar-separator" />
          <button type="button" className="button" onClick={onClose}>
            {t.cancel}
          </button>
          <button type="button" className="button primary" disabled={!valid} onClick={insert}>
            {t.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
