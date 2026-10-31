import type { Alignment } from '@bridge/alignment';
import type { Drawing } from '@bridge/drawing';
import type { Vec2 } from '@bridge/geom';
import type { PlanLine } from '@bridge/model';
import type { ReactNode } from 'react';
import { sk } from '../i18n/sk.ts';
import type { ExportCoordinates, ExportFormat } from '../views/ExportMenu.tsx';
import { type PlanCursor, PlanView } from '../views/PlanView.tsx';
import { ProfileView } from '../views/ProfileView.tsx';
import type { SRange } from '../views/viewTransform.ts';

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
  /** zmena hodnoty zapne v pôdoryse nástroj „Pridať podperu“ (z postupu) */
  supportToolRequest: number;
  /** oblasť mosta a úsek na prispôsobenie pohľadov v spojitom staničení zobrazenej osi (Fáza 10a) */
  studyArea: SRange | undefined;
  focus: SRange | undefined;
  onStudyArea: (range: SRange) => void;
  /** zmena hodnoty zapne v profile nástroj „Oblasť mosta“ */
  areaToolRequest: number;
  /** ďalšie osi projektu a čiary v pôdoryse */
  otherAlignments: readonly Alignment[];
  planLines: readonly PlanLine[];
  onAddPlanLine: (points: Vec2[]) => void;
  onMovePlanLineVertex: (id: string, index: number, point: Vec2) => void;
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
  supportToolRequest,
  studyArea,
  focus,
  onStudyArea,
  areaToolRequest,
  otherAlignments,
  planLines,
  onAddPlanLine,
  onMovePlanLineVertex,
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
              supportToolRequest={supportToolRequest}
              studyArea={studyArea}
              focus={focus}
              otherAlignments={otherAlignments}
              planLines={planLines}
              onAddPlanLine={onAddPlanLine}
              onMovePlanLineVertex={onMovePlanLineVertex}
            />
            <ProfileView
              key={`${alignment.name}-profile`}
              alignment={alignment}
              cursorS={cursorS}
              onCursor={onProfileCursor}
              {...profile}
              selected={selectedId}
              studyArea={studyArea}
              focus={focus}
              onStudyArea={onStudyArea}
              areaToolRequest={areaToolRequest}
            />
          </div>
        )}
      </div>
    </main>
  );
}
