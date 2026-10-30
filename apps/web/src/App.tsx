import type { AlignmentIssue } from '@bridge/alignment';
import { type DragEvent, useEffect, useState } from 'react';
import { type CursorInfo, formatCursor } from './format/cursor.ts';
import { sk } from './i18n/sk.ts';
import { fileLevelIssues, importLandXml } from './import/importLandXml.ts';
import { ProjectTree } from './layout/ProjectTree.tsx';
import { PropertiesPanel } from './layout/PropertiesPanel.tsx';
import { type ViewMode, Viewport } from './layout/Viewport.tsx';
import { useEvaluatedAlignments } from './store/derived.ts';
import { projectStore, useProject } from './store/projectStore.ts';

/** Posledný import LandXML: problémy parsera sa neukladajú do projektu, len sa zobrazia. */
interface LastImport {
  issues: AlignmentIssue[];
  fileIssues: AlignmentIssue[];
}

export function App() {
  const project = useProject((s) => s.project);
  const canUndo = useProject((s) => s.past.length > 0);
  const canRedo = useProject((s) => s.future.length > 0);
  const alignments = useEvaluatedAlignments();
  const [lastImport, setLastImport] = useState<LastImport>({ issues: [], fileIssues: [] });
  const [selected, setSelected] = useState(0);
  const [mode, setMode] = useState<ViewMode>('2d');
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<string>();
  const [cursor, setCursor] = useState<CursorInfo>();

  const item = alignments[selected];
  const importIssuesOf = (name: string) => lastImport.issues.filter((i) => i.alignment === name);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable]')) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' || key === 'y') {
        e.preventDefault();
        if (key === 'y' || e.shiftKey) projectStore.getState().redo();
        else projectStore.getState().undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function openLandXml(file: File) {
    try {
      const result = importLandXml(file.name, await file.text());
      if (result.alignments.length > 0 && result.origin) {
        projectStore.getState().dispatch({
          type: 'importAlignments',
          alignments: result.alignments,
          origin: result.origin,
        });
        const first = result.alignments[0]?.name;
        const names = [...projectStore.getState().project.alignments.map((a) => a.name)];
        setSelected(Math.max(0, names.indexOf(first ?? '')));
      }
      setLastImport({ issues: result.issues, fileIssues: fileLevelIssues(result) });
      setMode('2d');
      setCursor(undefined);
      setMessage(undefined);
    } catch {
      setMessage(sk.import.readFailed);
    }
  }

  function statusText(): string {
    if (message) return message;
    if (cursor && item && project.crs.origin)
      return formatCursor(cursor, item.alignment, project.crs.origin);
    return sk.statusBar.ready;
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void openLandXml(file);
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drag & drop je doplnok k tlačidlu importu
    <div
      className="app"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <header className="app-header">
        <span className="app-title">{sk.app.title}</span>
        <div className="toolbar">
          <button
            type="button"
            className="button"
            disabled={!canUndo}
            title={sk.history.undoShortcut}
            onClick={() => projectStore.getState().undo()}
          >
            {sk.history.undo}
          </button>
          <button
            type="button"
            className="button"
            disabled={!canRedo}
            title={sk.history.redoShortcut}
            onClick={() => projectStore.getState().redo()}
          >
            {sk.history.redo}
          </button>
          <label className="button">
            {sk.import.button}
            <input
              type="file"
              accept=".xml,.landxml"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void openLandXml(file);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </header>
      <ProjectTree
        projectName={project.name}
        alignments={alignments}
        issueCount={(name) =>
          importIssuesOf(name).length +
          (alignments.find((a) => a.data.name === name)?.issues.length ?? 0)
        }
        fileIssues={lastImport.fileIssues}
        selected={selected}
        onSelect={setSelected}
      />
      <Viewport
        mode={mode}
        onModeChange={setMode}
        alignment={item?.alignment}
        cursorS={cursor?.s}
        onPlanCursor={(c) => setCursor(c && { source: 'plan', ...c })}
        onProfileCursor={(s) => setCursor(s === undefined ? undefined : { source: 'profile', s })}
      />
      <PropertiesPanel
        item={item}
        importIssues={item ? importIssuesOf(item.data.name) : []}
        origin={project.crs.origin}
      />
      <footer className="app-status">{statusText()}</footer>
      {dragging && <div className="drop-overlay">{sk.import.dropHint}</div>}
    </div>
  );
}
