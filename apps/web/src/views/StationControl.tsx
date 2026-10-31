import { formatStation, parseStation } from '@bridge/alignment';
import { useEffect, useState } from 'react';
import { sk } from '../i18n/sk.ts';

interface Props {
  /** zobrazované staničenie [m] */
  station: number;
  range: { from: number; to: number } | undefined;
  onStation: (station: number) => void;
  /** bez vlastného popisu (popis má riadok mriežky vlastností) */
  compact?: boolean;
}

/** Pole so staničením (km 1,234 567) a posuvník v rozsahu NK — prierez aj rez v 3D. */
export function StationControl({ station, range, onStation, compact = false }: Props) {
  const [draft, setDraft] = useState(formatStation(station));
  useEffect(() => setDraft(formatStation(station)), [station]);
  return (
    <>
      <label className="station-input">
        {!compact && sk.section.station}
        <input
          type="text"
          aria-label={compact ? sk.section.station : undefined}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const v = parseStation(draft);
            if (v === undefined) setDraft(formatStation(station));
            else onStation(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
      </label>
      {range && (
        <input
          type="range"
          className="station-slider"
          aria-label={sk.section.station}
          min={range.from}
          max={range.to}
          step={0.5}
          value={station}
          onChange={(e) => onStation(Number(e.target.value))}
        />
      )}
    </>
  );
}
