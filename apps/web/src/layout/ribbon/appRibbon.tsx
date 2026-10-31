import type { ReactNode } from 'react';
import { sk } from '../../i18n/sk.ts';
import type { BasemapKind } from '../../viewer/basemap.ts';
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
  onEditStudyArea: () => void;
  onImportLandXml: () => void;
  onImportTerrain: () => void;
  onDownloadDmr: () => void;
  onCancelDmr: () => void;
  onOpenLibrary: () => void;
  onInsertTwinExample: () => void;
  onDelete: () => void;
  onFit: (whole: boolean) => void;
  /** pole „Prejsť na“ */
  goTo: ReactNode;
  exaggeration: number;
  setExaggeration: (value: number) => void;
  decks: readonly { id: string; name: string }[];
  profileDeckId: string | undefined;
  setProfileDeckId: (id: string) => void;
  view3d: View3dState;
  setView3d: (changes: Partial<View3dState>) => void;
  onProjectInfo: () => void;
}

/** Ponúkané prevýšenia pozdĺžneho profilu (výšky : dĺžky); export je vždy 1 : 1. */
const EXAGGERATIONS = [1, 2, 5, 10];

const VIEW_ICONS = {
  '3d': 'cube',
  '2d': 'plan',
  section: 'section',
  parameters: 'parameters',
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
              id: 'delete',
              label: t.delete,
              icon: 'trash',
              title: t.deleteTitle,
              disabled: !c.hasSelection,
              onClick: c.onDelete,
            },
          ],
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
              options: (['none', 'ortofoto', 'mapa'] as const).map((k) => ({
                value: k,
                label: sk.viewer3d.basemaps[k],
              })),
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
          ],
        },
      ],
    },
  ];
}
