import { type ReactNode, useEffect, useId } from 'react';
import { sk } from '../i18n/sk.ts';
import { Icon, type IconName } from '../icons/Icon.tsx';

interface Props {
  title: string;
  subtitle?: string | undefined;
  icon: IconName;
  onClose: () => void;
  children: ReactNode;
  /** ovládacie prvky v hlavičke okna (napr. nástroje editora) */
  actions?: ReactNode;
  /** spodný riadok okna (stav, tlačidlá) */
  footer?: ReactNode;
  /** Esc zavrie okno; editor prierezu ho necháva nástrojom (zrušenie obrysu) */
  closeOnEscape?: boolean;
}

/**
 * Samostatné okno nad pracovnou plochou (ADR 0025): editor prierezu, parametre a staničné funkcie, kontroly.
 * Zmeny sa ukladajú priebežne do modelu, okno len zatvára pohľad.
 */
export function AppWindow({
  title,
  subtitle,
  icon,
  onClose,
  children,
  actions,
  footer,
  closeOnEscape = true,
}: Props) {
  const titleId = useId();
  useEffect(() => {
    if (!closeOnEscape) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, closeOnEscape]);
  return (
    <div className="app-window-backdrop">
      <section className="app-window" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="app-window-header">
          <span className="app-window-icon">
            <Icon name={icon} size={20} />
          </span>
          <div className="app-window-titles">
            <h2 id={titleId}>{title}</h2>
            {subtitle && <span>{subtitle}</span>}
          </div>
          <div className="app-window-actions">{actions}</div>
          <button
            type="button"
            className="icon-button"
            aria-label={sk.window.close}
            title={sk.window.close}
            onClick={onClose}
          >
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className="app-window-body">{children}</div>
        {footer && <footer className="app-window-footer">{footer}</footer>}
      </section>
    </div>
  );
}
