import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

interface External {
  win: Window;
  root: HTMLElement;
}

/** Otvorí prázdne okno prehliadača so štýlmi a témou aplikácie; undefined, ak prehliadač okno zablokuje. */
function openExternal(title: string): External | undefined {
  const win = window.open('', '_blank', 'popup,width=1320,height=880');
  if (!win) return undefined;
  const doc = win.document;
  doc.title = `${title} — ${sk.app.title}`;
  doc.documentElement.lang = document.documentElement.lang;
  const theme = document.documentElement.getAttribute('data-theme');
  if (theme) doc.documentElement.setAttribute('data-theme', theme);
  for (const node of document.querySelectorAll('link[rel="stylesheet"], style')) {
    doc.head.appendChild(node.cloneNode(true));
  }
  const root = doc.createElement('div');
  root.className = 'app-window-external';
  doc.body.appendChild(root);
  return { win, root };
}

/**
 * Samostatné okno nad pracovnou plochou (ADR 0025): editor prierezu, parametre a staničné funkcie.
 * Zmeny sa ukladajú priebežne do modelu, okno len zatvára pohľad. Tlačidlom sa okno presunie do samostatného
 * okna prehliadača (napr. na druhý monitor) a pracovná plocha ostane voľná; zatvorením okna sa zavrie aj pohľad.
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
  const [external, setExternal] = useState<External>();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!closeOnEscape) return;
    const targets = external ? [window, external.win] : [window];
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    for (const t of targets) t.addEventListener('keydown', onKey);
    return () => {
      for (const t of targets) t.removeEventListener('keydown', onKey);
    };
  }, [closeOnEscape, external]);

  // zatvorenie samostatného okna zavrie pohľad; zatvorenie pohľadu zavrie okno
  useEffect(() => {
    if (!external) return;
    const onHide = () => onCloseRef.current();
    external.win.addEventListener('pagehide', onHide);
    return () => {
      external.win.removeEventListener('pagehide', onHide);
      external.win.close();
    };
  }, [external]);

  const section = (
    <section
      className={external ? 'app-window app-window-detached' : 'app-window'}
      role="dialog"
      aria-modal={external ? undefined : true}
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
        <div className="app-window-actions">{actions}</div>
        {!external && (
          <button
            type="button"
            className="icon-button"
            aria-label={sk.window.popOut}
            title={sk.window.popOutTitle}
            onClick={() => {
              const opened = openExternal(title);
              if (opened) setExternal(opened);
            }}
          >
            <Icon name="popOut" size={16} />
          </button>
        )}
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
  );

  if (external) return createPortal(section, external.root);
  return <div className="app-window-backdrop">{section}</div>;
}
