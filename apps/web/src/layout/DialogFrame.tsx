import { type ReactNode, useEffect, useId } from 'react';
import { sk } from '../i18n/sk.ts';
import { Icon, type IconName } from '../icons/Icon.tsx';

interface Props {
  title: string;
  subtitle?: string | undefined;
  icon: IconName;
  onClose: () => void;
  children: ReactNode;
  /** tlačidlá vpravo dole (Zrušiť, Použiť) */
  actions: ReactNode;
  /** obsah vľavo dole (napr. doplnková akcia) */
  footerStart?: ReactNode;
  width?: number;
}

/**
 * Modálny dialóg vkladania a úprav (ADR 0026): hlavička s ikonou, popisom a zatvorením, telo a spodný riadok
 * s tlačidlami. Esc zavrie.
 */
export function DialogFrame({
  title,
  subtitle,
  icon,
  onClose,
  children,
  actions,
  footerStart,
  width = 720,
}: Props) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop">
      <div
        className="dialog-frame"
        style={{ width: `min(${width}px, 100%)` }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="app-window-header">
          <span className="app-window-icon">
            <Icon name={icon} size={20} />
          </span>
          <div className="app-window-titles">
            <h2 id={titleId}>{title}</h2>
            {subtitle && <span>{subtitle}</span>}
          </div>
          <div className="app-window-actions" />
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
        <div className="dialog-frame-body">{children}</div>
        <footer className="app-window-footer">
          {footerStart}
          <div className="dialog-frame-actions">{actions}</div>
        </footer>
      </div>
    </div>
  );
}
