import { type ReactNode, useEffect, useState } from 'react';
import { sk } from '../../i18n/sk.ts';
import { Icon, type IconName } from '../../icons/Icon.tsx';

export interface RibbonButton {
  kind: 'button';
  id: string;
  label: string;
  icon: IconName;
  onClick: () => void;
  title?: string;
  disabled?: boolean;
  /** zapnutý nástroj alebo prepínač */
  pressed?: boolean;
  /** veľké tlačidlo (ikona nad popisom) alebo malé v stĺpci po troch */
  size?: 'large' | 'small';
}

export interface RibbonSelect {
  kind: 'select';
  id: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

/** Vlastný ovládací prvok v stĺpci malých položiek (napr. pole „Prejsť na“). */
export interface RibbonCustom {
  kind: 'custom';
  id: string;
  node: ReactNode;
}

export type RibbonItem = RibbonButton | RibbonSelect | RibbonCustom;

export interface RibbonGroup {
  label: string;
  items: readonly RibbonItem[];
}

export interface RibbonTab {
  id: string;
  label: string;
  groups: readonly RibbonGroup[];
  /** kontextová karta pri výbere prvku (zvýraznená) */
  contextual?: boolean;
}

interface Props {
  tabs: readonly RibbonTab[];
  active: string;
  onActive: (id: string) => void;
  /** tlačidlo menu Súbor pred kartami */
  menu: ReactNode;
}

const MINIMIZED_KEY = 'bridge-modeler:ribbon-minimized';

function readMinimized(): boolean {
  try {
    return localStorage.getItem(MINIMIZED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Položky skupiny: veľké tlačidlá samostatne, malé položky v stĺpcoch po troch. */
function columns(items: readonly RibbonItem[]): RibbonItem[][] {
  const result: RibbonItem[][] = [];
  let small: RibbonItem[] = [];
  const flush = () => {
    if (small.length > 0) result.push(small);
    small = [];
  };
  for (const item of items) {
    if (item.kind === 'button' && item.size !== 'small') {
      flush();
      result.push([item]);
    } else {
      small.push(item);
      if (small.length === 3) flush();
    }
  }
  flush();
  return result;
}

function Item({ item }: { item: RibbonItem }) {
  if (item.kind === 'custom') return <div className="ribbon-custom">{item.node}</div>;
  if (item.kind === 'select') {
    return (
      <label className="ribbon-select">
        <span>{item.label}</span>
        <select
          value={item.value}
          disabled={item.disabled}
          onChange={(e) => item.onChange(e.target.value)}
        >
          {item.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  const large = item.size !== 'small';
  return (
    <button
      type="button"
      className={large ? 'ribbon-button ribbon-large' : 'ribbon-button ribbon-small'}
      title={item.title ?? item.label}
      disabled={item.disabled}
      aria-pressed={item.pressed}
      onClick={item.onClick}
    >
      <Icon name={item.icon} size={large ? 28 : 16} />
      <span>{item.label}</span>
    </button>
  );
}

/**
 * Ribbon ako v Revite (ADR 0016): karty podľa druhu práce, skupiny s popisom dole, veľké a malé tlačidlá.
 * Dvojklik na aktívnu kartu ribbon zbalí / rozbalí (pamätá sa v prehliadači).
 */
export function Ribbon({ tabs, active, onActive, menu }: Props) {
  const [minimized, setMinimized] = useState(readMinimized);
  useEffect(() => {
    try {
      localStorage.setItem(MINIMIZED_KEY, minimized ? '1' : '0');
    } catch {
      // bez úložiska sa stav len nezapamätá
    }
  }, [minimized]);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div className="ribbon" data-minimized={minimized || undefined}>
      <div className="ribbon-tabs" role="tablist" aria-label={sk.ribbon.title}>
        {menu}
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className={tab.contextual ? 'ribbon-tab ribbon-tab-contextual' : 'ribbon-tab'}
            aria-selected={tab.id === current?.id}
            title={sk.ribbon.minimizeHint}
            onClick={() => onActive(tab.id)}
            onDoubleClick={() => setMinimized((m) => !m)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {current && !minimized && (
        <div className="ribbon-panel" role="tabpanel">
          {current.groups.map((group) => (
            <section key={group.label} className="ribbon-group" aria-label={group.label}>
              <div className="ribbon-group-items">
                {columns(group.items).map((col) => (
                  <div
                    key={col.map((i) => i.id).join('|')}
                    className={
                      col.length === 1 && col[0]?.kind === 'button' && col[0].size !== 'small'
                        ? 'ribbon-column'
                        : 'ribbon-column ribbon-column-small'
                    }
                  >
                    {col.map((item) => (
                      <Item key={item.id} item={item} />
                    ))}
                  </div>
                ))}
              </div>
              <div className="ribbon-group-label">{group.label}</div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
