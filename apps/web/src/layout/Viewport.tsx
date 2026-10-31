import type { Alignment } from '@bridge/alignment';
import type { Drawing } from '@bridge/drawing';
import type { ReactNode } from 'react';
import { sk } from '../i18n/sk.ts';
import type { ExportCoordinates, ExportFormat } from '../views/ExportMenu.tsx';
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
  /** pôdorys mosta */
  plan: Drawing | undefined;
  onExportPlan: (format: ExportFormat, coordinates: ExportCoordinates) => void;
  onAddSupport: (s: number, offset: number) => void;
  sectionView: ReactNode;
  view3d: ReactNode;
  /** pozdĺžny rez v osi vybranej NK */
  profile: {
    drawing: Drawing | undefined;
    decks: readonly { id: string; name: string }[];
    deckId: string | undefined;
    onDeck: (id: string) => void;
    onExport: (format: ExportFormat) => void;
  };
  selectedId: string | undefined;
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
  plan,
  onExportPlan,
  onAddSupport,
  view3d,
  profile,
  selectedId,
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
        {mode === '3d' && view3d}
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
              drawing={plan}
              selected={selectedId}
              onExport={onExportPlan}
              onAddSupport={onAddSupport}
            />
            <ProfileView
              key={`${alignment.name}-profile`}
              alignment={alignment}
              cursorS={cursorS}
              onCursor={onProfileCursor}
              {...profile}
              selected={selectedId}
            />
          </div>
        )}
      </div>
    </main>
  );
}
