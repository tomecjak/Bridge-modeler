import type { Alignment } from '@bridge/alignment';
import type { SupportResult } from '@bridge/sections';
import type { ReactNode } from 'react';
import { sk } from '../i18n/sk.ts';
import { type PlanCursor, PlanView } from '../views/PlanView.tsx';
import { ProfileView } from '../views/ProfileView.tsx';

export type ViewMode = '3d' | '2d' | 'section' | 'parameters';

interface Props {
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  alignment: Alignment | undefined;
  cursorS: number | undefined;
  onPlanCursor: (cursor: PlanCursor | undefined) => void;
  onProfileCursor: (s: number | undefined) => void;
  parametersView: ReactNode;
  supports: readonly SupportResult[];
  onAddSupport: (s: number, offset: number) => void;
  sectionView: ReactNode;
}

const TABS: { mode: ViewMode; label: string }[] = [
  { mode: '3d', label: sk.viewport.tabs.view3d },
  { mode: '2d', label: sk.viewport.tabs.view2d },
  { mode: 'section', label: sk.section.tab },
  { mode: 'parameters', label: sk.parameters.tab },
];

export function Viewport({
  mode,
  onModeChange,
  alignment,
  cursorS,
  onPlanCursor,
  onProfileCursor,
  parametersView,
  sectionView,
  supports,
  onAddSupport,
}: Props) {
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
            onClick={() => onModeChange(tab.mode)}
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
        {mode === '3d' && <p className="panel-empty centered">{sk.viewport.empty3d}</p>}
        {mode === 'parameters' && parametersView}
        {mode === 'section' && sectionView}
        {mode === '2d' && !alignment && (
          <p className="panel-empty centered">{sk.viewport.empty2d}</p>
        )}
        {mode === '2d' && alignment && (
          <div className="drawings">
            <PlanView
              key={alignment.name}
              alignment={alignment}
              cursorS={cursorS}
              onCursor={onPlanCursor}
              supports={supports}
              onAddSupport={onAddSupport}
            />
            <ProfileView
              key={`${alignment.name}-profile`}
              alignment={alignment}
              cursorS={cursorS}
              onCursor={onProfileCursor}
              supports={supports}
            />
          </div>
        )}
      </div>
    </main>
  );
}
