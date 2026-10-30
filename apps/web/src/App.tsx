import { type DragEvent, useState } from 'react';
import { type CursorInfo, formatCursor } from './format/cursor.ts';
import { sk } from './i18n/sk.ts';
import { type ImportResult, importLandXml } from './import/importLandXml.ts';
import { ProjectTree } from './layout/ProjectTree.tsx';
import { PropertiesPanel } from './layout/PropertiesPanel.tsx';
import { type ViewMode, Viewport } from './layout/Viewport.tsx';

export function App() {
  const [imported, setImported] = useState<ImportResult>();
  const [selected, setSelected] = useState(0);
  const [mode, setMode] = useState<ViewMode>('2d');
  const [dragging, setDragging] = useState(false);
  const [readError, setReadError] = useState(false);
  const [cursor, setCursor] = useState<CursorInfo>();

  const item = imported?.alignments[selected];

  async function openFile(file: File) {
    try {
      const text = await file.text();
      setImported(importLandXml(file.name, text));
      setSelected(0);
      setMode('2d');
      setCursor(undefined);
      setReadError(false);
    } catch {
      setReadError(true);
    }
  }

  function statusText(): string {
    if (readError) return sk.import.readFailed;
    if (cursor && item && imported?.origin)
      return formatCursor(cursor, item.alignment, imported.origin);
    return sk.statusBar.ready;
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void openFile(file);
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
        <label className="button">
          {sk.import.button}
          <input
            type="file"
            accept=".xml,.landxml"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void openFile(file);
              e.target.value = '';
            }}
          />
        </label>
      </header>
      <ProjectTree imported={imported} selected={selected} onSelect={setSelected} />
      <Viewport
        mode={mode}
        onModeChange={setMode}
        alignment={item?.alignment}
        cursorS={cursor?.s}
        onPlanCursor={(c) => setCursor(c && { source: 'plan', ...c })}
        onProfileCursor={(s) => setCursor(s === undefined ? undefined : { source: 'profile', s })}
      />
      <PropertiesPanel item={item} origin={imported?.origin} />
      <footer className="app-status">{statusText()}</footer>
      {dragging && <div className="drop-overlay">{sk.import.dropHint}</div>}
    </div>
  );
}
