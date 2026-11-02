import { sk } from '../i18n/sk.ts';
import type { BrowserTarget } from '../store/browserTree.ts';
import { CHECK_GROUPS, type CheckItem, checkCounts } from '../store/checks.ts';

interface Props {
  items: readonly CheckItem[];
  /** klik: výber prvku (vlastnosti vpravo) */
  onSelect: (target: BrowserTarget) => void;
  /** dvojklik: prvok v pohľade, kde sa s ním pracuje */
  onOpen: (target: BrowserTarget) => void;
  /** kľúč vybraného riadku */
  selected?: string | undefined;
  onSelectRow: (key: string) => void;
}

/** Panel Kontroly (ADR 0022): problémy modelu v skupinách s preklikom na prvok. */
export function ChecksView({ items, onSelect, onOpen, selected, onSelectRow }: Props) {
  const t = sk.checks;
  const total = checkCounts(items);
  return (
    <div className="checks-view">
      <div className="checks-header">
        <h2 className="panel-title">{t.title}</h2>
        <span className="hint">{t.summary(total.errors, total.warnings)}</span>
      </div>
      {items.length === 0 && <p className="panel-empty">{t.empty}</p>}
      {CHECK_GROUPS.map((group) => {
        const rows = items.filter((i) => i.group === group);
        if (rows.length === 0) return null;
        const counts = checkCounts(rows);
        return (
          <section key={group} className="checks-group" aria-label={t.groups[group]}>
            <h3 className="panel-subtitle">
              {t.groups[group]}{' '}
              <span className="hint">{t.summary(counts.errors, counts.warnings)}</span>
            </h3>
            <table className="mini-table checks-table">
              <thead>
                <tr>
                  <th className="checks-severity">{t.severity}</th>
                  <th className="checks-owner">{t.owner}</th>
                  <th>{t.message}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.key}
                    aria-selected={row.key === selected}
                    className={row.target ? 'checks-row' : undefined}
                    onClick={() => {
                      onSelectRow(row.key);
                      if (row.target) onSelect(row.target);
                    }}
                    onDoubleClick={() => row.target && onOpen(row.target)}
                  >
                    <td className={`checks-severity issue-${row.severity}`}>
                      <strong>{sk.severity[row.severity]}</strong>
                    </td>
                    <td className="checks-owner">{row.owner}</td>
                    <td>{row.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
      <p className="hint">{t.hint}</p>
    </div>
  );
}
