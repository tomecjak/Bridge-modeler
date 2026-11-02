import { useState } from 'react';
import { sk } from '../../i18n/sk.ts';
import { Icon } from '../../icons/Icon.tsx';
import { applyTheme, nextTheme, readStoredTheme, type ThemePreference } from '../../theme/theme.ts';

const THEME_ICON = { system: 'themeSystem', light: 'themeLight', dark: 'themeDark' } as const;

/** Prepínač farebnej témy (ADR 0024): systém → svetlá → tmavá. */
function ThemeToggle() {
  const [theme, setTheme] = useState<ThemePreference>(readStoredTheme);
  const onClick = () => {
    const next = nextTheme(theme);
    applyTheme(next);
    setTheme(next);
  };
  return (
    <button type="button" className="theme-toggle" title={sk.theme.toggleTitle} onClick={onClick}>
      <Icon name={THEME_ICON[theme]} size={14} />
      {sk.theme[theme]}
    </button>
  );
}

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
      <ThemeToggle />
    </header>
  );
}
