import { type CorridorOptions, DEFAULT_CORRIDOR } from '@bridge/terrain';
import { useState } from 'react';
import { sk } from '../i18n/sk.ts';
import { formatTerrainIssue } from '../i18n/terrainIssues.ts';
import type { TerrainCandidate, TerrainFile } from '../import/importTerrain.ts';
import { DialogFrame } from './DialogFrame.tsx';

interface Props {
  file: TerrainFile;
  /** os cesty, okolo ktorej sa koridor vytvorí; bez nej sa import nedá spustiť */
  alignmentName: string | undefined;
  busy: boolean;
  onConfirm: (selected: TerrainCandidate[], options: CorridorOptions) => void;
  onCancel: () => void;
}

/** Výber povrchov zo súboru a koridoru, na ktorý sa terén oreže (ADR 0011). */
export function TerrainImportDialog({ file, alignmentName, busy, onConfirm, onCancel }: Props) {
  const [selected, setSelected] = useState(() => new Set(file.candidates.map((c) => c.name)));
  const [halfWidth, setHalfWidth] = useState(String(DEFAULT_CORRIDOR.halfWidth));
  const [margin, setMargin] = useState(String(DEFAULT_CORRIDOR.margin));
  const options = { halfWidth: Number(halfWidth), margin: Number(margin) };
  const valid =
    options.halfWidth > 0 &&
    options.margin >= 0 &&
    selected.size > 0 &&
    alignmentName !== undefined;
  const t = sk.terrain;

  return (
    <DialogFrame
      title={t.dialogTitle}
      icon="terrainFile"
      width={620}
      onClose={onCancel}
      actions={
        <>
          <button type="button" className="button" onClick={onCancel}>
            {t.cancel}
          </button>
          <button
            type="button"
            className="button primary"
            disabled={!valid || busy}
            onClick={() =>
              onConfirm(
                file.candidates.filter((c) => selected.has(c.name)),
                options,
              )
            }
          >
            {busy ? t.importing : t.confirm}
          </button>
        </>
      }
    >
      <p className="hint">
        {t.file}: {file.fileName}
      </p>
      {file.issues.length > 0 && (
        <ul className="issues">
          {file.issues.map((i) => (
            <li key={formatTerrainIssue(i)} className="issue issue-error">
              {formatTerrainIssue(i)}
            </li>
          ))}
        </ul>
      )}
      {file.candidates.length > 0 && (
        <fieldset className="modal-group">
          <legend>{file.candidates[0]?.kind === 'geotiff' ? t.raster : t.surfaces}</legend>
          {file.candidates.map((c) => (
            <label key={c.name} className="checkbox">
              <input
                type="checkbox"
                checked={selected.has(c.name)}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(c.name);
                  else next.delete(c.name);
                  setSelected(next);
                }}
              />
              {c.name}
              {c.kind === 'landxml' && (
                <span className="hint">
                  {' '}
                  · {t.points(c.surface.points.length / 3)} ·{' '}
                  {t.triangles(c.surface.triangles.length / 3)}
                </span>
              )}
            </label>
          ))}
        </fieldset>
      )}
      <fieldset className="modal-group">
        <legend>{t.corridor}</legend>
        <p className="hint">{t.corridorHint}</p>
        <p className="hint">
          {t.alignment}: {alignmentName ?? '—'}
        </p>
        {alignmentName === undefined && <p className="notice">{t.needsAlignment}</p>}
        <div className="segment-grid">
          <label className="field">
            <span>{t.halfWidth}</span>
            <input
              type="number"
              min={1}
              value={halfWidth}
              onChange={(e) => setHalfWidth(e.target.value)}
            />
          </label>
          <label className="field">
            <span>{t.margin}</span>
            <input
              type="number"
              min={0}
              value={margin}
              onChange={(e) => setMargin(e.target.value)}
            />
          </label>
        </div>
      </fieldset>
    </DialogFrame>
  );
}
