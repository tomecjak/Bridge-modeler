import { useEffect, useRef, useState } from 'react';
import { sk } from '../../i18n/sk.ts';
import { Icon, type IconName } from '../../icons/Icon.tsx';

export interface MenuItem {
  label: string;
  onClick: () => void;
  icon?: IconName;
  disabled?: boolean;
  /** vysvetlenie (napr. prečo je položka neaktívna) */
  title?: string | undefined;
}

export interface MenuSection {
  title?: string;
  items: readonly MenuItem[];
}

/** Menu Súbor (ADR 0016): nový, otvoriť, uložiť a export; zavrie sa výberom, Esc alebo klikom mimo. */
export function AppMenu({ sections }: { sections: readonly MenuSection[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (e.target instanceof Node && !ref.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="app-menu" ref={ref}>
      <button
        type="button"
        className="app-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {sk.ribbon.file}
      </button>
      {open && (
        <div className="app-menu-panel" role="menu">
          {sections.map((section, i) => (
            <div key={section.title ?? i} className="app-menu-section">
              {section.title && <div className="app-menu-title">{section.title}</div>}
              {section.items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  title={item.title}
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                >
                  <span className="app-menu-icon">
                    {item.icon && <Icon name={item.icon} size={16} />}
                  </span>
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
