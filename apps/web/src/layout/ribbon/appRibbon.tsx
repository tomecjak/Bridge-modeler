import type { ReactNode } from 'react';
import { sk } from '../../i18n/sk.ts';
import { BASEMAP_KINDS, type BasemapKind } from '../../viewer/basemap.ts';
import type { ProfileTool } from '../../views/ProfileEditorView.tsx';
import type { ViewTool } from '../../views/viewState.ts';
import { VIEW_TABS, type ViewMode } from '../Viewport.tsx';
import type { RibbonButton, RibbonTab } from './Ribbon.tsx';

/** Prepínače 3D pohľadu z karty Pohľad. */
export interface View3dState {
  cut: boolean;
  terrain: boolean;
  basemap: BasemapKind;
  exact: boolean;
}

/** Stav a akcie aplikácie, z ktorých sa skladajú karty ribbonu. */
export interface RibbonContext {
  mode: ViewMode;
  setMode: (mode: ViewMode) => void;
  tool: ViewTool;
  setTool: (tool: ViewTool) => void;
  /** os cesty s niveletou, lokálny počiatok, NK, terén, vybraný prvok, beží sťahovanie DMR */
  hasRoad: boolean;
  hasOrigin: boolean;
  hasDeck: boolean;
  hasTerrain: boolean;
  hasSelection: boolean;
  dmrBusy: boolean;
  onInsertDeck: () => void;
  /** dialóg Vložiť rímsy (ADR 0023) */
  onInsertEdgeBeams: () => void;
  /** dialóg Rozloženie polí (ADR 0017) */
  onSpanLayout: () => void;
  onEditStudyArea: () => void;
  onImportLandXml: () => void;
  onImportTerrain: () => void;
  /** meračka z DXF (ADR 0021) */
  onImportSurvey: () => void;
  /** prekážka pod mostom (ADR 0020) */
  onInsertObstacle: () => void;
  onDownloadDmr: () => void;
  onCancelDmr: () => void;
  onOpenLibrary: () => void;
  /** knižnica podpier (ADR 0019) */
  onOpenSupportLibrary: () => void;
  onInsertTwinExample: () => void;
  onDelete: () => void;
  /** kópia vybraného prvku; undefined = vybraný prvok sa nedá kopírovať */
  onDuplicate: (() => void) | undefined;
  onRename: () => void;
  onFit: (whole: boolean) => void;
  /** pole „Prejsť na“ */
  goTo: ReactNode;
  exaggeration: number;
  setExaggeration: (value: number) => void;
  decks: readonly { id: string; name: string }[];
  profileDeckId: string | undefined;
  setProfileDeckId: (id: string) => void;
  /** os pozdĺžneho profilu (Fáza 10b) */
  profileAxis: string;
  profileAxes: readonly { value: string; label: string }[];
  setProfileAxis: (key: string) => void;
  /** terén na okrajoch NK v profile v osi mosta (len s terénom) */
  edgeTerrain: boolean;
  setEdgeTerrain: (on: boolean) => void;
  canEdgeTerrain: boolean;
  /** kóty v pôdoryse a profile */
  dimensions: boolean;
  setDimensions: (on: boolean) => void;
  /** mapový podklad pôdorysu (odpoveď 23); potrebuje počiatok projektu */
  planBasemap: BasemapKind;
  setPlanBasemap: (kind: BasemapKind) => void;
  view3d: View3dState;
  setView3d: (changes: Partial<View3dState>) => void;
  onProjectInfo: () => void;
  /** varianty návrhu (ADR 0024) a aktívny variant */
  variants: readonly { id: string; name: string }[];
  activeVariant: string;
  setActiveVariant: (id: string) => void;
}

/** Ponúkané prevýšenia pozdĺžneho profilu (výšky : dĺžky); export je vždy 1 : 1. */
const EXAGGERATIONS = [1, 2, 5, 10];

const VIEW_ICONS = {
  '3d': 'cube',
  '2d': 'plan',
  section: 'section',
  parameters: 'parameters',
  checks: 'checks',
} as const;

/** Karty ribbonu podľa druhu práce ako v Revite (ADR 0016). */
export function ribbonTabs(c: RibbonContext): RibbonTab[] {
  const t = sk.ribbon;
  /** nástroj pôdorysu / profilu: zapne 2D pohľad, druhý klik ho vypne */
  const toolButton = (
    id: ViewTool,
    label: string,
    icon: RibbonButton['icon'],
    title: string,
    disabled: boolean,
  ): RibbonButton => ({
    kind: 'button',
    id: `tool-${id}`,
    label,
    icon,
    title,
    disabled,
    pressed: c.tool === id,
    onClick: () => {
      if (c.tool === id) {
        c.setTool('none');
        return;
      }
      c.setMode('2d');
      c.setTool(id);
    },
  });
  const in2d = c.mode === '2d';
  const in3d = c.mode === '3d';
  const fitHere = in2d || in3d || c.mode === 'section';

  return [
    {
      id: 'home',
      label: t.tabs.home,
      groups: [
        {
          label: t.groups.variant,
          items: [
            {
              kind: 'select',
              id: 'variant',
              label: t.variant,
              title: t.variantTitle,
              value: c.activeVariant,
              options: c.variants.map((v) => ({ value: v.id, label: v.name })),
              onChange: c.setActiveVariant,
              disabled: c.variants.length < 2,
            },
          ],
        },
        {
          label: t.groups.bridge,
          items: [
            {
              kind: 'button',
              id: 'deck',
              label: t.deck,
              icon: 'deck',
              title: t.deckTitle,
              disabled: !c.hasRoad,
              onClick: c.onInsertDeck,
            },
            {
              kind: 'button',
              id: 'edge-beams',
              label: t.edgeBeams,
              icon: 'edgeBeam',
              title: t.edgeBeamsTitle,
              disabled: !c.hasDeck,
              onClick: c.onInsertEdgeBeams,
            },
            toolButton('bearingLine', t.bearingLine, 'bearingLine', t.bearingLineTitle, !c.hasDeck),
            {
              kind: 'button',
              id: 'span-layout',
              label: t.spanLayout,
              icon: 'spans',
              title: t.spanLayoutTitle,
              disabled: !c.hasDeck,
              onClick: c.onSpanLayout,
            },
            toolButton('support', t.support, 'pier', t.supportTitle, !c.hasDeck),
          ],
        },
        {
          label: t.groups.area,
          items: [
            toolButton('area', sk.studyArea.tool, 'area', sk.studyArea.toolTitle, !c.hasRoad),
            {
              kind: 'button',
              id: 'edit-area',
              label: t.editStudyArea,
              icon: 'rename',
              size: 'small',
              disabled: !c.hasRoad,
              onClick: c.onEditStudyArea,
            },
          ],
        },
        {
          label: t.groups.draw,
          items: [toolButton('line', t.line, 'line', t.lineTitle, !c.hasRoad)],
        },
      ],
    },
    {
      id: 'insert',
      label: t.tabs.insert,
      groups: [
        {
          label: t.groups.alignment,
          items: [
            {
              kind: 'button',
              id: 'landxml',
              label: t.landxml,
              icon: 'landxml',
              title: t.landxmlTitle,
              onClick: c.onImportLandXml,
            },
          ],
        },
        {
          label: t.groups.terrain,
          items: [
            {
              kind: 'button',
              id: 'terrain-file',
              label: t.terrainFile,
              icon: 'terrainFile',
              title: t.terrainFileTitle,
              disabled: !c.hasOrigin,
              onClick: c.onImportTerrain,
            },
            c.dmrBusy
              ? {
                  kind: 'button',
                  id: 'dmr',
                  label: t.cancelDmr,
                  icon: 'close',
                  title: sk.terrain.cancelDownload,
                  onClick: c.onCancelDmr,
                }
              : {
                  kind: 'button',
                  id: 'dmr',
                  label: t.dmr,
                  icon: 'dmr',
                  title: t.dmrTitle,
                  disabled: !c.hasRoad,
                  onClick: c.onDownloadDmr,
                },
          ],
        },
        {
          label: t.groups.survey,
          items: [
            {
              kind: 'button',
              id: 'survey-file',
              label: t.surveyFile,
              icon: 'survey',
              title: t.surveyFileTitle,
              onClick: c.onImportSurvey,
            },
          ],
        },
        {
          label: t.groups.obstacle,
          items: [
            {
              kind: 'button',
              id: 'obstacle',
              label: sk.obstacles.insert,
              icon: 'obstacle',
              title: sk.obstacles.insertTitle,
              disabled: !c.hasRoad,
              onClick: c.onInsertObstacle,
            },
          ],
        },
        {
          label: t.groups.profile,
          items: [
            {
              kind: 'button',
              id: 'library',
              label: t.library,
              icon: 'library',
              title: t.libraryTitle,
              onClick: c.onOpenLibrary,
            },
            {
              kind: 'button',
              id: 'twin',
              label: t.twinExample,
              icon: 'twinDeck',
              title: sk.section.insertExample,
              disabled: !c.hasRoad,
              onClick: c.onInsertTwinExample,
            },
          ],
        },
      ],
    },
    {
      id: 'modify',
      label: t.tabs.modify,
      groups: [
        {
          label: t.groups.element,
          items: [
            {
              kind: 'button',
              id: 'duplicate',
              label: t.duplicate,
              icon: 'duplicate',
              title: t.duplicateTitle,
              disabled: !c.onDuplicate,
              onClick: () => c.onDuplicate?.(),
            },
            {
              kind: 'button',
              id: 'rename',
              label: t.rename,
              icon: 'rename',
              title: t.renameTitle,
              disabled: !c.hasSelection,
              onClick: c.onRename,
            },
            {
              kind: 'button',
              id: 'delete',
              label: t.delete,
              icon: 'trash',
              title: t.deleteTitle,
              disabled: !c.hasSelection,
              onClick: c.onDelete,
            },
          ],
        },
        {
          label: t.groups.measure,
          items: [toolButton('measure', t.measure, 'measure', t.measureTitle, !c.hasRoad)],
        },
      ],
    },
    {
      id: 'view',
      label: t.tabs.view,
      groups: [
        {
          label: t.groups.navigation,
          items: [
            {
              kind: 'button',
              id: 'fit',
              label: t.fit,
              icon: 'fit',
              title: t.fitTitle,
              disabled: !fitHere,
              onClick: () => c.onFit(false),
            },
            {
              kind: 'button',
              id: 'whole',
              label: t.wholeAxis,
              icon: 'wholeAxis',
              size: 'small',
              disabled: !in2d,
              onClick: () => c.onFit(true),
            },
            { kind: 'custom', id: 'goto', node: c.goTo },
          ],
        },
        {
          label: t.groups.plan,
          items: [
            {
              kind: 'select',
              id: 'plan-basemap',
              label: t.basemap,
              title: t.planBasemapTitle,
              value: c.planBasemap,
              options: BASEMAP_KINDS.map((k) => ({ value: k, label: sk.viewer3d.basemaps[k] })),
              onChange: (v) => c.setPlanBasemap(v as BasemapKind),
              disabled: !in2d || !c.hasOrigin,
            },
          ],
        },
        {
          label: t.groups.longitudinal,
          items: [
            {
              kind: 'select',
              id: 'exaggeration',
              label: t.exaggeration,
              value: String(c.exaggeration),
              options: EXAGGERATIONS.map((k) => ({ value: String(k), label: `${k}×` })),
              onChange: (v) => c.setExaggeration(Number(v)),
              disabled: !in2d,
            },
            ...(c.decks.length > 1
              ? [
                  {
                    kind: 'select' as const,
                    id: 'profile-deck',
                    label: t.profileDeck,
                    value: c.profileDeckId ?? '',
                    options: c.decks.map((d) => ({ value: d.id, label: d.name })),
                    onChange: c.setProfileDeckId,
                    disabled: !in2d,
                  },
                ]
              : []),
            {
              kind: 'select',
              id: 'profile-axis',
              label: t.profileAxis,
              title: t.profileAxisTitle,
              value: c.profileAxis,
              options: [...c.profileAxes],
              onChange: c.setProfileAxis,
              disabled: !in2d || c.profileAxes.length < 2,
            },
            {
              kind: 'button',
              id: 'edge-terrain',
              label: t.edgeTerrain,
              icon: 'terrain',
              title: t.edgeTerrainTitle,
              size: 'small',
              disabled: !in2d || !c.canEdgeTerrain,
              pressed: c.edgeTerrain && c.canEdgeTerrain,
              onClick: () => c.setEdgeTerrain(!c.edgeTerrain),
            },
            {
              kind: 'button',
              id: 'dimensions',
              label: t.dimensionsToggle,
              icon: 'dimensions',
              title: t.dimensionsTitle,
              size: 'small',
              disabled: !in2d || !c.hasDeck,
              pressed: c.dimensions,
              onClick: () => c.setDimensions(!c.dimensions),
            },
          ],
        },
        {
          label: t.groups.view3d,
          items: [
            {
              kind: 'button',
              id: 'cut',
              label: t.cut,
              icon: 'cut',
              title: sk.viewer3d.cutTitle,
              disabled: !in3d,
              pressed: c.view3d.cut,
              onClick: () => c.setView3d({ cut: !c.view3d.cut }),
            },
            {
              kind: 'button',
              id: 'terrain3d',
              label: t.terrain,
              icon: 'terrain',
              title: c.hasTerrain ? t.terrain : sk.viewer3d.terrainDownloadTitle,
              disabled: !in3d || c.dmrBusy,
              pressed: c.view3d.terrain && c.hasTerrain,
              onClick: () => {
                // bez terénu zapnutie stiahne DMR 5.0 zo ZBGIS
                if (!c.hasTerrain) {
                  c.setView3d({ terrain: true });
                  c.onDownloadDmr();
                } else c.setView3d({ terrain: !c.view3d.terrain });
              },
            },
            {
              kind: 'button',
              id: 'exact',
              label: t.exact,
              icon: 'cube',
              title: sk.viewer3d.exactTitle,
              disabled: !in3d || !c.hasDeck,
              pressed: c.view3d.exact,
              onClick: () => c.setView3d({ exact: !c.view3d.exact }),
            },
            {
              kind: 'select',
              id: 'basemap',
              label: t.basemap,
              value: c.view3d.basemap,
              options: BASEMAP_KINDS.map((k) => ({ value: k, label: sk.viewer3d.basemaps[k] })),
              onChange: (v) => c.setView3d({ basemap: v as BasemapKind }),
              disabled: !in3d || !c.hasTerrain || !c.view3d.terrain,
            },
          ],
        },
        {
          label: t.groups.windows,
          items: VIEW_TABS.map((v) => ({
            kind: 'button' as const,
            id: `window-${v.mode}`,
            label: v.label,
            icon: VIEW_ICONS[v.mode],
            size: 'small' as const,
            pressed: c.mode === v.mode,
            onClick: () => c.setMode(v.mode),
          })),
        },
      ],
    },
    {
      id: 'manage',
      label: t.tabs.manage,
      groups: [
        {
          label: t.groups.project,
          items: [
            {
              kind: 'button',
              id: 'project-info',
              label: t.projectInfo,
              icon: 'info',
              title: t.projectInfoTitle,
              onClick: c.onProjectInfo,
            },
            {
              kind: 'button',
              id: 'parameters',
              label: t.parameters,
              icon: 'parameters',
              onClick: () => c.setMode('parameters'),
            },
          ],
        },
        {
          label: t.groups.library,
          items: [
            {
              kind: 'button',
              id: 'library-manage',
              label: t.libraryManage,
              icon: 'library',
              onClick: c.onOpenLibrary,
            },
            {
              kind: 'button',
              id: 'support-library-manage',
              label: t.supportLibraryManage,
              icon: 'pier',
              title: sk.supportLibrary.libraryTitle,
              onClick: c.onOpenSupportLibrary,
            },
          ],
        },
      ],
    },
  ];
}

/** Výber typu pre nástroj Podpera: hodnota a možnosti pre pilier a oporu. */
export interface PlacementContext {
  pier: { value: string; options: readonly { value: string; label: string }[] };
  abutment: { value: string; options: readonly { value: string; label: string }[] };
  onChange: (kind: 'pier' | 'abutment', value: string) => void;
  onOpenLibrary: () => void;
}

/**
 * Kontextová karta nástroja Podpera „Umiestniť | Podpera“ (ako „Modify | Place …“ v Revite, ADR 0019): typ piliera
 * a opory, ktorý vloží klik na os, a knižnica podpier.
 */
export function placementTab(c: PlacementContext): RibbonTab {
  const t = sk.supportLibrary;
  return {
    id: 'contextual',
    label: t.placeTab(sk.ribbon.support),
    contextual: true,
    groups: [
      {
        label: t.types,
        items: (['pier', 'abutment'] as const).map((kind) => ({
          kind: 'select' as const,
          id: `place-${kind}`,
          label: kind === 'pier' ? t.pierType : t.abutmentType,
          value: c[kind].value,
          options: c[kind].options,
          onChange: (v: string) => c.onChange(kind, v),
        })),
      },
      {
        label: sk.ribbon.groups.library,
        items: [
          {
            kind: 'button',
            id: 'place-library',
            label: t.library,
            icon: 'library',
            title: t.libraryTitle,
            onClick: c.onOpenLibrary,
          },
        ],
      },
    ],
  };
}

/** Druh vybraného prvku pre kontextovú kartu „Upraviť | …“. */
export type ContextualKind =
  | 'profile'
  | 'support'
  | 'bearingLine'
  | 'deck'
  | 'edgeBeam'
  | 'planLine'
  | 'terrain'
  | 'bridgeAxis'
  | 'obstacle'
  | 'survey';

export interface ContextualContext {
  kind: ContextualKind;
  /** názov druhu v karte (napr. „Prierez“) */
  label: string;
  onDelete: () => void;
  onDuplicate: (() => void) | undefined;
  onRename: () => void;
  /** podpera, NK: prierez na jej staničení */
  onShowInSection: () => void;
  /** NK: nástroj Podpera, rozloženie polí a prechod do editora jej prierezu (aj prierezu rímsy) */
  onAddSupport: () => void;
  onSpanLayout: () => void;
  /** NK: vložiť rímsy (ADR 0023) */
  onInsertEdgeBeams: () => void;
  /** os uloženia bez podpery: vložiť na ňu podperu (ADR 0017) */
  onSupportOnLine: (() => void) | undefined;
  onEditProfile: () => void;
  /** čiara: tabuľka vrcholov; terén: stiahnuť znova (len DMR zo ZBGIS); os mosta: posuny */
  onVertices: () => void;
  /** čiara: prekážka s osou v tejto čiare (ADR 0020) */
  onObstacleFromLine: () => void;
  onRedownload: (() => void) | undefined;
  onAxisOffset: (which: 'horizontalOffset' | 'verticalOffset') => void;
  /** NK: profil v jej osi mosta; čiara: profil v čiare (Fáza 10b) */
  onProfileHere: () => void;
  /** editor prierezu (Fáza 8b) */
  profileTool: ProfileTool;
  setProfileTool: (tool: ProfileTool) => void;
  loopRole: 'outer' | 'void';
  setLoopRole: (role: 'outer' | 'void') => void;
  onProfileTables: () => void;
}

const PROFILE_TOOL_ICONS: Record<ProfileTool, RibbonButton['icon']> = {
  select: 'pointer',
  point: 'goTo',
  loop: 'line',
  delete: 'trash',
};

/** Kontextová karta pri výbere prvku (ako „Modify | …“ v Revite). */
export function contextualTab(c: ContextualContext): RibbonTab {
  const t = sk.ribbon;
  const button = (
    id: string,
    label: string,
    icon: RibbonButton['icon'],
    onClick: () => void,
    title?: string,
  ): RibbonButton => ({ kind: 'button', id, label, icon, onClick, ...(title ? { title } : {}) });
  const element = {
    label: t.groups.element,
    items: [
      ...(c.onDuplicate
        ? [button('ctx-duplicate', t.duplicate, 'duplicate', c.onDuplicate, t.duplicateTitle)]
        : []),
      button('ctx-rename', t.rename, 'rename', c.onRename, t.renameTitle),
      button('ctx-delete', t.delete, 'trash', c.onDelete, t.deleteTitle),
    ],
  };
  const specific: RibbonTab['groups'] = (() => {
    switch (c.kind) {
      case 'profile':
        return [
          {
            label: t.groups.tools,
            items: (['select', 'point', 'loop', 'delete'] as const).map((tool) => ({
              kind: 'button' as const,
              id: `profile-${tool}`,
              label: sk.profileEditor.tools[tool],
              icon: PROFILE_TOOL_ICONS[tool],
              title: sk.profileEditor.hints[tool],
              pressed: c.profileTool === tool,
              onClick: () => c.setProfileTool(tool),
            })),
          },
          {
            label: t.groups.loopRole,
            items: [
              {
                kind: 'select' as const,
                id: 'loop-role',
                label: sk.elements.role,
                value: c.loopRole,
                options: (['outer', 'void'] as const).map((r) => ({
                  value: r,
                  label: sk.elements.roles[r],
                })),
                onChange: (v: string) => c.setLoopRole(v as 'outer' | 'void'),
              },
            ],
          },
          {
            label: t.groups.profile,
            items: [
              button('profile-tables', sk.properties.tables, 'parameters', c.onProfileTables),
            ],
          },
        ];
      case 'support':
        return [
          {
            label: t.groups.support,
            items: [button('support-section', t.showInSection, 'section', c.onShowInSection)],
          },
        ];
      case 'bearingLine':
        return [
          {
            label: t.groups.support,
            items: [
              ...(c.onSupportOnLine
                ? [button('line-support', sk.bearingLines.addSupport, 'pier', c.onSupportOnLine)]
                : []),
              button('line-section', t.showInSection, 'section', c.onShowInSection),
            ],
          },
        ];
      case 'deck':
        return [
          {
            label: t.groups.bridge,
            items: [
              button('deck-spans', t.spanLayout, 'spans', c.onSpanLayout, t.spanLayoutTitle),
              button('deck-support', t.support, 'pier', c.onAddSupport, t.supportTitle),
              button(
                'deck-edge-beams',
                t.edgeBeams,
                'edgeBeam',
                c.onInsertEdgeBeams,
                t.edgeBeamsTitle,
              ),
              button('deck-profile', t.editProfile, 'section', c.onEditProfile),
              button('deck-section', t.showInSection, 'section', c.onShowInSection),
              button('deck-longitudinal', t.profileInAxis, 'profile', c.onProfileHere),
            ],
          },
        ];
      case 'edgeBeam':
        return [
          {
            label: t.groups.bridge,
            items: [
              button('edge-beam-profile', t.editProfile, 'section', c.onEditProfile),
              button('edge-beam-section', t.showInSection, 'section', c.onShowInSection),
            ],
          },
        ];
      case 'planLine':
        return [
          {
            label: t.groups.line,
            items: [
              button('line-vertices', t.vertices, 'line', c.onVertices),
              button('line-profile', t.profileInLine, 'profile', c.onProfileHere),
              button('line-obstacle', sk.obstacles.fromLine, 'obstacle', c.onObstacleFromLine),
            ],
          },
        ];
      case 'terrain':
        return c.onRedownload
          ? [
              {
                label: t.groups.terrain,
                items: [button('terrain-redownload', sk.terrain.redownload, 'dmr', c.onRedownload)],
              },
            ]
          : [];
      case 'obstacle':
        return [];
      case 'survey':
        return [
          {
            label: t.groups.survey,
            items: [
              button('survey-obstacle', sk.survey.obstacle, 'obstacle', c.onObstacleFromLine),
            ],
          },
        ];
      case 'bridgeAxis':
        return [
          {
            label: t.groups.axis,
            items: [
              button('axis-h', t.horizontalOffset, 'axis', () =>
                c.onAxisOffset('horizontalOffset'),
              ),
              button('axis-v', t.verticalOffset, 'axis', () => c.onAxisOffset('verticalOffset')),
            ],
          },
        ];
    }
  })();
  return {
    id: 'contextual',
    label: t.contextual(c.label),
    contextual: true,
    groups: [...specific, element],
  };
}
