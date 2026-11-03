import { sk } from '../i18n/sk.ts';
import { Icon } from '../icons/Icon.tsx';
import type { BrowserTarget } from '../store/browserTree.ts';
import { CHECK_GROUPS, type CheckItem, checkCounts } from '../store/checks.ts';

interface Props {
  items: readonly CheckItem[];
  /** klik: výber prvku (zvýrazní sa v pohľade) */
  onSelect: (target: BrowserTarget) => void;
  /** dvojklik: prvok v pohľade, kde sa s ním pracuje */
  onOpen: (target: BrowserTarget) => void;
  selected?: string | undefined;
  onSelectRow: (key: string) => void;
  onClose: () => void;
}

/**
 * Kontroly v pravom paneli (ADR 0022, vzhľad ADR 0026): súhrn chýb, upozornení a skupín bez problémov,
 * problémy ako karty po skupinách; klik vyberie prvok, dvojklik ho ukáže.
 */
export function ChecksPanel({ items, onSelect, onOpen, selected, onSelectRow, onClose }: Props) {
  const t = sk.checks;
  const total = checkCounts(items);
  const okGroups = CHECK_GROUPS.filter((g) => !items.some((i) => i.group === g));
  return (
    <aside className="panel panel-right checks-panel" aria-labelledby="checks-panel-title">
      <div className="checks-panel-header">
        <h2 id="checks-panel-title" className="panel-title">
          {t.title}
        </h2>
        <button
          type="button"
          className="icon-button"
          aria-label={sk.window.close}
          title={sk.window.close}
          onClick={onClose}
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="checks-tiles">
        <div className="checks-tile tile-error">
          <span className="checks-tile-value">{total.errors}</span>
          <span>{t.tiles.errors}</span>
        </div>
        <div className="checks-tile tile-warning">
          <span className="checks-tile-value">{total.warnings}</span>
          <span>{t.tiles.warnings}</span>
        </div>
        <div className="checks-tile tile-ok">
          <span className="checks-tile-value">{okGroups.length}</span>
          <span>{t.tiles.ok}</span>
        </div>
      </div>
      {items.length === 0 && <p className="panel-empty">{t.empty}</p>}
      {CHECK_GROUPS.map((group) => {
        const rows = items.filter((i) => i.group === group);
        if (rows.length === 0) return null;
        const counts = checkCounts(rows);
        return (
          <section key={group} className="checks-cards" aria-label={t.groups[group]}>
            <h3 className="checks-cards-title">
              <span className={counts.errors > 0 ? 'dot dot-error' : 'dot dot-warning'} />
              {t.groups[group]}
              <span className="hint">{t.summary(counts.errors, counts.warnings)}</span>
            </h3>
            {rows.map((row) => (
              <button
                key={row.key}
                type="button"
                className="check-card"
                data-selected={row.key === selected || undefined}
                data-severity={row.severity}
                onClick={() => {
                  onSelectRow(row.key);
                  if (row.target) onSelect(row.target);
                }}
                onDoubleClick={() => row.target && onOpen(row.target)}
              >
                <span className="check-card-icon">
                  <Icon name={row.severity === 'error' ? 'error' : 'warning'} size={16} />
                </span>
                <span className="check-card-text">
                  <span className="check-card-owner">{row.owner}</span>
                  <span>{row.text}</span>
                </span>
              </button>
            ))}
          </section>
        );
      })}
      {okGroups.length > 0 && items.length > 0 && (
        <p className="checks-ok">
          <span className="dot dot-ok" />
          {okGroups.map((g) => t.groups[g]).join(' · ')} — {t.noProblems}
        </p>
      )}
      <p className="hint">{t.hint}</p>
    </aside>
  );
}
