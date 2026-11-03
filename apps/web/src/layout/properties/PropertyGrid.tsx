import { type ReactNode, useEffect, useState } from 'react';
import { sk } from '../../i18n/sk.ts';
import { Icon, type IconName } from '../../icons/Icon.tsx';
import { ExpressionInput } from '../../views/ExpressionInput.tsx';
import { StationField } from '../../views/StationFunctionEditor.tsx';
import { TextField } from '../../views/TextField.tsx';

export interface RowAction {
  label: string;
  onClick: () => void;
}

/** Riadok mriežky vlastností (ADR 0016): popis vľavo, hodnota alebo editor vpravo. */
export type PropertyRow =
  | {
      kind: 'text';
      label: string;
      value: string;
      onCommit: (value: string) => void;
      /** id `<datalist>` s návrhmi */
      list?: string;
      placeholder?: string;
      invalid?: boolean;
      action?: RowAction;
    }
  | {
      kind: 'select';
      label: string;
      value: string;
      options: readonly { value: string; label: string }[];
      onChange: (value: string) => void;
      disabled?: boolean;
    }
  | { kind: 'station'; label: string; value: number; onCommit: (value: number) => void }
  /** výraz v jednotkách modelu (m, °; ADR 0006); prázdna hodnota so zástupným textom (napr. „rôzne“) nie je chyba */
  | {
      kind: 'expression';
      label: string;
      value: string;
      onCommit: (value: string) => void;
      placeholder?: string;
    }
  | {
      kind: 'toggle';
      label: string;
      value: boolean;
      onChange: (value: boolean) => void;
      disabled?: boolean;
    }
  | { kind: 'readonly'; label: string; value: string }
  /** súhrn zložitej hodnoty a „…“, ktoré otvorí dialóg (ako „Edit…“ v Revite) */
  | { kind: 'edit'; label: string; value: string; onEdit: () => void }
  | { kind: 'custom'; label: string; node: ReactNode }
  | { kind: 'note'; text: string; tone?: 'muted' | 'warning' | 'error' };

export interface PropertyGroup {
  id: string;
  title: string;
  rows?: readonly PropertyRow[];
  /** voľný obsah pod riadkami (tabuľka ložísk, výsledky) */
  content?: ReactNode;
}

export interface PropertySheet {
  /** druh vybraného prvku alebo pohľadu */
  heading: { icon: IconName; label: string };
  /** výber typu navrchu (druh podpery, prierez NK) */
  type?: {
    label: string;
    value: string;
    options: readonly { value: string; label: string }[];
    onChange: (value: string) => void;
  };
  groups: readonly PropertyGroup[];
  actions?: readonly {
    label: string;
    icon?: IconName;
    onClick: () => void;
    disabled?: boolean;
    danger?: boolean;
  }[];
}

const COLLAPSED_KEY = 'bridge-modeler:property-groups-collapsed';

function readCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function Editor({ row }: { row: Exclude<PropertyRow, { kind: 'note' }> }) {
  switch (row.kind) {
    case 'text':
      return (
        <div className="prop-with-action">
          <TextField
            value={row.value}
            ariaLabel={row.label}
            onCommit={row.onCommit}
            {...(row.list ? { list: row.list } : {})}
            {...(row.placeholder ? { placeholder: row.placeholder } : {})}
            {...(row.invalid ? { invalid: true } : {})}
          />
          {row.action && (
            <button type="button" className="prop-action" onClick={row.action.onClick}>
              {row.action.label}
            </button>
          )}
        </div>
      );
    case 'select':
      return (
        <select
          value={row.value}
          aria-label={row.label}
          disabled={row.disabled}
          onChange={(e) => row.onChange(e.target.value)}
        >
          {row.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case 'station':
      return <StationField ariaLabel={row.label} value={row.value} onCommit={row.onCommit} />;
    case 'expression':
      return (
        <ExpressionInput
          value={row.value}
          ariaLabel={row.label}
          onCommit={row.onCommit}
          {...(row.placeholder ? { placeholder: row.placeholder } : {})}
        />
      );
    case 'toggle':
      return (
        <input
          type="checkbox"
          aria-label={row.label}
          checked={row.value}
          disabled={row.disabled}
          onChange={(e) => row.onChange(e.target.checked)}
        />
      );
    case 'readonly':
      return <span className="prop-readonly">{row.value}</span>;
    case 'edit':
      return (
        <div className="prop-with-action">
          <span className="prop-readonly">{row.value}</span>
          <button
            type="button"
            className="prop-action"
            title={sk.properties.edit}
            aria-label={`${sk.properties.edit}: ${row.label}`}
            onClick={row.onEdit}
          >
            …
          </button>
        </div>
      );
    case 'custom':
      return <>{row.node}</>;
  }
}

/** Skupiny vlastností so zbalením (stav sa pamätá v prehliadači); použije ich panel aj dialógy. */
export function PropertyGroups({ groups }: { groups: readonly PropertyGroup[] }) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
    } catch {
      // bez úložiska sa stav len nezapamätá
    }
  }, [collapsed]);
  return (
    <>
      {groups.map((g) => {
        const open = !collapsed.has(g.id);
        return (
          <section key={g.id} className="prop-group">
            <button
              type="button"
              className="prop-group-title"
              aria-expanded={open}
              onClick={() =>
                setCollapsed((c) => {
                  const next = new Set(c);
                  if (open) next.add(g.id);
                  else next.delete(g.id);
                  return next;
                })
              }
            >
              <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} />
              {g.title}
            </button>
            {open && (
              <div className="prop-rows">
                {g.rows?.map((row, i) =>
                  row.kind === 'note' ? (
                    // biome-ignore lint/suspicious/noArrayIndexKey: poznámky skupiny sa nepresúvajú
                    <p key={i} className={`prop-note prop-note-${row.tone ?? 'muted'}`}>
                      {row.text}
                    </p>
                  ) : (
                    <div key={row.label} className="prop-row" data-kind={row.kind}>
                      <span className="prop-label" title={row.label}>
                        {row.label}
                      </span>
                      <div className="prop-value">
                        <Editor row={row} />
                      </div>
                    </div>
                  ),
                )}
                {g.content}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}

/**
 * Panel Vlastnosti vpravo (ADR 0016, vzhľad ADR 0025): ikona a druh prvku, výber typu, akcie prvku,
 * skupiny polí s popisom nad hodnotou.
 */
export function PropertiesPalette({
  sheet,
  wide = false,
}: {
  sheet: PropertySheet;
  wide?: boolean;
}) {
  return (
    <aside
      className={wide ? 'panel panel-right panel-wide properties' : 'panel panel-right properties'}
      aria-labelledby="properties-title"
    >
      <h2 id="properties-title" className="panel-title">
        {sk.properties.title}
      </h2>
      <div className="prop-head">
        <span className="prop-head-icon">
          <Icon name={sheet.heading.icon} size={22} />
        </span>
        <div className="prop-head-text">
          {sheet.type ? (
            <>
              <span className="prop-head-kind">{sheet.heading.label}</span>
              <select
                className="prop-head-select"
                value={sheet.type.value}
                aria-label={sheet.type.label}
                onChange={(e) => sheet.type?.onChange(e.target.value)}
              >
                {sheet.type.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <span className="prop-head-title">{sheet.heading.label}</span>
          )}
        </div>
      </div>
      {sheet.actions && sheet.actions.length > 0 && (
        <div className="prop-actions">
          {sheet.actions.map((a) => (
            <button
              key={a.label}
              type="button"
              className={a.danger ? 'prop-action-button danger' : 'prop-action-button'}
              disabled={a.disabled}
              onClick={a.onClick}
            >
              {a.icon && <Icon name={a.icon} size={16} />}
              {a.label}
            </button>
          ))}
        </div>
      )}
      <PropertyGroups groups={sheet.groups} />
    </aside>
  );
}
