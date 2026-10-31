import type { AlignmentIssue } from '@bridge/alignment';
import { type KeyboardEvent, type MouseEvent, useEffect, useRef, useState } from 'react';
import { sk } from '../i18n/sk.ts';
import { Icon } from '../icons/Icon.tsx';
import { type BrowserNode, type BrowserTarget, sameTarget } from '../store/browserTree.ts';
import { IssueList } from './IssueList.tsx';

interface Props {
  projectName: string;
  tree: readonly BrowserNode[];
  selected: BrowserTarget | undefined;
  /** klik: výber (vlastnosti vpravo) */
  onSelect: (target: BrowserTarget) => void;
  /** dvojklik alebo „Priblížiť v pohľade“ */
  onOpen: (target: BrowserTarget) => void;
  onRename: (target: BrowserTarget, name: string) => void;
  onDelete: (target: BrowserTarget) => void;
  /** kópia prvku; undefined pre prvky, ktoré sa nekopírujú (terén, parametre) */
  canDuplicate: (target: BrowserTarget) => boolean;
  onDuplicate: (target: BrowserTarget) => void;
  /** Upraviť → Premenovať: nová hodnota `nonce` začne premenovanie položky `key` */
  renameRequest: { key: string; nonce: number } | undefined;
  /** chyby pri otvorení projektového súboru a problémy súboru LandXML */
  notices: readonly string[];
  fileIssues: readonly AlignmentIssue[];
}

const COLLAPSED_KEY = 'bridge-modeler:browser-collapsed';
/** predvolene zbalené skupiny */
const DEFAULT_COLLAPSED = ['parameters'];

function readCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : DEFAULT_COLLAPSED);
  } catch {
    return new Set(DEFAULT_COLLAPSED);
  }
}

interface MenuState {
  node: BrowserNode;
  x: number;
  y: number;
}

/**
 * Prehliadač projektu (ADR 0016): pohľady, model hierarchicky, podklady, prierezy a parametre. Klik vyberie,
 * dvojklik priblíži prvok v pohľade, pravé tlačidlo otvorí menu; F2 premenuje, Delete odstráni.
 */
export function ProjectBrowser({
  projectName,
  tree,
  selected,
  onSelect,
  onOpen,
  onRename,
  onDelete,
  canDuplicate,
  onDuplicate,
  renameRequest,
  notices,
  fileIssues,
}: Props) {
  const t = sk.browser;
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [renaming, setRenaming] = useState<string>();
  const [menu, setMenu] = useState<MenuState>();
  const menuRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: premenovanie len pri novej žiadosti z ribbonu
  useEffect(() => {
    if (renameRequest) setRenaming(renameRequest.key);
  }, [renameRequest?.nonce]);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
    } catch {
      // bez úložiska sa stav len nezapamätá
    }
  }, [collapsed]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e.type === 'keydown' && (e as globalThis.KeyboardEvent).key !== 'Escape') return;
      if (e.target instanceof Node && menuRef.current?.contains(e.target)) return;
      setMenu(undefined);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [menu]);

  const toggle = (key: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  function onKey(e: KeyboardEvent<HTMLButtonElement>, node: BrowserNode) {
    if (!node.target) return;
    if (e.key === 'F2' && node.editable) {
      e.preventDefault();
      setRenaming(node.key);
    } else if (e.key === 'Delete' && node.editable) {
      e.preventDefault();
      onDelete(node.target);
    } else if (e.key === 'Enter') {
      onOpen(node.target);
    }
  }

  function row(node: BrowserNode, depth: number) {
    const hasChildren = (node.children?.length ?? 0) > 0;
    const open = !collapsed.has(node.key);
    const isSelected = sameTarget(node.target, selected);
    return (
      <li key={node.key}>
        <div
          className="browser-row"
          data-selected={isSelected || undefined}
          style={{ paddingLeft: 4 + depth * 14 }}
        >
          {hasChildren ? (
            <button
              type="button"
              className="browser-chevron"
              aria-label={open ? t.collapse(node.label) : t.expand(node.label)}
              aria-expanded={open}
              onClick={() => toggle(node.key)}
            >
              <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} />
            </button>
          ) : (
            <span className="browser-chevron" />
          )}
          {renaming === node.key && node.target ? (
            <input
              className="browser-rename"
              defaultValue={node.label}
              aria-label={t.renameLabel(node.label)}
              // biome-ignore lint/a11y/noAutofocus: premenovanie začína v poli (F2 / menu)
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              onBlur={() => setRenaming(undefined)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setRenaming(undefined);
                if (e.key !== 'Enter' || !node.target) return;
                const name = e.currentTarget.value.trim();
                if (name !== '' && name !== node.label) onRename(node.target, name);
                setRenaming(undefined);
              }}
            />
          ) : (
            <button
              type="button"
              className="browser-item"
              aria-current={isSelected || undefined}
              onClick={() => (node.target ? onSelect(node.target) : toggle(node.key))}
              onDoubleClick={() => node.target && onOpen(node.target)}
              onKeyDown={(e) => onKey(e, node)}
              onContextMenu={(e: MouseEvent) => {
                if (!node.target) return;
                e.preventDefault();
                onSelect(node.target);
                setMenu({ node, x: e.clientX, y: e.clientY });
              }}
            >
              <Icon name={node.icon} size={16} />
              <span className="browser-label">{node.label}</span>
              {node.detail && <span className="browser-detail">{node.detail}</span>}
              {node.issues !== undefined && (
                <span className="badge badge-error">{node.issues}</span>
              )}
            </button>
          )}
        </div>
        {hasChildren && open && <ul>{node.children?.map((c) => row(c, depth + 1))}</ul>}
        {node.key === 'model' && !hasChildren && (
          <p className="hint browser-empty">{t.emptyModel}</p>
        )}
      </li>
    );
  }

  return (
    <section className="project-browser" aria-labelledby="browser-title">
      <h2 id="browser-title" className="panel-title">
        {t.title}
      </h2>
      <p className="file-name">{projectName}</p>
      <ul className="browser-tree">{tree.map((n) => row(n, 0))}</ul>
      {(notices.length > 0 || fileIssues.length > 0) && (
        <>
          <h3 className="panel-subtitle">{t.problems}</h3>
          {notices.length > 0 && (
            <ul className="issues">
              {notices.map((n) => (
                <li key={n} className="issue issue-error">
                  {n}
                </li>
              ))}
            </ul>
          )}
          {fileIssues.length > 0 && <IssueList issues={fileIssues} />}
        </>
      )}
      {menu?.node.target && (
        <div
          ref={menuRef}
          className="app-menu-panel browser-menu"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              if (menu.node.target) onOpen(menu.node.target);
              setMenu(undefined);
            }}
          >
            <span className="app-menu-icon">
              <Icon name="goTo" size={16} />
            </span>
            {t.menu.zoom}
          </button>
          {menu.node.editable && (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setRenaming(menu.node.key);
                  setMenu(undefined);
                }}
              >
                <span className="app-menu-icon">
                  <Icon name="rename" size={16} />
                </span>
                {t.menu.rename}
              </button>
              {canDuplicate(menu.node.target) && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    if (menu.node.target) onDuplicate(menu.node.target);
                    setMenu(undefined);
                  }}
                >
                  <span className="app-menu-icon">
                    <Icon name="duplicate" size={16} />
                  </span>
                  {t.menu.duplicate}
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  if (menu.node.target) onDelete(menu.node.target);
                  setMenu(undefined);
                }}
              >
                <span className="app-menu-icon">
                  <Icon name="trash" size={16} />
                </span>
                {t.menu.delete}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
