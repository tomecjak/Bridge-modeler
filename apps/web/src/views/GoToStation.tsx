import { parseStation } from '@bridge/alignment';
import { useState } from 'react';
import { sk } from '../i18n/sk.ts';

/** Pole „Prejsť na“ staničenie (km 1,234 / 1+234 / metre); Enter odošle zobrazované staničenie. */
export function GoToStation({ onStation }: { onStation: (station: number) => void }) {
  const [draft, setDraft] = useState('');
  const invalid = draft.trim() !== '' && parseStation(draft) === undefined;
  return (
    <label className="drawing-note" title={sk.viewport.goToTitle}>
      {sk.viewport.goTo}{' '}
      <input
        type="text"
        className="goto-input"
        value={draft}
        placeholder="km 0,000"
        aria-invalid={invalid}
        aria-label={sk.viewport.goToTitle}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setDraft('');
          if (e.key !== 'Enter') return;
          const station = parseStation(draft);
          if (station !== undefined) onStation(station);
        }}
      />
    </label>
  );
}
