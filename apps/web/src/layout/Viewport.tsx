import type { Alignment } from '@bridge/alignment';
import type { DimensionChain, Drawing } from '@bridge/drawing';
import type { Vec2 } from '@bridge/geom';
import type { PlanLine } from '@bridge/model';
import type { ProfileLine } from '@bridge/sections';
import type { ReactNode } from 'react';
import { sk } from '../i18n/sk.ts';
import type { ProfileFreeHeight } from '../store/obstacles.ts';
import type { EdgeTerrain } from '../store/profile.ts';
import type { BasemapSource } from '../viewer/basemap.ts';
import type { DimensionMarker } from '../views/Dimensions.tsx';
import type { LineEditing } from '../views/lineEdit.ts';
import { type PlanCursor, type PlanDimensionSet, PlanView } from '../views/PlanView.tsx';
import { type ProfileCursor, ProfileView } from '../views/ProfileView.tsx';
import type { FitRequest, ViewTool } from '../views/viewState.ts';
import type { SRange } from '../views/viewTransform.ts';
import type { BaseView } from './Toolbar.tsx';

export type ViewMode = '3d' | '2d' | 'section' | 'parameters' | 'checks';

export type { BaseView };

interface Props {
  /** zobrazený pohľad; prierez, parametre a kontroly sú samostatné okná (ADR 0025) */
  view: BaseView;
  /** lišta nástrojov nad pohľadmi */
  toolbar: ReactNode;
  /** prázdny projekt bez osi (import LandXML a podkladov) */
  empty: ReactNode;
  alignment: Alignment | undefined;
  cursorS: number | undefined;
  onPlanCursor: (cursor: PlanCursor | undefined) => void;
  onProfileCursor: (cursor: ProfileCursor | undefined) => void;
  /** bod kurzora z profilu na čiare profilu (značka v pôdoryse) */
  planCursorPoint: Vec2 | undefined;
  /** výsledok nástroja Merať */
  onMeasure: (text: string | undefined) => void;
  /** kóty mosta v pôdoryse a kóty NK v reze profilu (len na obrazovke) */
  planDimensions: readonly PlanDimensionSet[] | undefined;
  profileDimensions: readonly DimensionChain[] | undefined;
  /** osi uloženia v krúžkoch nad kótami profilu (ADR 0025) */
  profileMarkers: readonly DimensionMarker[] | undefined;
  /** voľné výšky prekážok v profile (ADR 0020), len pri zapnutých kótach */
  profileFreeHeights: readonly ProfileFreeHeight[] | undefined;
  /** pôdorys mosta */
  plan: Drawing | undefined;
  /** mapový podklad pôdorysu a počiatok projektu v S-JTSK (odpoveď 23) */
  planBasemap: { source: BasemapSource; origin: Vec2 } | undefined;
  /** pozdĺžny profil v zvolenej osi (Fáza 10b): čiara, výkres, kľúč osi a názov */
  profile:
    | {
        line: ProfileLine;
        drawing: Drawing | undefined;
        axis: string;
        title: string;
        edgeTerrain: EdgeTerrain | undefined;
      }
    | undefined;
  /** vkladanie a úpravy osí uloženia a podpier v pôdoryse a profile (ADR 0017) */
  lineEditing: LineEditing | undefined;
  /** stav pohľadov z ribbonu (ADR 0016) */
  tool: ViewTool;
  onTool: (tool: ViewTool) => void;
  fitRequest: FitRequest;
  exaggeration: number;
  /** oblasť mosta a úsek na prispôsobenie pohľadov v spojitom staničení zobrazenej osi (Fáza 10a) */
  studyArea: SRange | undefined;
  focus: SRange | undefined;
  onStudyArea: (range: SRange) => void;
  /** prejsť na staničenie v pôdoryse aj profile (nová hodnota `nonce`) */
  goTo: { s: number; nonce: number } | undefined;
  /** ďalšie osi projektu a čiary v pôdoryse */
  otherAlignments: readonly Alignment[];
  planLines: readonly PlanLine[];
  onAddPlanLine: (points: Vec2[]) => void;
  onMovePlanLineVertex: (id: string, index: number, point: Vec2) => void;
  /** priečny rez na staničení (v 2D vpravo dole) */
  crossSection: ReactNode;
  view3d: ReactNode;
  selectedId: string | undefined;
}

/** Okná a pohľady (pre ribbonTabs; 3D a 2D sú v prepínači lišty nástrojov). */
export const VIEW_TABS: { mode: ViewMode; label: string }[] = [
  { mode: '3d', label: sk.viewport.tabs.view3d },
  { mode: '2d', label: sk.viewport.tabs.view2d },
  { mode: 'section', label: sk.section.tab },
  { mode: 'parameters', label: sk.parameters.tab },
  { mode: 'checks', label: sk.checks.tab },
];

/**
 * Pracovná plocha (ADR 0025): lišta nástrojov a 3D alebo 2D výkresy.
 * V 2D je pôdorys hore, pozdĺžny rez a priečny rez pod ním.
 */
export function Viewport({
  view,
  toolbar,
  empty,
  alignment,
  cursorS,
  onPlanCursor,
  onProfileCursor,
  planCursorPoint,
  onMeasure,
  planDimensions,
  profileDimensions,
  profileMarkers,
  profileFreeHeights,
  crossSection,
  plan,
  planBasemap,
  profile,
  lineEditing,
  tool,
  onTool,
  fitRequest,
  exaggeration,
  studyArea,
  focus,
  onStudyArea,
  goTo,
  otherAlignments,
  planLines,
  onAddPlanLine,
  onMovePlanLineVertex,
  view3d,
  selectedId,
}: Props) {
  return (
    <main className="viewport">
      {toolbar}
      <div className="viewport-canvas" id="viewport-canvas">
        {view === '3d' && view3d}
        {view === '2d' && !alignment && empty}
        {view === '2d' && alignment && (
          <div className="drawings">
            <PlanView
              key={alignment.name}
              alignment={alignment}
              cursorS={cursorS}
              cursorPoint={planCursorPoint}
              onCursor={onPlanCursor}
              drawing={plan}
              selected={selectedId}
              lineEditing={lineEditing}
              tool={tool}
              onTool={onTool}
              fitRequest={fitRequest}
              studyArea={studyArea}
              focus={focus}
              goTo={goTo}
              otherAlignments={otherAlignments}
              planLines={planLines}
              onAddPlanLine={onAddPlanLine}
              onMovePlanLineVertex={onMovePlanLineVertex}
              profileLine={
                profile && profile.line.kind !== 'road' && profile.line.kind !== 'bridgeAxis'
                  ? profile.line.points.map((p) => p.point)
                  : undefined
              }
              onMeasure={onMeasure}
              dimensions={planDimensions}
              basemap={planBasemap}
            />
            <div className="drawings-bottom">
              <div className="drawing-cell">
                {profile && (
                  <ProfileView
                    key={`${alignment.name}-profile-${profile.axis}`}
                    line={profile.line}
                    title={profile.title}
                    cursorS={cursorS}
                    onCursor={onProfileCursor}
                    drawing={profile.drawing}
                    edgeTerrain={profile.edgeTerrain}
                    selected={selectedId}
                    exaggeration={exaggeration}
                    tool={tool}
                    onTool={onTool}
                    fitRequest={fitRequest}
                    studyArea={studyArea}
                    focus={focus}
                    onStudyArea={onStudyArea}
                    goTo={goTo}
                    onMeasure={onMeasure}
                    dimensions={profileDimensions}
                    markers={profileMarkers}
                    freeHeights={profileFreeHeights}
                    lineEditing={lineEditing}
                  />
                )}
              </div>
              <section className="drawing-cell" aria-label={sk.viewport.section}>
                {crossSection}
              </section>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
