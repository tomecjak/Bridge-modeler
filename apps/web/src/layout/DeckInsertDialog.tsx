import { copyForProject } from '@bridge/model';
import { deckFromProfile } from '@bridge/sections';
import { useState } from 'react';
import { parseNumber } from '../format/number.ts';
import { sk } from '../i18n/sk.ts';
import { Icon } from '../icons/Icon.tsx';
import { isDeckProfile } from '../store/edgeBeams.ts';
import { newId } from '../store/parameters.ts';
import { projectStore, useProject } from '../store/projectStore.ts';
import { Field } from '../views/Field.tsx';
import { ProfileThumbnail } from '../views/ProfileThumbnail.tsx';
import { StationField } from '../views/StationFunctionEditor.tsx';
import { DialogFrame } from './DialogFrame.tsx';
import { type SourceKey, useProfileSources } from './useProfileSources.ts';

interface Props {
  /** os cesty, na ktorú sa NK vloží */
  alignment: string;
  /** predvolený rozsah (oblasť mosta, inak štvrtina nivelety), zobrazované staničenie */
  range: { from: number; to: number };
  onClose: () => void;
  /** vložená NK (výber a prechod na priečny rez v 2D) */
  onInserted: (deckId: string, name: string, range: { from: number; to: number }) => void;
  /** príklad dvojice NK z rezu E–E (Fáza 3) */
  onExample: () => void;
}

/**
 * Vloženie NK výberom typológie (Fáza 10a): prierez zo šablón, firemnej knižnice alebo projektu, rozsah z oblasti
 * mosta a vlastná os mosta. Os, kópia prierezu a NK sa pridajú jedným príkazom (jeden krok späť).
 */
export function DeckInsertDialog({ alignment, range, onClose, onInserted, onExample }: Props) {
  const t = sk.deckInsert;
  const project = useProject((s) => s.project);
  const profileSources = useProfileSources();
  const { sources, cloudError } = profileSources;
  // priečniky (ADR 0018) a rímsy (ADR 0023) nie sú prierezy NK
  const entries = Object.fromEntries(
    Object.entries(profileSources.entries).map(([key, list]) => [key, list.filter(isDeckProfile)]),
  ) as typeof profileSources.entries;
  const [choice, setChoice] = useState<{ source: SourceKey; id: string }>();
  const [name, setName] = useState(() => {
    const used = new Set(project.superstructures.map((s) => s.name));
    let n = 1;
    while (used.has(t.defaultName(n))) n++;
    return t.defaultName(n);
  });
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [offset, setOffset] = useState('0');
  const offsetValue = parseNumber(offset);
  const entry = choice && entries[choice.source].find((e) => e.id === choice.id);
  const valid =
    entry !== undefined && name.trim() !== '' && to - from > 0 && offsetValue !== undefined;

  function insert() {
    if (!entry || !choice || offsetValue === undefined) return;
    // prierez projektu sa použije priamo, ostatné sa skopírujú do projektu
    const profile =
      choice.source === 'project'
        ? undefined
        : copyForProject(entry, project.profiles, newId('prof'));
    const deckName = name.trim();
    const axisName = project.bridgeAxes.some((a) => a.name === t.axisName(deckName))
      ? `${t.axisName(deckName)} (${project.bridgeAxes.length + 1})`
      : t.axisName(deckName);
    const { bridgeAxis, superstructure } = deckFromProfile(
      alignment,
      from,
      to,
      profile?.id ?? entry.id,
      { deck: newId('nk'), axis: newId('axis') },
      { deck: deckName, axis: axisName },
      offsetValue,
    );
    projectStore.getState().dispatch({
      type: 'addElements',
      bridgeAxes: [bridgeAxis],
      profiles: profile ? [profile] : [],
      superstructures: [superstructure],
    });
    onInserted(superstructure.id, deckName, { from: superstructure.from, to: superstructure.to });
  }

  return (
    <DialogFrame
      title={t.title}
      subtitle={t.hint}
      icon="deck"
      width={780}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="button" onClick={onClose}>
            {t.cancel}
          </button>
          <button type="button" className="button primary" disabled={!valid} onClick={insert}>
            {t.confirm}
          </button>
        </>
      }
    >
      {cloudError && <p className="issue issue-error">{cloudError}</p>}
      {sources
        .filter((s) => entries[s.key].length > 0)
        .map((s) => (
          <section key={s.key} className="dialog-section" aria-label={s.title}>
            <h3 className="dialog-section-title">{s.title}</h3>
            <div className="typology-grid">
              {entries[s.key].map((e) => {
                const checked = choice?.source === s.key && choice.id === e.id;
                return (
                  <label key={e.id} className="typology-card" data-checked={checked || undefined}>
                    <input
                      type="radio"
                      className="visually-hidden"
                      name={`deck-profile-${s.key}`}
                      aria-label={t.select(e.name)}
                      checked={checked}
                      onChange={() => setChoice({ source: s.key, id: e.id })}
                    />
                    <ProfileThumbnail profile={e.profile} />
                    <span className="typology-name">{e.name}</span>
                  </label>
                );
              })}
            </div>
          </section>
        ))}
      <button type="button" className="dialog-row-button" onClick={onExample}>
        <Icon name="twinDeck" size={18} />
        {t.example}
      </button>
      <div className="dialog-grid dialog-grid-2">
        <Field label={t.name}>
          <input
            type="text"
            value={name}
            aria-label={t.name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label={t.offset}>
          <input
            type="text"
            value={offset}
            aria-label={t.offset}
            aria-invalid={offsetValue === undefined}
            onChange={(e) => setOffset(e.target.value)}
          />
        </Field>
        <Field label={t.from}>
          <StationField ariaLabel={t.from} value={from} onCommit={setFrom} />
        </Field>
        <Field label={t.to}>
          <StationField ariaLabel={t.to} value={to} onCommit={setTo} />
        </Field>
      </div>
    </DialogFrame>
  );
}
