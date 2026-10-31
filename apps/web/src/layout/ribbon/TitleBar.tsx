import { sk } from '../../i18n/sk.ts';
import { Icon } from '../../icons/Icon.tsx';

interface Props {
  projectName: string;
  canUndo: boolean;
  canRedo: boolean;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

/** Horný pruh: panel rýchleho prístupu (uložiť, späť, znova) a názov projektu (ADR 0016). */
export function TitleBar({ projectName, canUndo, canRedo, onSave, onUndo, onRedo }: Props) {
  return (
    <header className="titlebar">
      <div className="quick-access" role="toolbar" aria-label={sk.ribbon.quickAccess}>
        <button type="button" title={sk.persistence.save} onClick={onSave}>
          <Icon name="save" size={16} />
        </button>
        <button type="button" title={sk.history.undoShortcut} disabled={!canUndo} onClick={onUndo}>
          <Icon name="undo" size={16} />
        </button>
        <button type="button" title={sk.history.redoShortcut} disabled={!canRedo} onClick={onRedo}>
          <Icon name="redo" size={16} />
        </button>
      </div>
      <span className="titlebar-title">
        {sk.app.title} — {projectName}
      </span>
    </header>
  );
}
