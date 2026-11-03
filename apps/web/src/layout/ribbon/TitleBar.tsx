import { type ReactNode, useState } from 'react';
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
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  /** pole „Prejsť na km“ */
  goTo: ReactNode;
  /** menu Export (DXF, SVG, STEP) */
  exportMenu: ReactNode;
  onImportLandXml: () => void;
}

/**
 * Horná lišta (ADR 0025): názov projektu, súbor, späť / znova, prejsť na staničenie, export,
 * import LandXML a farebná téma.
 */
export function TitleBar({
  projectName,
  canUndo,
  canRedo,
  onNew,
  onOpen,
  onSave,
  onUndo,
  onRedo,
  goTo,
  exportMenu,
  onImportLandXml,
}: Props) {
  return (
    <header className="titlebar">
      <div className="brand">
        <svg className="brand-mark" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
          <rect x="0.5" y="0.5" width="27" height="27" rx="6" />
          <path className="brand-deck" d="M4 12h20" />
          <path className="brand-piers" d="M8 12v10M14 12v10M20 12v10" />
        </svg>
        <div className="brand-text">
          <span className="brand-title">{sk.app.title}</span>
          <span className="brand-project">{projectName}</span>
        </div>
      </div>
      <nav className="titlebar-group" aria-label={sk.ribbon.file}>
        <button type="button" className="header-button" onClick={onNew}>
          <Icon name="newFile" size={16} />
          {sk.persistence.newProject}
        </button>
        <button type="button" className="header-button" onClick={onOpen}>
          <Icon name="open" size={16} />
          {sk.persistence.open}
        </button>
        <button type="button" className="header-button" onClick={onSave}>
          <Icon name="save" size={16} />
          {sk.persistence.save}
        </button>
      </nav>
      <div className="titlebar-divider" />
      <div className="titlebar-group" role="toolbar" aria-label={sk.ribbon.quickAccess}>
        <button
          type="button"
          className="icon-button"
          title={sk.history.undoShortcut}
          aria-label={sk.history.undo}
          disabled={!canUndo}
          onClick={onUndo}
        >
          <Icon name="undo" size={16} />
        </button>
        <button
          type="button"
          className="icon-button"
          title={sk.history.redoShortcut}
          aria-label={sk.history.redo}
          disabled={!canRedo}
          onClick={onRedo}
        >
          <Icon name="redo" size={16} />
        </button>
      </div>
      <div className="titlebar-spacer" />
      <div className="titlebar-goto">{goTo}</div>
      {exportMenu}
      <button type="button" className="button primary" onClick={onImportLandXml}>
        <Icon name="landxml" size={16} />
        {sk.import.button}
      </button>
      <ThemeToggle />
    </header>
  );
}
