import { useState } from 'react';
import { sk } from '../i18n/sk.ts';

type ViewMode = '3d' | '2d';

const TABS: { mode: ViewMode; label: string; empty: string }[] = [
  { mode: '3d', label: sk.viewport.tabs.view3d, empty: sk.viewport.empty3d },
  { mode: '2d', label: sk.viewport.tabs.view2d, empty: sk.viewport.empty2d },
];

export function Viewport() {
  const [mode, setMode] = useState<ViewMode>('3d');
  const active = TABS.find((tab) => tab.mode === mode) ?? TABS[0];

  return (
    <main className="viewport">
      <div className="viewport-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.mode}
            type="button"
            role="tab"
            id={`viewport-tab-${tab.mode}`}
            aria-selected={tab.mode === mode}
            aria-controls="viewport-canvas"
            onClick={() => setMode(tab.mode)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        className="viewport-canvas"
        id="viewport-canvas"
        role="tabpanel"
        aria-labelledby={`viewport-tab-${mode}`}
      >
        <p className="panel-empty">{active?.empty}</p>
      </div>
    </main>
  );
}
