import { type ReactNode, useEffect } from 'react';
import { sk } from '../../i18n/sk.ts';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}

/** Modálny dialóg na zložité hodnoty z mriežky vlastností (ADR 0016); zmeny sa ukladajú priebežne, Esc zavrie. */
export function Dialog({ title, onClose, children, wide = false }: Props) {
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
        className={wide ? 'modal modal-wide' : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="property-dialog-title"
      >
        <h2 id="property-dialog-title" className="panel-title">
          {title}
        </h2>
        <div className="dialog-body">{children}</div>
        <div className="toolbar modal-actions">
          <button type="button" className="button primary" onClick={onClose}>
            {sk.library.close}
          </button>
        </div>
      </div>
    </div>
  );
}
