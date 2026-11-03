import { Fragment } from 'react';
import { sk } from '../i18n/sk.ts';
import { Icon } from '../icons/Icon.tsx';
import type { RibbonGroup, RibbonItem, RibbonTab } from './ribbon/Ribbon.tsx';

export type BaseView = '3d' | '2d';

/**
 * Položky, ktoré v lište nástrojov nie sú (ADR 0025): pole „Prejsť na“ a import LandXML sú v hornej lište,
 * úpravy prvku v kontextovom riadku, 3D / 2D v prepínači a prierez v samostatnom okne.
 */
const HIDDEN = new Set([
  'goto',
  'landxml',
  'duplicate',
  'rename',
  'delete',
  'window-3d',
  'window-2d',
  'window-section',
  // výbery podkladu a osi profilu sú vo vlastnostiach pohľadu (pravý panel bez výberu)
  'plan-basemap',
  'profile-deck',
  'profile-axis',
  'basemap',
]);
/** Nastavenia pôdorysu a pozdĺžneho profilu: len v 2D. */
const ONLY_2D = new Set(['exaggeration', 'edge-terrain', 'dimensions']);
/** Prepínače 3D scény: len v 3D. */
const ONLY_3D = new Set(['cut', 'terrain3d', 'exact']);

/** Položky skupiny viditeľné v danom pohľade (čistá funkcia, ADR 0025). */
export function visibleItems(group: RibbonGroup, view: BaseView): RibbonItem[] {
  return group.items.filter(
    (i) =>
      !HIDDEN.has(i.id) &&
      !(view === '3d' && ONLY_2D.has(i.id)) &&
      !(view === '2d' && ONLY_3D.has(i.id)),
  );
}

function Item({ item, labeled }: { item: RibbonItem; labeled: boolean }) {
  if (item.kind === 'custom') return <div className="toolbar-custom">{item.node}</div>;
  if (item.kind === 'select') {
    return (
      <label className="toolbar-select" title={item.title ?? item.label}>
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
  const showLabel = labeled || item.pressed === true;
  return (
    <button
      type="button"
      className="tool-button"
      title={item.title ?? item.label}
      aria-label={showLabel ? undefined : item.label}
      disabled={item.disabled}
      aria-pressed={item.pressed}
      onClick={item.onClick}
    >
      <Icon name={item.icon} size={18} />
      {showLabel && <span>{item.label}</span>}
    </button>
  );
}

/** Skupiny nástrojov v jednom riadku; `labeled` ukáže aj popisy (kontextový riadok, okná). */
export function ToolGroups({
  groups,
  view,
  labeled = false,
}: {
  groups: readonly RibbonGroup[];
  view: BaseView;
  labeled?: boolean;
}) {
  return (
    <>
      {groups.map((group) => {
        const items = visibleItems(group, view);
        if (items.length === 0) return null;
        return (
          <fieldset key={group.label} className="tool-group">
            <legend className="visually-hidden">{group.label}</legend>
            {items.map((item) => (
              <Item key={item.id} item={item} labeled={labeled} />
            ))}
          </fieldset>
        );
      })}
    </>
  );
}

interface Props {
  tabs: readonly RibbonTab[];
  view: BaseView;
  onView: (view: BaseView) => void;
}

/** Lišta nad pohľadmi (ADR 0025): prepínač 3D / 2D, nástroje a kontextový riadok vybraného prvku. */
export function Toolbar({ tabs, view, onView }: Props) {
  const main = tabs.filter((t) => !t.contextual);
  const contextual = tabs.find((t) => t.contextual);
  return (
    <div className="view-toolbar">
      <div className="view-toolbar-row" role="toolbar" aria-label={sk.ribbon.title}>
        <div className="segmented" role="tablist" aria-label={sk.viewport.views}>
          {(['3d', '2d'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => onView(v)}
            >
              <Icon name={v === '3d' ? 'cube' : 'view2d'} size={15} />
              {v === '3d' ? sk.viewport.tabs.view3d : sk.viewport.tabs.view2d}
            </button>
          ))}
        </div>
        {main.map((tab) => (
          <Fragment key={tab.id}>
            <ToolGroups groups={tab.groups} view={view} />
          </Fragment>
        ))}
      </div>
      {contextual && (
        <div className="context-row" role="toolbar" aria-label={contextual.label}>
          <span className="context-row-title">{contextual.label}</span>
          <ToolGroups groups={contextual.groups} view={view} labeled />
        </div>
      )}
    </div>
  );
}
