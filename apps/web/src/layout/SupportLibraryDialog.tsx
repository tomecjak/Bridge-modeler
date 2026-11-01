import {
  type ModelIssue,
  parseSupportLibrary,
  type Support,
  type SupportLibraryEntry,
  serializeSupportLibrary,
} from '@bridge/model';
import { useState } from 'react';
import { formatModelIssue } from '../i18n/modelIssues.ts';
import { sk } from '../i18n/sk.ts';
import type { CloudLibrary } from '../persistence/cloudLibrary.ts';
import { downloadText } from '../persistence/fileIO.ts';
import { drawingFileName } from '../persistence/fileName.ts';
import { type SupportSourceKey, supportTypeKey } from '../store/supportTypes.ts';
import { SupportPreview } from '../views/SupportPreview.tsx';
import type { SupportSources } from './useSupportSources.ts';

interface Props {
  projectName: string;
  library: SupportSources;
  /** vybraná podpera, na ktorú sa dá typ použiť */
  selected: Support | undefined;
  /** typ pre nástroj Podpera (kľúč výberu podľa druhu) */
  onUseInTool: (entry: SupportLibraryEntry, key: string) => void;
  onApply: (entry: SupportLibraryEntry) => void;
  onMessage: (text: string) => void;
  onClose: () => void;
}

/** Dátum a čas zmeny položky v slovenskom formáte. */
const formatDate = (iso: string | undefined) =>
  iso ? new Date(iso).toLocaleString('sk-SK', { dateStyle: 'short', timeStyle: 'short' }) : '';

/**
 * Knižnica podpier (ADR 0019): zabudované šablóny, firemná knižnica (Worker + D1, ak beží), podpery projektu
 * a importovaný súbor. Typ sa vyberie pre nástroj Podpera alebo použije na vybranú podperu; podpera projektu sa dá
 * uložiť do firemnej knižnice, vybrané typy exportovať do súboru `.json`.
 */
export function SupportLibraryDialog({
  projectName,
  library,
  selected,
  onUseInTool,
  onApply,
  onMessage,
  onClose,
}: Props) {
  const t = sk.supportLibrary;
  const { sources, cloud, cloudError, setCloudError, setFile, refresh } = library;
  const [issues, setIssues] = useState<ModelIssue[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  /** Zmena vo firemnej knižnici; pri konflikte verzie hláška a znova načítaný zoznam. */
  async function cloudChange(
    run: (lib: CloudLibrary<SupportLibraryEntry>) => Promise<void>,
    done: string,
  ) {
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

  const chosen = sources.flatMap((s) =>
    s.entries.filter((e) => checked.has(supportTypeKey(s.key, e.id))),
  );

  async function importFile(f: File) {
    const r = parseSupportLibrary(await f.text());
    if (!r.ok) {
      setIssues(r.issues);
      return;
    }
    setIssues([]);
    setFile({ name: f.name, entries: r.entries });
  }

  function exportChosen() {
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
    downloadText(serializeSupportLibrary(unique), name, 'application/json');
    onMessage(sk.export.done(name));
  }

  const item = (source: SupportSourceKey, e: SupportLibraryEntry) => {
    const key = supportTypeKey(source, e.id);
    const info = source === 'cloud' ? cloud?.library.info(e.id) : undefined;
    return (
      <li key={e.id} className="library-item">
        <label className="checkbox">
          <input
            type="checkbox"
            aria-label={t.select(e.name)}
            checked={checked.has(key)}
            onChange={(ev) => {
              const next = new Set(checked);
              if (ev.target.checked) next.add(key);
              else next.delete(key);
              setChecked(next);
            }}
          />
        </label>
        <SupportPreview type={e.support} label={t.preview(e.name)} />
        <span className="library-name">
          {e.name}
          <span className="hint"> · {t.kinds[e.support.kind]}</span>
          {info && (
            <span className="hint">
              {' '}
              · {t.changedBy(info.updatedBy, formatDate(info.updatedAt))}
            </span>
          )}
        </span>
        <button type="button" className="button" onClick={() => onUseInTool(e, key)}>
          {t.useInTool}
        </button>
        {selected && !(source === 'project' && e.id === selected.id) && (
          <button type="button" className="button" onClick={() => onApply(e)}>
            {t.applyTo(selected.name)}
          </button>
        )}
        {source === 'project' && cloud && (
          <button
            type="button"
            className="button"
            onClick={() => void cloudChange((lib) => lib.save(e), t.savedToCloud(e.name))}
          >
            {t.saveToCloud}
          </button>
        )}
        {source === 'cloud' && (
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
    );
  };

  return (
    <div className="modal-backdrop">
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-library-title"
      >
        <h2 id="support-library-title" className="panel-title">
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
              {s.entries.length === 0 && <p className="panel-empty">{t.empty}</p>}
              <ul className="library-list">{s.entries.map((e) => item(s.key, e))}</ul>
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
            onClick={exportChosen}
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
