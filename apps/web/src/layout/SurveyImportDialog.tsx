import {
  type DxfDrawing,
  type ExtractedSurvey,
  extractSurvey,
  SURVEY_TOLERANCES,
  type SurveyLayers,
  suggestSurveyLayers,
  summarizeLayers,
} from '@bridge/survey';
import { type CorridorOptions, DEFAULT_CORRIDOR } from '@bridge/terrain';
import { useMemo, useState } from 'react';
import { sk } from '../i18n/sk.ts';
import { formatSurveyIssue } from '../i18n/surveyIssues.ts';
import type { SurveyFile } from '../import/importSurvey.ts';
import { DialogFrame } from './DialogFrame.tsx';

interface Props {
  file: SurveyFile;
  /** os cesty, okolo ktorej sa dá meračka orezať; bez nej sa importuje celá */
  alignmentName: string | undefined;
  onConfirm: (input: {
    drawing: DxfDrawing;
    layers: SurveyLayers;
    name: string;
    clip: CorridorOptions | undefined;
    extracted: ExtractedSurvey;
  }) => void;
  onCancel: () => void;
}

const ROLES = ['points', 'heights', 'numbers', 'codes', 'lines'] as const;
type Role = (typeof ROLES)[number];
/** najviac hlásení v náhľade; ostatné sa len spočítajú */
const PREVIEW_ISSUES = 6;

/** Dialóg importu meračky z DXF (ADR 0021): hladiny bodov, výšok, čísel, kódov a čiar, orezanie a názov. */
export function SurveyImportDialog({ file, alignmentName, onConfirm, onCancel }: Props) {
  const t = sk.survey;
  const drawing = file.drawing;
  const summary = useMemo(
    () =>
      drawing
        ? summarizeLayers(drawing).filter((l) => l.points + l.texts + l.lines + l.inserts > 0)
        : [],
    [drawing],
  );
  const [layers, setLayers] = useState<SurveyLayers>(() =>
    drawing
      ? suggestSurveyLayers(drawing, SURVEY_TOLERANCES)
      : { points: [], heights: [], numbers: [], codes: [], lines: [] },
  );
  const [name, setName] = useState(() => file.fileName.replace(/\.dxf$/i, ''));
  const [clipOn, setClipOn] = useState(alignmentName !== undefined);
  const [halfWidth, setHalfWidth] = useState(String(DEFAULT_CORRIDOR.halfWidth));
  const [margin, setMargin] = useState(String(DEFAULT_CORRIDOR.margin));
  const extracted = useMemo(
    () => (drawing ? extractSurvey(drawing, layers, SURVEY_TOLERANCES) : undefined),
    [drawing, layers],
  );
  const clip = { halfWidth: Number(halfWidth), margin: Number(margin) };
  const clipValid = !clipOn || (clip.halfWidth > 0 && clip.margin >= 0);
  const valid =
    drawing !== undefined &&
    extracted !== undefined &&
    name.trim() !== '' &&
    clipValid &&
    extracted.points.length + extracted.lines.length > 0;
  const toggle = (role: Role, layer: string, on: boolean) =>
    setLayers((current) => ({
      ...current,
      [role]: on ? [...current[role], layer] : current[role].filter((l) => l !== layer),
    }));
  const withHeight = extracted?.points.filter((p) => p.z !== undefined).length ?? 0;

  return (
    <DialogFrame
      title={t.dialogTitle}
      icon="survey"
      width={860}
      onClose={onCancel}
      actions={
        <>
          <button type="button" className="button" onClick={onCancel}>
            {t.cancel}
          </button>
          <button
            type="button"
            className="button primary"
            disabled={!valid}
            onClick={() =>
              drawing &&
              extracted &&
              onConfirm({
                drawing,
                layers,
                name: name.trim(),
                clip: clipOn && alignmentName !== undefined ? clip : undefined,
                extracted,
              })
            }
          >
            {t.confirm}
          </button>
        </>
      }
    >
      <p className="hint">
        {t.file}: {file.fileName}
        {drawing &&
          ` · ${t.fileInfo(drawing.version ?? '?', drawing.encoding ?? '?', drawing.unitScale)}`}
      </p>
      {file.issues.length > 0 && (
        <ul className="issues">
          {file.issues.map((i) => (
            <li
              key={formatSurveyIssue(i)}
              className={i.severity === 'error' ? 'issue issue-error' : 'issue issue-warning'}
            >
              {formatSurveyIssue(i)}
            </li>
          ))}
        </ul>
      )}
      {drawing && (
        <fieldset className="modal-group">
          <legend>{t.layers}</legend>
          <p className="hint">{t.layersHint}</p>
          <div className="survey-layers">
            <table className="mini-table">
              <thead>
                <tr>
                  <th>{t.layer}</th>
                  <th>{t.contents}</th>
                  {ROLES.map((r) => (
                    <th key={r} className="survey-role">
                      {t.roles[r]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary.map((l) => (
                  <tr key={l.name}>
                    <td>
                      {l.name}
                      {l.hidden && <span className="hint"> {t.hiddenLayer}</span>}
                    </td>
                    <td className="hint">{t.counts(l.points, l.texts, l.lines, l.inserts)}</td>
                    {ROLES.map((r) => (
                      <td key={r} className="survey-role">
                        <input
                          type="checkbox"
                          aria-label={`${t.roles[r]}: ${l.name}`}
                          checked={layers[r].includes(l.name)}
                          onChange={(e) => toggle(r, l.name, e.target.checked)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {extracted && (
            <>
              <p className="survey-preview">
                {t.preview(extracted.points.length, withHeight, extracted.lines.length)}
              </p>
              {extracted.issues.length > 0 && (
                <ul className="issues">
                  {extracted.issues.slice(0, PREVIEW_ISSUES).map((i, k) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: hlásenia sú určené poradím
                    <li key={k} className="issue issue-warning">
                      {formatSurveyIssue(i)}
                    </li>
                  ))}
                  {extracted.issues.length > PREVIEW_ISSUES && (
                    <li className="issue hint">
                      {t.moreIssues(extracted.issues.length - PREVIEW_ISSUES)}
                    </li>
                  )}
                </ul>
              )}
            </>
          )}
        </fieldset>
      )}
      {drawing && (
        <fieldset className="modal-group">
          <legend>{t.clip}</legend>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={clipOn && alignmentName !== undefined}
              disabled={alignmentName === undefined}
              onChange={(e) => setClipOn(e.target.checked)}
            />
            {alignmentName ? t.clipAround(alignmentName) : t.clipNoAlignment}
          </label>
          {clipOn && alignmentName !== undefined && (
            <div className="segment-grid">
              <label className="field">
                <span>{sk.terrain.halfWidth}</span>
                <input
                  type="number"
                  min={1}
                  value={halfWidth}
                  onChange={(e) => setHalfWidth(e.target.value)}
                />
              </label>
              <label className="field">
                <span>{sk.terrain.margin}</span>
                <input
                  type="number"
                  min={0}
                  value={margin}
                  onChange={(e) => setMargin(e.target.value)}
                />
              </label>
            </div>
          )}
          <p className="hint">{t.clipHint}</p>
        </fieldset>
      )}
      {drawing && (
        <label className="field">
          <span>{t.name}</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      )}
    </DialogFrame>
  );
}
