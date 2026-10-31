import {
  copyForProject,
  entryFromProfile,
  type LibraryEntry,
  type ModelIssue,
  memoryLibrary,
  type ProfileLibrary,
  parseLibrary,
  serializeLibrary,
} from '@bridge/model';
import { useState } from 'react';
import { formatModelIssue } from '../i18n/modelIssues.ts';
import { sk } from '../i18n/sk.ts';
import { downloadText } from '../persistence/fileIO.ts';
import { drawingFileName } from '../persistence/fileName.ts';
import { newId } from '../store/parameters.ts';
import { projectStore, useProject } from '../store/projectStore.ts';
import { ProfileThumbnail } from '../views/ProfileThumbnail.tsx';
import { type CloudLibrary, type SourceKey, useProfileSources } from './useProfileSources.ts';

interface Props {
  onClose: () => void;
  /** prierez vložený do projektu (výber v strome) */
  onInserted: (id: string, name: string) => void;
  onMessage: (text: string) => void;
}

/** Dátum a čas zmeny položky v slovenskom formáte. */
const formatDate = (iso: string | undefined) =>
  iso ? new Date(iso).toLocaleString('sk-SK', { dateStyle: 'short', timeStyle: 'short' }) : '';

/**
 * Knižnica prierezov (Fáza 8b, 9): zabudované šablóny, firemná knižnica (Worker + D1, ak beží), prierezy projektu
 * a importovaný súbor. Vloženie do projektu, uloženie prierezu projektu do firemnej knižnice, export vybraných
 * do súboru `.json` a import. Zdroje sú za rozhraním `ProfileLibrary`.
 */
export function ProfileLibraryDialog({ onClose, onInserted, onMessage }: Props) {
  const t = sk.library;
  const projectName = useProject((s) => s.project.name);
  const [file, setFile] = useState<{ name: string; library: ProfileLibrary }>();
  const [issues, setIssues] = useState<ModelIssue[]>([]);
  const { entries, sources, cloud, cloudError, setCloudError, refresh } = useProfileSources(file);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  /** Zmena vo firemnej knižnici; pri konflikte verzie hláška a znova načítaný zoznam. */
  async function cloudChange(run: (lib: CloudLibrary) => Promise<void>, done: string) {
    if (!cloud) return;
    try {
      await run(cloud.library);
      setCloudError(undefined);
      onMessage(done);
    } catch (e) {
      setCloudError(e instanceof Error ? e.message : String(e));
    }
    refresh();
  }

  const key = (source: SourceKey, id: string) => `${source}:${id}`;
  const chosen = sources.flatMap((s) =>
    entries[s.key].filter((e) => selected.has(key(s.key, e.id))),
  );

  function insert(entry: LibraryEntry) {
    const current = projectStore.getState().project.profiles;
    const copy = copyForProject(entry, current, newId('prof'));
    projectStore.getState().dispatch({ type: 'addElements', profiles: [copy] });
    onInserted(copy.id, copy.name);
  }

  async function importFile(f: File) {
    const r = parseLibrary(await f.text());
    if (!r.ok) {
      setIssues(r.issues);
      return;
    }
    setIssues([]);
    setFile({ name: f.name, library: memoryLibrary(f.name, r.entries, { readOnly: true }) });
  }

  function exportSelected() {
    if (chosen.length === 0) return;
    // položky z rôznych zdrojov môžu mať rovnaké id → v súbore dostanú jedinečné
    const used = new Set<string>();
    const unique = chosen.map((e) => {
      let id = e.id;
      for (let n = 2; used.has(id); n++) id = `${e.id}-${n}`;
      used.add(id);
      return { ...e, id };
    });
    const name = drawingFileName(projectName, t.fileName, 'json');
    downloadText(serializeLibrary(unique), name, 'application/json');
    onMessage(sk.export.done(name));
  }

  return (
    <div className="modal-backdrop">
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-dialog-title"
      >
        <h2 id="library-dialog-title" className="panel-title">
          {t.title}
        </h2>
        <p className="hint">{t.hint}</p>
        {cloudError && <p className="issue issue-error">{cloudError}</p>}
        {issues.length > 0 && (
          <ul className="issues">
            {issues.map((i) => (
              <li key={formatModelIssue(i)} className="issue issue-error">
                {t.importFailed}: {formatModelIssue(i)}
              </li>
            ))}
          </ul>
        )}
        <div className="library-sources">
          {sources.map((s) => (
            <fieldset key={s.key} className="modal-group">
              <legend>{s.title}</legend>
              {entries[s.key].length === 0 && <p className="panel-empty">{t.empty}</p>}
              <ul className="library-list">
                {entries[s.key].map((e) => (
                  <li key={e.id} className="library-item">
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        aria-label={t.select(e.name)}
                        checked={selected.has(key(s.key, e.id))}
                        onChange={(ev) => {
                          const next = new Set(selected);
                          if (ev.target.checked) next.add(key(s.key, e.id));
                          else next.delete(key(s.key, e.id));
                          setSelected(next);
                        }}
                      />
                    </label>
                    <ProfileThumbnail profile={e.profile} />
                    <span className="library-name">
                      {e.name}
                      {e.typology && <span className="hint"> · {e.typology}</span>}
                      {s.key === 'cloud' && cloud?.library.info(e.id) && (
                        <span className="hint">
                          {' '}
                          ·{' '}
                          {t.changedBy(
                            cloud.library.info(e.id)?.updatedBy ?? '',
                            formatDate(cloud.library.info(e.id)?.updatedAt),
                          )}
                        </span>
                      )}
                    </span>
                    {s.key !== 'project' && (
                      <button type="button" className="button" onClick={() => insert(e)}>
                        {t.insert}
                      </button>
                    )}
                    {s.key === 'project' && cloud && (
                      <button
                        type="button"
                        className="button"
                        onClick={() =>
                          void cloudChange(
                            (lib) => lib.save(entryFromProfile(e.profile)),
                            t.savedToCloud(e.name),
                          )
                        }
                      >
                        {t.saveToCloud}
                      </button>
                    )}
                    {s.key === 'cloud' && (
                      <button
                        type="button"
                        className="button danger"
                        onClick={() => {
                          if (window.confirm(t.confirmRemove(e.name))) {
                            void cloudChange((lib) => lib.remove(e.id), t.removedFromCloud(e.name));
                          }
                        }}
                      >
                        {t.remove}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </fieldset>
          ))}
        </div>
        <div className="toolbar modal-actions">
          <label className="button">
            {t.import}
            <input
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                e.target.value = '';
              }}
            />
          </label>
          <button
            type="button"
            className="button"
            disabled={chosen.length === 0}
            onClick={exportSelected}
          >
            {t.export(chosen.length)}
          </button>
          <button type="button" className="button primary" onClick={onClose}>
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
}
