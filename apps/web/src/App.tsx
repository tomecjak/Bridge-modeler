import { type AlignmentIssue, formatStation } from '@bridge/alignment';
import {
  bridgeDimensions,
  type DeckDrawingData,
  type Drawing,
  planDrawing,
  profileDrawing,
  projectSupport,
  sectionDrawing,
  toDxf,
  toSvg,
  translate,
} from '@bridge/drawing';
import { azimuthToVector, type Vec2, vec2 } from '@bridge/geom';
import {
  type BearingLine,
  createEmptyProject,
  openProject,
  type Support,
  type TerrainSurface,
} from '@bridge/model';
import {
  type AxisLength,
  bridgeAxisPlan,
  type DeckRange,
  evaluateSuperstructure,
  globalScope,
  layoutStations,
  moveLine,
  profileParameterValues,
  SPAN_SNAP,
  setSpanLength,
  snapToPrevious,
  twinDeckExample,
} from '@bridge/sections';
import {
  bridgeRanges,
  type CorridorOptions,
  corridorAround,
  deckRanges,
  studyRanges,
} from '@bridge/terrain';
import { type DragEvent, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { type CursorInfo, formatCursor } from './format/cursor.ts';
import { formatModelIssue } from './i18n/modelIssues.ts';
import { sk } from './i18n/sk.ts';
import { formatTerrainIssue } from './i18n/terrainIssues.ts';
import { fileLevelIssues, importLandXml } from './import/importLandXml.ts';
import {
  buildTerrain,
  DEFAULT_TERRAIN_MARGIN,
  downloadTerrain,
  isTerrainFile,
  readTerrainFile,
  type TerrainCandidate,
  type TerrainFile,
  WHOLE_AXIS_TERRAIN_LIMIT,
} from './import/importTerrain.ts';
import { DeckInsertDialog } from './layout/DeckInsertDialog.tsx';
import { ParameterPanel } from './layout/ParameterPanel.tsx';
import { ProfileLibraryDialog } from './layout/ProfileLibraryDialog.tsx';
import { ProjectBrowser } from './layout/ProjectBrowser.tsx';
import { AxisOffsetDialog } from './layout/properties/AxisOffsetDialog.tsx';
import { BearingsDialog } from './layout/properties/BearingsDialog.tsx';
import {
  bearingLineSheet,
  deckSheet,
  profileSheet,
  supportSheet,
} from './layout/properties/elementSheets.tsx';
import { PlanLineVerticesDialog } from './layout/properties/PlanLineVerticesDialog.tsx';
import { ProfileLawDialog } from './layout/properties/ProfileLawDialog.tsx';
import { ProfileTablesDialog } from './layout/properties/ProfileTablesDialog.tsx';
import { ProjectInfoDialog } from './layout/properties/ProjectInfoDialog.tsx';
import { PropertiesPalette } from './layout/properties/PropertyGrid.tsx';
import {
  alignmentSheet,
  bridgeAxisSheet,
  planLineSheet,
  studyAreaSheet,
  terrainSheet,
  viewSheet,
} from './layout/properties/simpleSheets.tsx';
import { AppMenu, type MenuSection } from './layout/ribbon/AppMenu.tsx';
import {
  type ContextualKind,
  contextualTab,
  ribbonTabs,
  type View3dState,
} from './layout/ribbon/appRibbon.tsx';
import { Ribbon } from './layout/ribbon/Ribbon.tsx';
import { TitleBar } from './layout/ribbon/TitleBar.tsx';
import {
  type SpanLayoutDefaults,
  SpanLayoutDialog,
  type SpanLayoutForm,
} from './layout/SpanLayoutDialog.tsx';
import { TerrainImportDialog } from './layout/TerrainImportDialog.tsx';
import { VIEW_TABS, type ViewMode, Viewport } from './layout/Viewport.tsx';
import { loadAutosave, startAutosave } from './persistence/autosave.ts';
import { downloadProject, downloadText } from './persistence/fileIO.ts';
import { drawingFileName } from './persistence/fileName.ts';
import { nextLineName } from './store/bearingLines.ts';
import { type BrowserTarget, browserTree } from './store/browserTree.ts';
import type { Command, ElementCollection } from './store/commands.ts';
import { alignmentsByName, useEvaluatedAlignments } from './store/derived.ts';
import { useDeckDrawings } from './store/drawings.ts';
import { duplicateElement } from './store/duplicate.ts';
import { issuesOf, newId, useParameterState } from './store/parameters.ts';
import { type ProfileAxisKey, useProfileView } from './store/profile.ts';
import { projectStore, useProject } from './store/projectStore.ts';
import { useSectionResults } from './store/sections.ts';
import { planSpanLayout, type SupportFactory } from './store/spanLayout.ts';
import {
  defaultGeometry,
  defaultSupport,
  useAxisLengths,
  useSupportState,
} from './store/supports.ts';
import {
  terrainCrossSections,
  terrainProfiles,
  terrainProfilesAlong,
  useTerrainTins,
} from './store/terrain.ts';
import type { Cut } from './viewer/sceneView.ts';
import { deckReach, planFrame } from './views/Dimensions.tsx';
import { GoToStation } from './views/GoToStation.tsx';
import type { LineEditing, LineHandle, LinePreview } from './views/lineEdit.ts';
import { ParameterTable } from './views/ParameterTable.tsx';
import type { PlanDimensionSet } from './views/PlanView.tsx';
import { ProfileEditorView, type ProfileTool } from './views/ProfileEditorView.tsx';
import { SectionView } from './views/SectionView.tsx';
import { StationControl } from './views/StationControl.tsx';
import type { FitRequest, ViewTool } from './views/viewState.ts';

// three.js je veľký → 3D náhľad sa načíta až pri otvorení záložky (samostatný chunk)
const Viewer3D = lazy(() => import('./viewer/Viewer3D.tsx'));

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
  const [openErrors, setOpenErrors] = useState<string[]>([]);
  const [selectedParameterId, setSelectedParameterId] = useState<string>();
  const [referenceStation, setReferenceStation] = useState<number>();
  const [selectedElement, setSelectedElement] = useState<{
    collection: ElementCollection;
    id: string;
  }>();
  const [sectionStation, setSectionStation] = useState<number>();
  /** NK, v osi ktorej je pozdĺžny rez (výber v profile); inak vybraná alebo prvá NK */
  const [profileDeckId, setProfileDeckId] = useState<string>();
  /** os pozdĺžneho profilu (Fáza 10b); bez voľby os mosta NK, inak os cesty */
  const [profileAxisKey, setProfileAxisKey] = useState<ProfileAxisKey>();
  /** terén na okrajoch NK v profile v osi mosta (Fáza 10b) */
  const [edgeTerrainOn, setEdgeTerrainOn] = useState(true);
  /** výsledok nástroja Merať v stavovom riadku */
  const [measureText, setMeasureText] = useState<string>();
  /** kóty mosta v pôdoryse a profile (len na obrazovke, Fáza 10b) */
  const [dimensionsOn, setDimensionsOn] = useState(true);
  const [terrainFile, setTerrainFile] = useState<TerrainFile>();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [deckDialog, setDeckDialog] = useState(false);
  /** dialóg Rozloženie polí pre NK (id) */
  const [spanLayoutDeck, setSpanLayoutDeck] = useState<string>();
  /** vybraný bod v editore prierezu (zvýraznený aj v tabuľke bodov) */
  const [profilePoint, setProfilePoint] = useState<string>();
  const [terrainBusy, setTerrainBusy] = useState(false);
  /** priebeh sťahovania DMR 5.0 zo ZBGIS [%]; undefined = nesťahuje sa */
  const [dmrProgress, setDmrProgress] = useState<number>();
  const dmrCancel = useRef(false);
  /** výber mimo prvkov mosta (oblasť mosta, os cesty); bez výberu sa vpravo ukážu vlastnosti pohľadu */
  const [panelTarget, setPanelTarget] = useState<'studyArea' | 'alignment'>();
  /** dialógy: informácie o projekte, posun osi mosta, vrcholy čiary */
  const [projectInfoOpen, setProjectInfoOpen] = useState(false);
  const [axisOffset, setAxisOffset] = useState<{
    axisId: string;
    which: 'horizontalOffset' | 'verticalOffset';
  }>();
  const [planLineVertices, setPlanLineVertices] = useState<string>();
  const [bearingsOf, setBearingsOf] = useState<string>();
  const [lawDialog, setLawDialog] = useState<{ deckId: string; parameter: string }>();
  const [profileTables, setProfileTables] = useState<string>();
  /** Upraviť → Premenovať začne premenovanie vybraného prvku v prehliadači */
  const [renameRequest, setRenameRequest] = useState<{ key: string; nonce: number }>();
  /** nástroj a druh nového obrysu v editore prierezu (kontextová karta) */
  const [profileTool, setProfileTool] = useState<ProfileTool>('select');
  const [loopRole, setLoopRole] = useState<'outer' | 'void'>('void');
  /** stav pohľadov ovládaný ribbonom (ADR 0016) */
  const [ribbonTab, setRibbonTab] = useState('home');
  const [tool, setTool] = useState<ViewTool>('none');
  const [fitRequest, setFitRequest] = useState<FitRequest>({ whole: false, nonce: 0 });
  const [exaggeration, setExaggeration] = useState(10);
  const [view3d, setView3dState] = useState<View3dState>({
    cut: false,
    terrain: true,
    basemap: 'none',
    exact: false,
  });
  const setView3d = (changes: Partial<View3dState>) =>
    setView3dState((v) => ({ ...v, ...changes }));
  /** presný model je vypočítaný → dá sa exportovať STEP; žiadosť o export z menu Súbor */
  const [exactReady, setExactReady] = useState(false);
  const [stepRequest, setStepRequest] = useState<{ sjtsk: boolean; nonce: number }>();
  const projectInput = useRef<HTMLInputElement>(null);
  /** „Prejsť na“ staničenie v pôdoryse aj profile (spojité s; nonce zopakuje rovnaké staničenie) */
  const [goTo, setGoTo] = useState<{ s: number; nonce: number }>();
  const landXmlInput = useRef<HTMLInputElement>(null);
  const terrainInput = useRef<HTMLInputElement>(null);

  const item = alignments[selected];
  const parameterState = useParameterState(item?.alignment.stationing);
  const displayRange = item
    ? {
        from: item.alignment.stationing.toDisplay(0).station,
        to: item.alignment.stationing.toDisplay(item.alignment.length).station,
      }
    : undefined;
  const station = referenceStation ?? displayRange?.from ?? 0;
  const selectedParameter = project.parameters.find((p) => p.id === selectedParameterId);
  const alignmentMap = useMemo(() => alignmentsByName(alignments), [alignments]);
  const sectionContext = useMemo(
    () =>
      project.crs.origin
        ? {
            alignments: alignmentMap,
            parameters: parameterState.set,
            bridgeAxes: project.bridgeAxes,
            profiles: project.profiles,
            planLines: project.planLines,
          }
        : undefined,
    [
      alignmentMap,
      parameterState.set,
      project.bridgeAxes,
      project.profiles,
      project.planLines,
      project.crs.origin,
    ],
  );
  const sectionRange = project.superstructures.length
    ? {
        from: Math.min(...project.superstructures.map((s) => s.from)),
        to: Math.max(...project.superstructures.map((s) => s.to)),
      }
    : displayRange;
  const sectionAt =
    sectionStation ?? (sectionRange ? (sectionRange.from + sectionRange.to) / 2 : 0);
  const sections = useSectionResults(alignmentMap, parameterState.set, sectionAt);
  const axisLengths = useAxisLengths(alignmentMap, parameterState.set);
  const supportState = useSupportState(alignmentMap, parameterState.set, axisLengths);
  const selectedSuperstructureId =
    selectedElement?.collection === 'superstructures' ? selectedElement.id : undefined;

  const tins = useTerrainTins();
  const road = item?.alignment;
  const sectionTerrain = useMemo(() => {
    const s = road?.stationing.fromDisplay(sectionAt);
    if (!road || s === undefined || tins.length === 0) return [];
    const halfWidth = Math.max(...project.terrains.map((t) => t.corridor.halfWidth));
    return terrainCrossSections(tins, road, s, halfWidth);
  }, [tins, road, sectionAt, project.terrains]);

  /** Rez v 3D: rovina kolmá na os mosta prvej NK na staničení prierezu, uzávery z prierezov NK. */
  const cut = useMemo((): Cut | undefined => {
    const withAxis = sections.results.flatMap((r) => (r.section?.axis ? [r.section] : []));
    const axis = withAxis[0]?.axis;
    if (!axis) return undefined;
    const t = axis.frame.tangent;
    const th = Math.hypot(t.x, t.y);
    return {
      origin: axis.point,
      normal: { x: t.x / th, y: t.y / th, z: 0 },
      sections: withAxis.map((sec) =>
        sec.loops.map((l) => ({
          role: l.role,
          plane: l.polygon,
          points: l.polygon.map(sec.toWorld),
        })),
      ),
    };
  }, [sections.results]);

  /**
   * Rozsah novej NK (zobrazované staničenie): oblasť mosta na zobrazenej osi, inak štvrtina rozsahu nivelety,
   * najviac 200 m.
   */
  function defaultDeckRange():
    | { road: NonNullable<typeof item>['alignment']; from: number; to: number }
    | undefined {
    const road = item?.alignment;
    const profile = road?.profile;
    if (!road || !profile) return undefined;
    const area = project.studyArea;
    if (area && area.alignment === road.name) return { road, from: area.from, to: area.to };
    const start = road.stationing.toDisplay(profile.startS).station;
    const end = road.stationing.toDisplay(profile.endS).station;
    const from = Math.round(start + (end - start) * 0.25);
    return { road, from, to: Math.round(Math.min(end, from + 200)) };
  }

  /** Oblasť mosta a úsek na prispôsobenie pohľadov (oblasť, inak rozsah NK) na zobrazenej osi. */
  const studyAreaS = road ? studyRanges(road, project.studyArea)[0] : undefined;
  const viewFocus = useMemo(() => {
    if (studyAreaS) return studyAreaS;
    const decks = road ? deckRanges(road, project.superstructures, project.bridgeAxes) : [];
    if (decks.length === 0) return undefined;
    return {
      sFrom: Math.min(...decks.map((d) => Math.min(d.sFrom, d.sTo))),
      sTo: Math.max(...decks.map((d) => Math.max(d.sFrom, d.sTo))),
    };
  }, [studyAreaS, road, project.superstructures, project.bridgeAxes]);

  /** Vyznačená oblasť mosta (spojité staničenie) → zobrazované staničenie na celé metre. */
  function setStudyAreaFrom(range: { sFrom: number; sTo: number }) {
    if (!road) return;
    const at = (s: number) => Math.round(road.stationing.toDisplay(s).station);
    projectStore.getState().dispatch({
      type: 'setStudyArea',
      studyArea: { alignment: road.name, from: at(range.sFrom), to: at(range.sTo) },
    });
  }

  /** Podpery na osiach mosta vedených po zobrazenej osi cesty (pre pôdorys a profil). */
  const roadSupports = supportState.supports.filter((r) => {
    const deck = project.superstructures.find((d) => d.id === r.superstructure);
    const axis = project.bridgeAxes.find((a) => a.id === deck?.bridgeAxis);
    return axis !== undefined && axis.alignment === item?.data.name;
  });

  const deckDrawings = useDeckDrawings(
    alignmentMap,
    parameterState.set,
    supportState.supports,
    supportState.lines,
  );
  const roadDecks = deckDrawings.filter((d) => d.road === item?.data.name);
  const profileDeck =
    roadDecks.find((d) => d.id === (profileDeckId ?? selectedSuperstructureId)) ?? roadDecks[0];
  /** Pohľady na podpery v priereze na aktuálnom staničení (± 0,5 m). */
  const sectionSupports = roadSupports
    .filter((r) => Math.abs(r.station - sectionAt) <= 0.5 && r.axis)
    .flatMap((r) => projectSupport(r, item?.alignment.origin.z ?? 0) ?? []);

  const otherAlignments = useMemo(
    () => alignments.filter((a) => a.alignment !== road).map((a) => a.alignment),
    [alignments, road],
  );
  const profileDeckAxis = project.superstructures.find((d) => d.id === profileDeck?.id)?.bridgeAxis;
  const profile = useProfileView({
    key: profileAxisKey,
    road,
    deck: profileDeck,
    measure: profileDeckAxis ? axisLengths.get(profileDeckAxis) : undefined,
    others: otherAlignments,
    planLines: project.planLines,
    tins,
    edgeTerrain: edgeTerrainOn,
  });
  const profileView = profile.drawing;
  /** kóty NK na zobrazenej osi: reťazce po osi mosta, poloha v pôdoryse a strana mimo obrysu NK */
  const deckDimensions = useMemo((): PlanDimensionSet[] => {
    if (!dimensionsOn || !road) return [];
    return roadDecks.flatMap((d) => {
      const sup = project.superstructures.find((x) => x.id === d.id);
      const measure = sup && axisLengths.get(sup.bridgeAxis);
      const spans = supportState.spans.get(d.id);
      if (!measure || !spans?.lengths) return [];
      const mid = (spans.lengths.deck.sFrom + spans.lengths.deck.sTo) / 2;
      return [
        {
          deckId: d.id,
          chains: bridgeDimensions(spans.spans, spans.lengths, measure.lengthAt),
          ...planFrame(road, d.outline, measure.offsetAt, mid),
        },
      ];
    });
  }, [dimensionsOn, road, roadDecks, project.superstructures, axisLengths, supportState.spans]);
  const profileTitle = `${sk.viewport.profile} – ${
    profile.options.find((o) => o.value === profile.axis)?.label ?? ''
  }`;
  const planView = useMemo(
    () =>
      road &&
      planDrawing({
        alignment: road,
        decks: roadDecks,
        supports: roadSupports,
        otherAlignments,
        planLines: project.planLines,
      }),
    [road, roadDecks, roadSupports, otherAlignments, project.planLines],
  );

  /** Nakreslená čiara v pôdoryse (súradnice na mm) sa pridá a vyberie. */
  function addPlanLine(points: Vec2[]) {
    const existing = new Set(project.planLines.map((l) => l.name));
    let n = 1;
    while (existing.has(sk.planLines.defaultName(n))) n++;
    const round = (v: number) => Math.round(v * 1000) / 1000;
    const line = {
      id: newId('line'),
      name: sk.planLines.defaultName(n),
      points: points.map((p) => ({ x: round(p.x), y: round(p.y) })),
    };
    projectStore.getState().dispatch({ type: 'addElements', planLines: [line] });
    setSelectedElement({ collection: 'planLines', id: line.id });
  }

  function movePlanLineVertex(id: string, index: number, point: Vec2) {
    const line = project.planLines.find((l) => l.id === id);
    if (!line) return;
    projectStore.getState().dispatch({
      type: 'updateElement',
      collection: 'planLines',
      id,
      changes: { points: line.points.map((p, i) => (i === index ? point : p)) },
    });
  }
  const drawnSections = sections.results.flatMap((r) => (r.drawn ? [r.drawn] : []));
  const sectionView = sectionDrawing({
    decks: drawnSections,
    supports: sectionSupports,
    terrain: sectionTerrain.flatMap((t) => t.runs),
  });

  /** Prierez vybraný v strome: editor s hodnotami parametrov z NK, ktorá ho používa, inak predvolené. */
  const editedProfile = useMemo(() => {
    if (selectedElement?.collection !== 'profiles') return undefined;
    const def = project.profiles.find((p) => p.id === selectedElement.id);
    if (!def) return undefined;
    const globals = globalScope(parameterState.set, sectionAt);
    const used = sections.results.find(
      (r) => r.superstructure.profile === def.id && (r.section?.parameters.size ?? 0) > 0,
    );
    if (used?.section) {
      return {
        def,
        globals,
        values: used.section.parameters,
        source: sk.profileEditor.sourceDeck(used.superstructure.name, formatStation(sectionAt, 3)),
      };
    }
    return {
      def,
      globals,
      values: profileParameterValues(def, {}, globals, sectionAt).values,
      source: sk.profileEditor.sourceDefaults,
    };
  }, [selectedElement, project.profiles, parameterState.set, sectionAt, sections.results]);

  /** Stiahne pohľad ako DXF alebo SVG (ADR 0012). */
  function exportDrawing(drawing: Drawing | undefined, view: string, format: 'dxf' | 'svg') {
    if (!drawing) return;
    const file = drawingFileName(project.name, view, format);
    if (format === 'dxf') downloadText(toDxf(drawing), file, 'application/dxf');
    else downloadText(toSvg(drawing), file, 'image/svg+xml');
    setMessage(sk.export.done(file));
  }

  /**
   * Nová podpera na osi uloženia s predvolenými rozmermi (ADR 0017): opora pri konci NK (do 2 m) alebo na krajnej
   * z aspoň dvoch osí NK, inak pilier. `lines` = osi projektu vrátane novej osi.
   */
  function newSupportOn(
    line: BearingLine,
    lines: readonly BearingLine[],
    forceKind?: Support['kind'],
  ) {
    const road = item?.alignment;
    const deck = project.superstructures.find((d) => d.id === line.superstructure);
    const s = road?.stationing.fromDisplay(line.station);
    if (!road || !deck || s === undefined) return undefined;
    const own = lines
      .filter((l) => l.superstructure === deck.id)
      .sort((a, b) => a.station - b.station);
    const atEnd = own.length >= 2 && (own[0]?.id === line.id || own.at(-1)?.id === line.id);
    const nearEnd = line.station - deck.from < 2 || deck.to - line.station < 2;
    const kind = forceKind ?? (nearEnd || atEnd ? 'abutment' : 'pier');
    const prefix = kind === 'abutment' ? 'O' : 'P';
    const existing = new Set(project.supports.map((x) => x.name));
    let n = 1;
    while (existing.has(`${prefix}${n}`)) n++;
    let soffit = 0;
    try {
      soffit = road.elevation(s).z + road.origin.z - 1.8;
    } catch {
      soffit = 0;
    }
    // opora na šírku NK (krídla pod okrajmi NK)
    const section = evaluateSuperstructure(
      {
        alignments: alignmentMap,
        parameters: parameterState.set,
        bridgeAxes: project.bridgeAxes,
        profiles: project.profiles,
        planLines: project.planLines,
      },
      deck,
      s,
    );
    const xs = section.loops
      .filter((l) => l.role === 'outer')
      .flatMap((l) => l.polygon.map((p) => p.x));
    const width = xs.length > 0 ? Math.max(...xs) - Math.min(...xs) : undefined;
    return defaultSupport(newId('sup'), `${prefix}${n}`, kind, line.id, soffit, width);
  }

  /** Podpera na voľnej osi uloženia (vlastnosti osi, kontextová karta). */
  function addSupportOnLine(lineId: string) {
    const line = project.bearingLines.find((l) => l.id === lineId);
    const support = line && newSupportOn(line, project.bearingLines);
    if (!support) return;
    projectStore.getState().dispatch({ type: 'addElements', supports: [support] });
    setSelectedElement({ collection: 'supports', id: support.id });
  }

  /**
   * NK pod kurzorom pre nástroje osí uloženia: v pôdoryse tá, ktorej rozsah obsahuje staničenie a ktorej os mosta je
   * najbližšie k odsadeniu kurzora; v profile NK profilu.
   */
  function deckAt(s: number, offset: number | undefined) {
    const road = item?.alignment;
    if (!road) return undefined;
    if (offset === undefined) return project.superstructures.find((d) => d.id === profileDeck?.id);
    const station = road.stationing.toDisplay(s).station;
    return project.superstructures
      .filter((d) => station >= d.from && station <= d.to && roadDecks.some((r) => r.id === d.id))
      .map((d) => {
        const measure = axisLengths.get(d.bridgeAxis);
        return { d, distance: measure ? Math.abs(measure.offsetAt(s) - offset) : Infinity };
      })
      .filter((c) => Number.isFinite(c.distance))
      .sort((a, b) => a.distance - b.distance)[0]?.d;
  }

  /** Najbližšia os uloženia NK k dĺžke po osi mosta `l` (nová os preberá jej uhol kríženia). */
  function nearestLine(deckId: string, l: number, measure: AxisLength) {
    return supportState.lines
      .filter((x) => x.line.superstructure === deckId && Number.isFinite(x.s))
      .sort((a, b) => Math.abs(measure.lengthAt(a.s) - l) - Math.abs(measure.lengthAt(b.s) - l))[0];
  }

  /** Osi uloženia NK na zobrazenej osi cesty na výber v pohľadoch (úsečka v pôdoryse, x v profile). */
  const lineHandles = useMemo((): LineHandle[] => {
    if (!road) return [];
    return roadDecks.flatMap((d) => {
      const sup = project.superstructures.find((x) => x.id === d.id);
      const measure = sup && axisLengths.get(sup.bridgeAxis);
      if (!measure) return [];
      const reach = deckReach(d.outline, road, measure.offsetAt);
      const half = Math.max(reach.left, reach.right) + 1;
      return d.lines.flatMap((l) => {
        if (!l.axis) return [];
        const t = half / Math.max(0.1, Math.sin(l.crossingAngle));
        const c = l.axis.point;
        const u =
          d.id === profileDeck?.id ? profile.lines.find((p) => p.id === l.line.id)?.u : undefined;
        return [
          {
            id: l.line.id,
            deckId: d.id,
            s: l.s,
            free: !project.supports.some((s) => s.bearingLine === l.line.id),
            plan: [
              vec2(c.x - t * l.direction.x, c.y - t * l.direction.y),
              vec2(c.x + t * l.direction.x, c.y + t * l.direction.y),
            ],
            ...(u === undefined ? {} : { u }),
          },
        ];
      });
    });
  }, [
    road,
    roadDecks,
    project.superstructures,
    project.supports,
    axisLengths,
    profileDeck,
    profile.lines,
  ]);

  /** Návrh novej osi uloženia pod kurzorom s prichytením poľa od predchádzajúcej osi (ADR 0017). */
  function previewLine(
    s: number,
    offset: number | undefined,
    snap: boolean,
  ): LinePreview | undefined {
    const deck = deckAt(s, offset);
    const data = roadDecks.find((d) => d.id === deck?.id);
    const measure = deck && axisLengths.get(deck.bridgeAxis);
    if (!road || !deck || !data || !measure) return undefined;
    const own = supportState.lines.filter(
      (x) => x.line.superstructure === deck.id && Number.isFinite(x.s),
    );
    const others = own.map((x) => measure.lengthAt(x.s));
    const l0 = measure.lengthAt(s);
    const l = snap ? snapToPrevious(others, l0) : l0;
    const sNew = measure.stationAt(l);
    const sFrom = road.stationing.fromDisplay(deck.from);
    const sTo = road.stationing.fromDisplay(deck.to);
    if (sFrom === undefined || sTo === undefined || sNew < sFrom || sNew > sTo) return undefined;
    const prev = own.filter((x) => measure.lengthAt(x.s) < l - 1e-9).sort((a, b) => b.s - a.s)[0];
    const next = own.filter((x) => measure.lengthAt(x.s) > l + 1e-9).sort((a, b) => a.s - b.s)[0];
    const spans = [
      ...(prev ? [{ sFrom: prev.s, sTo: sNew, value: l - measure.lengthAt(prev.s) }] : []),
      ...(next ? [{ sFrom: sNew, sTo: next.s, value: measure.lengthAt(next.s) - l }] : []),
    ];
    const alpha = nearestLine(deck.id, l, measure)?.crossingAngle ?? Math.PI / 2;
    const u = profileU(deck.id, sNew);
    return {
      deckId: deck.id,
      s: sNew,
      spans,
      plan: linePlan(data, measure, sNew, alpha),
      ...(u === undefined ? {} : { u }),
      frame: planFrame(road, data.outline, measure.offsetAt, (sFrom + sTo) / 2),
    };
  }

  /** Úsečka osi uloženia v pôdoryse cez šírku NK (náhľad; dotyčnica osi mosta ≈ dotyčnica osi cesty). */
  function linePlan(data: DeckDrawingData, measure: AxisLength, s: number, alpha: number): Vec2[] {
    if (!road) return [];
    const h = road.evaluateHorizontal(s);
    const offsetH = measure.offsetAt(s);
    const c = vec2(
      h.point.x + offsetH * Math.cos(h.azimuth),
      h.point.y - offsetH * Math.sin(h.azimuth),
    );
    const dir = azimuthToVector(h.azimuth - alpha);
    const reach = deckReach(data.outline, road, measure.offsetAt);
    const t = (Math.max(reach.left, reach.right) + 1) / Math.max(0.1, Math.sin(alpha));
    return [vec2(c.x - t * dir.x, c.y - t * dir.y), vec2(c.x + t * dir.x, c.y + t * dir.y)];
  }

  /** x osi uloženia na staničení s v profile NK profilu (len v osi cesty a osi mosta). */
  function profileU(deckId: string, s: number): number | undefined {
    const line = profile.line;
    return deckId === profileDeck?.id && (line?.kind === 'road' || line?.kind === 'bridgeAxis')
      ? line.lengthAt(s)
      : undefined;
  }

  /**
   * Ťahanie osi uloženia (ADR 0017): posun o rozdiel dĺžok po osi mosta od miesta uchopenia, pole pred osou sa
   * prichytáva po 0,5 m; bez `following` ostane os medzi susedmi, s ním sa posunú aj ďalšie osi a koniec NK.
   */
  function dragLine(
    lineId: string,
    sGrab: number,
    sNow: number,
    options: { following: boolean; snap: boolean },
  ): LinePreview | undefined {
    const target = supportState.lines.find((x) => x.line.id === lineId);
    const deck = project.superstructures.find((d) => d.id === target?.line.superstructure);
    const data = roadDecks.find((d) => d.id === deck?.id);
    const measure = deck && axisLengths.get(deck.bridgeAxis);
    const sFrom = deck && road?.stationing.fromDisplay(deck.from);
    const sTo = deck && road?.stationing.fromDisplay(deck.to);
    if (!road || !target || !deck || !data || !measure || sFrom === undefined || sTo === undefined)
      return undefined;
    const own = supportState.lines
      .filter((x) => x.line.superstructure === deck.id && Number.isFinite(x.s))
      .sort((a, b) => a.s - b.s);
    const index = own.findIndex((x) => x.line.id === lineId);
    const ls = own.map((x) => measure.lengthAt(x.s));
    let l = (ls[index] as number) + measure.lengthAt(sNow) - measure.lengthAt(sGrab);
    const others = ls.filter((_, i) => (options.following ? i < index : i !== index));
    if (options.snap) l = snapToPrevious(others, l);
    const prevL = ls[index - 1];
    const nextL = ls[index + 1];
    if (prevL !== undefined) l = Math.max(l, prevL + SPAN_SNAP);
    if (nextL !== undefined && !options.following) l = Math.min(l, nextL - SPAN_SNAP);
    const moved = moveLine({
      stations: own.map((x) => x.s),
      deck: { sFrom, sTo },
      measure,
      index,
      l,
      following: options.following,
    });
    const at = (i: number) => moved.stations[i];
    const sNew = at(index) as number;
    const spans = [index - 1, index].flatMap((i) => {
      const a = at(i);
      const b = at(i + 1);
      return a === undefined || b === undefined
        ? []
        : [{ sFrom: a, sTo: b, value: measure.lengthAt(b) - measure.lengthAt(a) }];
    });
    const changed = own.flatMap((x, i) => (at(i) === x.s ? [] : [{ x, s: at(i) as number }]));
    const u = profileU(deck.id, sNew);
    return {
      deckId: deck.id,
      s: sNew,
      lineId,
      spans,
      plan: linePlan(data, measure, sNew, target.crossingAngle),
      ...(u === undefined ? {} : { u }),
      frame: planFrame(road, data.outline, measure.offsetAt, (sFrom + sTo) / 2),
      moves: { lines: changed.map((c) => ({ id: c.x.line.id, s: c.s })), deck: moved.deck },
      extra: changed
        .filter((c) => c.x.line.id !== lineId)
        .map((c) => {
          const cu = profileU(deck.id, c.s);
          return {
            plan: linePlan(data, measure, c.s, c.x.crossingAngle),
            ...(cu === undefined ? {} : { u: cu }),
          };
        }),
    };
  }

  /** Zapíše posun osí z ťahania a koniec NK jedným krokom späť. */
  function commitLineMove(preview: LinePreview) {
    if (!preview.moves) return;
    commitMoves(preview.deckId, preview.moves.lines, preview.moves.deck, preview.lineId);
  }

  /**
   * Nové staničenia osí uloženia a rozsah NK (spojité staničenie) jedným krokom späť (staničenia na 0,1 mm);
   * prierez sa presunie na os `focus`.
   */
  function commitMoves(
    deckId: string,
    lines: readonly { id: string; s: number }[],
    range: DeckRange,
    focus?: string,
  ) {
    const deck = project.superstructures.find((d) => d.id === deckId);
    if (!road || !deck || lines.length === 0) return;
    const display = (s: number) => Math.round(road.stationing.toDisplay(s).station * 1e4) / 1e4;
    const from = display(range.sFrom);
    const to = display(range.sTo);
    const commands: Command[] = lines.map((m) => ({
      type: 'updateElement',
      collection: 'bearingLines',
      id: m.id,
      changes: { station: display(m.s) },
    }));
    if (Math.abs(from - deck.from) > 1e-6 || Math.abs(to - deck.to) > 1e-6)
      commands.push({
        type: 'updateElement',
        collection: 'superstructures',
        id: deck.id,
        changes: { from, to },
      });
    projectStore.getState().dispatch({ type: 'batch', commands });
    const moved = lines.find((m) => m.id === focus);
    if (moved) setSectionStation(display(moved.s));
  }

  /**
   * Zadanie rozpätia na kóte (rozhodnutie 2026-10-31): zmení sa len pole `span`; posunú sa osi na strane vzdialenejšej
   * od vybranej podpery alebo osi tejto NK, bez výberu osi za poľom (smerom ku koncu), a koniec NK s nimi.
   */
  function setSpan(deckId: string | undefined, span: number, length: number) {
    const deck = project.superstructures.find((d) => d.id === (deckId ?? profileDeck?.id));
    const measure = deck && axisLengths.get(deck.bridgeAxis);
    const sFrom = deck && road?.stationing.fromDisplay(deck.from);
    const sTo = deck && road?.stationing.fromDisplay(deck.to);
    if (!deck || !measure || sFrom === undefined || sTo === undefined) return;
    const own = supportState.lines
      .filter((x) => x.line.superstructure === deck.id && Number.isFinite(x.s))
      .sort((a, b) => a.s - b.s);
    const selectedLine =
      selectedElement?.collection === 'supports'
        ? project.supports.find((s) => s.id === selectedElement.id)?.bearingLine
        : selectedElement?.collection === 'bearingLines'
          ? selectedElement.id
          : undefined;
    const selected = own.findIndex((x) => x.line.id === selectedLine);
    const r = setSpanLength({
      stations: own.map((x) => x.s),
      deck: { sFrom, sTo },
      measure,
      span,
      length,
      side: selected > span ? 'before' : 'after',
    });
    commitMoves(
      deck.id,
      own.flatMap((x, i) =>
        r.stations[i] === x.s ? [] : [{ id: x.line.id, s: r.stations[i] as number }],
      ),
      r.deck,
    );
  }

  /** Klik na os uloženia v pohľade: podpera na nej, inak os. */
  function selectLine(lineId: string) {
    const support = project.supports.find((s) => s.bearingLine === lineId);
    setSelectedElement(
      support
        ? { collection: 'supports', id: support.id }
        : { collection: 'bearingLines', id: lineId },
    );
    const station = lineStationOf(lineId);
    if (station !== undefined) setSectionStation(station);
  }

  /**
   * Potvrdenie nástroja Os uloženia alebo Podpera (ADR 0017): nová os s ďalším číslom a uhlom najbližšej osi NK;
   * podpera na voľnú os pod kurzorom, inak s novou osou (jeden krok späť). Nástroj ostáva aktívny.
   */
  function placeLine(preview: LinePreview, tool: 'bearingLine' | 'support') {
    if (tool === 'support' && preview.lineId) {
      addSupportOnLine(preview.lineId);
      return;
    }
    const deck = project.superstructures.find((d) => d.id === preview.deckId);
    const measure = deck && axisLengths.get(deck.bridgeAxis);
    if (!road || !deck || !measure) return;
    const station = Math.round(road.stationing.toDisplay(preview.s).station * 1e4) / 1e4;
    const nearest = nearestLine(deck.id, measure.lengthAt(preview.s), measure);
    const line: BearingLine = {
      id: newId('bl'),
      name: nextLineName(
        project.bearingLines.filter((l) => l.superstructure === deck.id).map((l) => l.name),
      ),
      superstructure: deck.id,
      station,
      crossingAngle: nearest?.line.crossingAngle ?? '90',
    };
    const store = projectStore.getState();
    if (tool === 'bearingLine') {
      store.dispatch({ type: 'addElements', bearingLines: [line] });
      setSelectedElement({ collection: 'bearingLines', id: line.id });
    } else {
      const support = newSupportOn(line, [...project.bearingLines, line]);
      if (!support) return;
      store.dispatch({ type: 'addElements', bearingLines: [line], supports: [support] });
      setSelectedElement({ collection: 'supports', id: support.id });
    }
    setSectionStation(station);
    setMessage(undefined);
  }

  const lineEditing: LineEditing | undefined = road
    ? {
        handles: lineHandles,
        preview: previewLine,
        place: placeLine,
        drag: dragLine,
        commit: commitLineMove,
        select: selectLine,
        setSpan,
      }
    : undefined;

  /** Dialóg Rozloženie polí pre vybranú NK (podpera, os → jej NK), inak NK profilu. */
  function openSpanLayout() {
    const lineOf = (id: string) => project.bearingLines.find((l) => l.id === id);
    const fromSelection =
      selectedElement?.collection === 'superstructures'
        ? selectedElement.id
        : selectedElement?.collection === 'bearingLines'
          ? lineOf(selectedElement.id)?.superstructure
          : selectedElement?.collection === 'supports'
            ? lineOf(project.supports.find((s) => s.id === selectedElement.id)?.bearingLine ?? '')
                ?.superstructure
            : undefined;
    const deckId = roadDecks.some((d) => d.id === fromSelection) ? fromSelection : profileDeck?.id;
    if (deckId) setSpanLayoutDeck(deckId);
  }

  /** Predvolené hodnoty dialógu: doterajšie polia, km prvej a poslednej osi, stred oblasti mosta, uhol, presah. */
  function spanLayoutDefaults(deckId: string): SpanLayoutDefaults {
    const deck = project.superstructures.find((d) => d.id === deckId);
    const measure = deck && axisLengths.get(deck.bridgeAxis);
    const sFrom = deck && road?.stationing.fromDisplay(deck.from);
    const own = supportState.lines
      .filter((x) => x.line.superstructure === deckId && Number.isFinite(x.s))
      .sort((a, b) => a.s - b.s);
    const compact = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');
    const firstLine = own[0];
    const overhang =
      firstLine && measure && sFrom !== undefined
        ? Math.round((measure.lengthAt(firstLine.s) - measure.lengthAt(sFrom)) * 100) / 100
        : 0.5;
    const first = firstLine?.station ?? (deck?.from ?? 0) + overhang;
    const last = own.at(-1)?.station ?? (deck?.to ?? 0) - overhang;
    const area = project.studyArea?.alignment === road?.name ? project.studyArea : undefined;
    return {
      text: (supportState.spans.get(deckId)?.spans ?? []).map((s) => compact(s.length)).join(' + '),
      stations: {
        start: first,
        end: last,
        center: area ? (area.from + area.to) / 2 : (first + last) / 2,
      },
      angle: firstLine?.line.crossingAngle ?? '90',
      overhang: Math.max(0, overhang),
    };
  }

  /** Polohy osí rozloženia (spojité staničenie) a rozsah NK; mimo osi cesty undefined. */
  function spanLayoutStations(form: SpanLayoutForm) {
    const deck = project.superstructures.find((d) => d.id === form.deckId);
    const measure = deck && axisLengths.get(deck.bridgeAxis);
    const s0 = road?.stationing.fromDisplay(form.station);
    if (!road || !deck || !measure || s0 === undefined) return undefined;
    const layout = layoutStations({
      spans: form.spans,
      anchor: { kind: form.anchor, s: s0 },
      measure,
      overhang: { start: form.overhang, end: form.overhang },
    });
    const inside = (s: number) => s >= 0 && s <= road.length;
    return inside(layout.deck.sFrom) && inside(layout.deck.sTo) ? { deck, layout } : undefined;
  }

  /** Rozloženie polí jedným krokom späť (ADR 0017); nové podpery majú typ z dialógu. */
  function applySpanLayout(form: SpanLayoutForm) {
    const r = spanLayoutStations(form);
    if (!road || !r) return;
    const toDisplay = (s: number) => road.stationing.toDisplay(s).station;
    const newSupport: SupportFactory = (kind, lineId, name, s) => {
      const draft: BearingLine = {
        id: lineId,
        name,
        superstructure: r.deck.id,
        station: Math.round(toDisplay(s) * 1e4) / 1e4,
        crossingAngle: form.angle,
      };
      const base =
        newSupportOn(draft, project.bearingLines, kind) ??
        defaultSupport('', name, kind, lineId, 0);
      const choice = kind === 'abutment' ? form.abutment : form.pier;
      const template = project.supports.find((x) => x.id === choice);
      const geometry =
        template?.geometry ?? (choice === 'columns' ? defaultGeometry('columns') : base.geometry);
      return {
        ...base,
        ...(template
          ? {
              offset: template.offset,
              footing: { ...template.footing },
              connection: template.connection,
              bearingHeight: template.bearingHeight,
              bearings: [...template.bearings],
            }
          : {}),
        geometry: JSON.parse(JSON.stringify(geometry)) as Support['geometry'],
        id: newId('sup'),
        name,
        bearingLine: lineId,
      };
    };
    projectStore.getState().dispatch(
      planSpanLayout({
        deck: r.deck,
        lines: project.bearingLines,
        supports: project.supports,
        stations: r.layout.stations,
        range: r.layout.deck,
        toDisplay,
        angle: form.angle,
        newSupport,
        newId,
      }),
    );
    setSelectedElement({ collection: 'superstructures', id: r.deck.id });
    setSpanLayoutDeck(undefined);
  }

  /** Otvorí vloženie NK výberom typológie; bez osi s niveletou len hláška. */
  function openDeckDialog() {
    if (!defaultDeckRange()) {
      setMessage(sk.section.needsAlignment);
      setMode('section');
      return;
    }
    setDeckDialog(true);
  }

  /** Príklad dvojice NK z rezu E–E (Fáza 3) na predvolenom rozsahu. */
  function insertTwinExample() {
    const range = defaultDeckRange();
    if (!range) {
      setMessage(sk.section.needsAlignment);
      return;
    }
    const { road, from, to } = range;
    const example = twinDeckExample(road.name, from, to, {
      left: newId('nk'),
      right: newId('nk'),
      profile: newId('prof'),
      leftAxis: newId('axis'),
      rightAxis: newId('axis'),
    });
    projectStore.getState().dispatch({
      type: 'addElements',
      bridgeAxes: example.bridgeAxes,
      profiles: [example.profile],
      superstructures: example.superstructures,
    });
    const first = example.superstructures[0];
    if (first) setSelectedElement({ collection: 'superstructures', id: first.id });
    setSectionStation((from + to) / 2);
    setMessage(undefined);
    setMode('section');
  }

  const importIssuesOf = (name: string) => lastImport.issues.filter((i) => i.alignment === name);

  const hasRoad = alignments.some((a) => a.alignment.profile !== undefined);

  /** Pôdorys na export (staničenie každých 20 m, popis každých 100 m), v S-JTSK alebo lokálne. */
  function exportPlan(format: 'dxf' | 'svg', sjtsk: boolean) {
    if (!road) return;
    const drawing = planDrawing({
      alignment: road,
      decks: roadDecks,
      supports: roadSupports,
      otherAlignments,
      planLines: project.planLines,
      stationing: { step: 20, labelStep: 100 },
    });
    const origin = project.crs.origin;
    exportDrawing(
      sjtsk && origin ? translate(drawing, origin.x, origin.y) : drawing,
      sk.export.names.plan,
      format,
    );
  }

  /** Kópia prvku jedným príkazom (späť / znova); kópia sa vyberie. */
  function duplicate(target: { collection: ElementCollection; id: string }) {
    const r = duplicateElement(project, target.collection, target.id, newId);
    if (!r) return;
    projectStore.getState().dispatch(r.command);
    setSelectedElement(r.selected);
    // nový prvok je zatiaľ len v príkaze (projekt v tejto funkcii je stav pred kópiou)
    const added =
      r.command.type === 'addElements'
        ? [
            ...(r.command.supports ?? []),
            ...(r.command.superstructures ?? []),
            ...(r.command.bridgeAxes ?? []),
            ...(r.command.profiles ?? []),
            ...(r.command.planLines ?? []),
          ]
        : [];
    const name = added.find((e) => e.id === r.selected.id)?.name;
    if (name) setMessage(sk.ribbon.duplicated(name));
  }

  function renameSelected() {
    if (selectedElement)
      setRenameRequest((r) => ({
        key: `${selectedElement.collection}:${selectedElement.id}`,
        nonce: (r?.nonce ?? 0) + 1,
      }));
  }

  function deleteSelected() {
    if (!selectedElement) return;
    projectStore.getState().dispatch({ type: 'removeElement', ...selectedElement });
    setSelectedElement(undefined);
  }

  /** Strom prehliadača projektu z projektu a výsledkov výpočtu (ADR 0016). */
  const browser = useMemo(() => {
    const elementIssues = new Map<string, number>();
    for (const r of sections.results)
      elementIssues.set(
        r.superstructure.id,
        r.issues.filter((i) => i.severity !== 'warning').length,
      );
    for (const r of supportState.supports)
      elementIssues.set(r.support.id, r.issues.filter((i) => i.severity !== 'warning').length);
    const spans = new Map(
      [...supportState.spans].map(([id, s]) => [id, s.spans.map((x) => x.length)] as const),
    );
    return browserTree({
      project,
      issues: {
        alignment: (name) =>
          lastImport.issues.filter((i) => i.alignment === name).length +
          (alignments.find((a) => a.data.name === name)?.issues.length ?? 0),
        element: (id) => elementIssues.get(id) ?? 0,
        parameter: (name) => issuesOf(parameterState.issues, name).length,
      },
      spans,
      views: VIEW_TABS,
    });
  }, [
    project,
    sections.results,
    supportState,
    lastImport.issues,
    alignments,
    parameterState.issues,
  ]);

  const browserSelection: BrowserTarget | undefined = selectedElement
    ? { type: 'element', ...selectedElement }
    : panelTarget === 'studyArea'
      ? { type: 'studyArea' }
      : mode === 'parameters' && selectedParameterId
        ? { type: 'parameter', id: selectedParameterId }
        : panelTarget === 'alignment'
          ? { type: 'alignment', index: selected }
          : undefined;

  /** Klik v prehliadači: výber (vlastnosti vpravo); pohľad sa nemení, okrem pohľadov a parametrov. */
  function selectTarget(target: BrowserTarget) {
    switch (target.type) {
      case 'view':
        setMode(target.mode);
        return;
      case 'alignment':
        setSelected(target.index);
        setSelectedElement(undefined);
        setPanelTarget('alignment');
        return;
      case 'element': {
        setSelectedElement({ collection: target.collection, id: target.id });
        const station = lineStationOf(target.id);
        if (station !== undefined) setSectionStation(station);
        return;
      }
      case 'studyArea':
        setSelectedElement(undefined);
        setPanelTarget('studyArea');
        return;
      case 'parameter':
        setSelectedElement(undefined);
        setPanelTarget(undefined);
        setSelectedParameterId(target.id);
        setMode('parameters');
        return;
    }
  }

  /** Názov NK, na ktorej podpera stojí (cez os uloženia). */
  function deckNameOf(support: Support): string {
    const line = project.bearingLines.find((l) => l.id === support.bearingLine);
    return project.superstructures.find((d) => d.id === line?.superstructure)?.name ?? '—';
  }

  /** Staničenie osi uloženia podľa id osi alebo podpery na nej. */
  function lineStationOf(id: string): number | undefined {
    const lineId = project.supports.find((x) => x.id === id)?.bearingLine ?? id;
    return project.bearingLines.find((l) => l.id === lineId)?.station;
  }

  /** Staničenie prvku na priblíženie (os uloženia, podpera, stred NK). */
  function targetStation(target: BrowserTarget): number | undefined {
    if (target.type !== 'element') return undefined;
    const station = lineStationOf(target.id);
    if (station !== undefined) return station;
    const deck = project.superstructures.find((x) => x.id === target.id);
    return deck ? (deck.from + deck.to) / 2 : undefined;
  }

  /** Dvojklik v prehliadači: prvok sa ukáže v pohľade, kde sa s ním pracuje. */
  function openTarget(target: BrowserTarget) {
    selectTarget(target);
    if (target.type === 'view' || target.type === 'parameter') return;
    if (target.type === 'alignment') {
      setMode('2d');
      setFitRequest((f) => ({ whole: true, nonce: f.nonce + 1 }));
      return;
    }
    if (target.type === 'studyArea') {
      setMode('2d');
      setFitRequest((f) => ({ whole: false, nonce: f.nonce + 1 }));
      return;
    }
    switch (target.collection) {
      case 'profiles':
        setMode('section');
        setRibbonTab('contextual');
        return;
      case 'terrains':
        setMode('3d');
        return;
      case 'planLines':
      case 'bridgeAxes':
        setMode('2d');
        return;
    }
    const station = targetStation(target);
    if (station === undefined) return;
    if (mode === 'section') {
      setSectionStation(station);
      return;
    }
    if (mode === '3d') {
      // 3D prispôsobí pohľad na vybraný prvok
      setFitRequest((f) => ({ whole: false, nonce: f.nonce + 1 }));
      return;
    }
    const s = road?.stationing.fromDisplay(station);
    setMode('2d');
    if (s !== undefined) setGoTo((g) => ({ s, nonce: (g?.nonce ?? 0) + 1 }));
  }

  function renameTarget(target: BrowserTarget, name: string) {
    const { dispatch } = projectStore.getState();
    if (target.type === 'element')
      dispatch({
        type: 'updateElement',
        collection: target.collection,
        id: target.id,
        changes: { name },
      });
    else if (target.type === 'parameter')
      dispatch({ type: 'renameParameter', id: target.id, name });
  }

  function deleteTarget(target: BrowserTarget) {
    const { dispatch } = projectStore.getState();
    if (target.type === 'element') {
      dispatch({ type: 'removeElement', collection: target.collection, id: target.id });
      if (selectedElement?.id === target.id) setSelectedElement(undefined);
    } else if (target.type === 'parameter') {
      dispatch({ type: 'removeParameter', id: target.id });
      if (selectedParameterId === target.id) setSelectedParameterId(undefined);
    }
  }

  const menuText = sk.ribbon.menu;
  const menuSections: MenuSection[] = [
    {
      items: [
        { label: menuText.new, icon: 'newFile', onClick: newProject },
        { label: menuText.open, icon: 'open', onClick: () => projectInput.current?.click() },
        {
          label: menuText.save,
          icon: 'save',
          onClick: () => downloadProject(projectStore.getState().project),
        },
      ],
    },
    {
      title: menuText.export,
      items: [
        {
          label: menuText.planDxf,
          icon: 'export',
          disabled: !road,
          onClick: () => exportPlan('dxf', true),
        },
        { label: menuText.planDxfLocal, disabled: !road, onClick: () => exportPlan('dxf', false) },
        { label: menuText.planSvg, disabled: !road, onClick: () => exportPlan('svg', true) },
        {
          label: menuText.profileDxf,
          disabled: !profileView,
          onClick: () =>
            exportDrawing(profileView, sk.export.names.profile(profileDeck?.name ?? ''), 'dxf'),
        },
        {
          label: menuText.profileSvg,
          disabled: !profileView,
          onClick: () =>
            exportDrawing(profileView, sk.export.names.profile(profileDeck?.name ?? ''), 'svg'),
        },
        {
          label: menuText.sectionDxf,
          disabled: drawnSections.length === 0,
          onClick: () =>
            exportDrawing(sectionView, sk.export.names.section(formatStation(sectionAt, 3)), 'dxf'),
        },
        {
          label: menuText.sectionSvg,
          disabled: drawnSections.length === 0,
          onClick: () =>
            exportDrawing(sectionView, sk.export.names.section(formatStation(sectionAt, 3)), 'svg'),
        },
      ],
    },
    {
      title: menuText.model,
      items: [
        {
          label: menuText.stepSjtsk,
          icon: 'cube',
          disabled: !exactReady || mode !== '3d' || !project.crs.origin,
          title: exactReady ? undefined : menuText.stepHint,
          onClick: () => setStepRequest((r) => ({ sjtsk: true, nonce: (r?.nonce ?? 0) + 1 })),
        },
        {
          label: menuText.stepLocal,
          disabled: !exactReady || mode !== '3d',
          title: exactReady ? undefined : menuText.stepHint,
          onClick: () => setStepRequest((r) => ({ sjtsk: false, nonce: (r?.nonce ?? 0) + 1 })),
        },
      ],
    },
  ];

  const contextualKinds: Record<ElementCollection, ContextualKind> = {
    profiles: 'profile',
    supports: 'support',
    bearingLines: 'bearingLine',
    superstructures: 'deck',
    planLines: 'planLine',
    terrains: 'terrain',
    bridgeAxes: 'bridgeAxis',
  };
  const contextual =
    selectedElement &&
    contextualTab({
      kind: contextualKinds[selectedElement.collection],
      label: sk.elements.titles[selectedElement.collection],
      onDelete: deleteSelected,
      onDuplicate:
        selectedElement.collection !== 'terrains' ? () => duplicate(selectedElement) : undefined,
      onRename: renameSelected,
      onShowInSection: () => {
        const station = targetStation({ type: 'element', ...selectedElement });
        if (station !== undefined) setSectionStation(station);
        setMode('section');
      },
      onAddSupport: () => {
        setMode('2d');
        setTool('support');
      },
      onSpanLayout: openSpanLayout,
      onSupportOnLine:
        selectedElement.collection === 'bearingLines' &&
        !project.supports.some((s) => s.bearingLine === selectedElement.id)
          ? () => addSupportOnLine(selectedElement.id)
          : undefined,
      onEditProfile: () => {
        const deck = project.superstructures.find((d) => d.id === selectedElement.id);
        if (!deck) return;
        setSelectedElement({ collection: 'profiles', id: deck.profile });
        setMode('section');
      },
      onVertices: () => setPlanLineVertices(selectedElement.id),
      onRedownload:
        project.terrains.find((t) => t.id === selectedElement.id)?.source === 'zbgis'
          ? () => void downloadDmrTerrain(selectedElement.id)
          : undefined,
      onAxisOffset: (which) => setAxisOffset({ axisId: selectedElement.id, which }),
      onProfileHere: () => {
        if (selectedElement.collection === 'superstructures') {
          setProfileDeckId(selectedElement.id);
          setProfileAxisKey('bridgeAxis');
        } else {
          setProfileAxisKey(`line:${selectedElement.id}`);
        }
        setMode('2d');
      },
      profileTool,
      setProfileTool: (next) => {
        setMode('section');
        setProfileTool(next);
        setMessage(undefined);
      },
      loopRole,
      setLoopRole,
      onProfileTables: () => setProfileTables(selectedElement.id),
    });

  const tabs = ribbonTabs({
    mode,
    setMode,
    tool,
    setTool: (next) => {
      setTool(next);
      if (next !== 'none') setMessage(undefined);
    },
    hasRoad,
    hasOrigin: project.crs.origin !== null,
    hasDeck: project.superstructures.length > 0,
    hasTerrain: project.terrains.length > 0,
    hasSelection: selectedElement !== undefined,
    dmrBusy: dmrProgress !== undefined,
    onInsertDeck: openDeckDialog,
    onSpanLayout: openSpanLayout,
    onEditStudyArea: () => {
      setSelectedElement(undefined);
      setPanelTarget('studyArea');
    },
    onImportLandXml: () => landXmlInput.current?.click(),
    onImportTerrain: () => terrainInput.current?.click(),
    onDownloadDmr: () => void downloadDmrTerrain(),
    onCancelDmr: () => {
      dmrCancel.current = true;
    },
    onOpenLibrary: () => setLibraryOpen(true),
    onInsertTwinExample: insertTwinExample,
    onDelete: deleteSelected,
    onDuplicate:
      selectedElement && selectedElement.collection !== 'terrains'
        ? () => duplicate(selectedElement)
        : undefined,
    onRename: renameSelected,
    onFit: (whole) => setFitRequest((f) => ({ whole, nonce: f.nonce + 1 })),
    goTo: (
      <GoToStation
        onStation={(station) => {
          const s = road?.stationing.fromDisplay(station);
          if (s === undefined) return;
          setMode('2d');
          setGoTo((g) => ({ s, nonce: (g?.nonce ?? 0) + 1 }));
          setCursor({ source: 'profile', s });
        }}
      />
    ),
    exaggeration,
    setExaggeration,
    decks: roadDecks,
    profileDeckId: profileDeck?.id,
    setProfileDeckId,
    profileAxis: profile.axis,
    profileAxes: profile.options,
    setProfileAxis: setProfileAxisKey,
    edgeTerrain: edgeTerrainOn,
    setEdgeTerrain: setEdgeTerrainOn,
    canEdgeTerrain: profile.line?.kind === 'bridgeAxis' && tins.length > 0,
    dimensions: dimensionsOn,
    setDimensions: setDimensionsOn,
    view3d,
    setView3d,
    onProjectInfo: () => setProjectInfoOpen(true),
  }).concat(contextual ? [contextual] : []);

  // Esc zruší aktívny nástroj (rozkreslené čiary a oblasti zahodia pohľady)
  useEffect(() => {
    if (tool === 'none') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTool('none');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tool]);

  // výber prvku v strome, v 3D alebo po vložení nahradí výber oblasti alebo osi
  useEffect(() => {
    if (selectedElement) setPanelTarget(undefined);
  }, [selectedElement]);

  // Esc bez nástroja zruší výber (mimo polí a dialógov) → vpravo vlastnosti pohľadu
  useEffect(() => {
    if (tool !== 'none') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (
        e.target instanceof Element &&
        e.target.closest('input, select, textarea, [role="dialog"], [role="menu"]')
      )
        return;
      if (document.querySelector('[role="dialog"]')) return;
      // ako v Revite: prvé Esc ukončí nástroj editora prierezu, ďalšie zruší výber
      if (profileTool !== 'select') {
        setProfileTool('select');
        return;
      }
      setSelectedElement(undefined);
      setPanelTarget(undefined);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tool, profileTool]);

  useEffect(() => {
    let cancelled = false;
    const revision = projectStore.getState().revision;
    void loadAutosave().then((saved) => {
      // kým sa uložený projekt načítal, mohol používateľ otvoriť iný alebo začať upravovať — ten má prednosť
      if (cancelled || !saved || projectStore.getState().revision !== revision) return;
      projectStore.getState().replace(saved.project);
      setMessage(sk.persistence.restored(saved.savedAt.toLocaleString('sk-SK')));
    });
    const stop = startAutosave(projectStore);
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // v textových poliach necháme natívne späť/znova prehliadača
      if (
        e.target instanceof Element &&
        e.target.closest('input, textarea, select, [contenteditable]')
      )
        return;
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

  async function openTerrainFile(file: File) {
    if (!isTerrainFile(file.name)) {
      setMessage(sk.terrain.unsupportedFile);
      return;
    }
    try {
      setTerrainFile(await readTerrainFile(file));
    } catch {
      setMessage(sk.import.readFailed);
    }
  }

  /** Oreže vybrané povrchy na koridor okolo zobrazenej osi a pridá ich do projektu (jeden krok späť). */
  async function importTerrains(selected: TerrainCandidate[], options: CorridorOptions) {
    const road = item?.alignment;
    const origin = project.crs.origin;
    if (!road || !origin) return;
    setTerrainBusy(true);
    try {
      const ranges = bridgeRanges(
        road,
        project.superstructures,
        project.bridgeAxes,
        project.studyArea,
      );
      const corridor = corridorAround(road, ranges, options);
      const terrains: TerrainSurface[] = [];
      const notes: string[] = [];
      for (const c of selected) {
        const r = await buildTerrain(c, corridor, options, origin, newId('ter'));
        if (r.terrain) terrains.push(r.terrain);
        else if (r.issues.length > 0) notes.push(...r.issues.map(formatTerrainIssue));
        else notes.push(sk.terrain.empty(c.name));
      }
      if (terrains.length > 0) projectStore.getState().dispatch({ type: 'addElements', terrains });
      setMessage([sk.terrain.imported(terrains.length), ...notes].join(' '));
      setTerrainFile(undefined);
    } finally {
      setTerrainBusy(false);
    }
  }

  /**
   * Stiahne DMR 5.0 zo ZBGIS pre koridor okolo zobrazenej osi (ADR 0011, doplnok); s `replaceId` nahradí
   * existujúci terén (s jeho koridorom), inak pridá nový s predvoleným koridorom. Jeden krok späť/znova.
   */
  async function downloadDmrTerrain(replaceId?: string) {
    const road = item?.alignment;
    const origin = project.crs.origin;
    if (dmrProgress !== undefined) return;
    if (!road || !origin) {
      setMessage(sk.terrain.needsAlignment);
      return;
    }
    const previous = project.terrains.find((t) => t.id === replaceId);
    const margin = previous?.corridor.margin ?? DEFAULT_TERRAIN_MARGIN;
    const ranges = bridgeRanges(
      road,
      project.superstructures,
      project.bridgeAxes,
      project.studyArea,
    );
    // celú dlhú os nesťahujeme (tisíce dávok zo ZBGIS) — najprv treba oblasť mosta
    if (ranges.length === 0 && road.length > WHOLE_AXIS_TERRAIN_LIMIT) {
      setMessage(sk.terrain.needsStudyArea);
      setPanelTarget('studyArea');
      return;
    }
    dmrCancel.current = false;
    setDmrProgress(0);
    setMessage(sk.terrain.downloading(0));
    try {
      const r = await downloadTerrain(
        road,
        ranges,
        margin,
        origin,
        previous?.id ?? newId('ter'),
        previous?.name ?? sk.terrain.downloadName,
        {
          onProgress: (done, total) => {
            const percent = Math.floor((100 * done) / Math.max(total, 1));
            setDmrProgress(percent);
            setMessage(sk.terrain.downloading(percent));
          },
          isCancelled: () => dmrCancel.current,
        },
      );
      if (r.terrain) {
        projectStore
          .getState()
          .dispatch(
            previous
              ? { type: 'replaceTerrain', id: previous.id, terrain: r.terrain }
              : { type: 'addElements', terrains: [r.terrain] },
          );
        setMessage(sk.terrain.downloaded);
      } else {
        setMessage(r.issues.map(formatTerrainIssue).join(' '));
      }
    } finally {
      setDmrProgress(undefined);
    }
  }

  async function openProjectFile(file: File) {
    try {
      const opened = openProject(await file.text());
      if (opened.ok) {
        projectStore.getState().replace(opened.project);
        setSelected(0);
        setLastImport({ issues: [], fileIssues: [] });
        setOpenErrors([]);
        setMessage(sk.persistence.opened(file.name));
      } else {
        setOpenErrors(opened.issues.map(formatModelIssue));
        setMessage(sk.persistence.openFailed);
      }
    } catch {
      setMessage(sk.import.readFailed);
    }
  }

  function newProject() {
    if (!window.confirm(sk.persistence.confirmNew)) return;
    projectStore.getState().replace(createEmptyProject(sk.persistence.defaultName));
    setSelected(0);
    setLastImport({ issues: [], fileIssues: [] });
    setOpenErrors([]);
    setMessage(undefined);
  }

  /** Panel vpravo: vlastnosti výberu, bez výberu vlastnosti aktívneho pohľadu (ADR 0016). */
  function rightPanel() {
    const dispatch = projectStore.getState().dispatch;
    const el = selectedElement;
    if (el?.collection === 'bridgeAxes') {
      const axis = project.bridgeAxes.find((a) => a.id === el.id);
      if (axis)
        return (
          <PropertiesPalette
            sheet={bridgeAxisSheet({
              axis,
              alignments: project.alignments,
              onEditOffset: (which) => setAxisOffset({ axisId: axis.id, which }),
              dispatch,
            })}
          />
        );
    }
    if (el?.collection === 'terrains') {
      const terrain = project.terrains.find((t) => t.id === el.id);
      if (terrain)
        return (
          <PropertiesPalette
            sheet={terrainSheet({
              terrain,
              busy: dmrProgress !== undefined,
              onRedownload: () => void downloadDmrTerrain(terrain.id),
              dispatch,
            })}
          />
        );
    }
    if (el?.collection === 'planLines') {
      const line = project.planLines.find((l) => l.id === el.id);
      if (line)
        return (
          <PropertiesPalette
            sheet={planLineSheet({
              line,
              superstructures: project.superstructures,
              onVertices: () => setPlanLineVertices(line.id),
              dispatch,
            })}
          />
        );
    }
    if (el?.collection === 'supports') {
      const support = project.supports.find((x) => x.id === el.id);
      if (support)
        return (
          <PropertiesPalette
            wide
            sheet={supportSheet({
              support,
              result: supportState.supports.find((r) => r.support.id === support.id),
              decks: project.superstructures,
              lines: project.bearingLines,
              occupied: new Set(
                project.supports.filter((x) => x.id !== support.id).map((x) => x.bearingLine),
              ),
              onBearings: () => setBearingsOf(support.id),
              onDelete: deleteSelected,
              dispatch,
            })}
          />
        );
    }
    if (el?.collection === 'bearingLines') {
      const line = project.bearingLines.find((x) => x.id === el.id);
      if (line)
        return (
          <PropertiesPalette
            sheet={bearingLineSheet({
              line,
              result: supportState.lines.find((r) => r.line.id === line.id),
              decks: project.superstructures,
              supports: project.supports.filter((s) => s.bearingLine === line.id),
              spans: supportState.spans.get(line.superstructure),
              onAddSupport: () => addSupportOnLine(line.id),
              onSelectSupport: (id) => setSelectedElement({ collection: 'supports', id }),
              onDelete: deleteSelected,
              dispatch,
            })}
          />
        );
    }
    if (el?.collection === 'superstructures') {
      const deck = project.superstructures.find((x) => x.id === el.id);
      if (deck)
        return (
          <PropertiesPalette
            wide
            sheet={deckSheet({
              deck,
              profiles: project.profiles,
              axes: project.bridgeAxes,
              curveName: (law) =>
                law.curve.type === 'alignment'
                  ? law.curve.name
                  : (project.planLines.find(
                      (l) => law.curve.type === 'planLine' && l.id === law.curve.id,
                    )?.name ?? sk.edgeLaw.missing),
              spans: supportState.spans.get(deck.id),
              result: sections.results.find((r) => r.superstructure.id === deck.id),
              station: sectionAt,
              onEditLaw: (parameter) => setLawDialog({ deckId: deck.id, parameter }),
              onAddSupport: () => {
                setMode('2d');
                setTool('support');
              },
              onDelete: deleteSelected,
              dispatch,
            })}
          />
        );
    }
    if (el?.collection === 'profiles') {
      const profile = project.profiles.find((x) => x.id === el.id);
      if (profile)
        return (
          <PropertiesPalette
            sheet={profileSheet({
              profile,
              onTables: () => setProfileTables(profile.id),
              onEditGraphically: () => {
                setMode('section');
                setRibbonTab('contextual');
              },
              onDelete: deleteSelected,
              dispatch,
            })}
          />
        );
    }
    if (panelTarget === 'studyArea')
      return (
        <PropertiesPalette
          sheet={studyAreaSheet({
            road,
            area: project.studyArea,
            suggestion: (() => {
              const r = defaultDeckRange();
              return r && { from: r.from, to: r.to };
            })(),
            onMark: () => {
              setMode('2d');
              setTool('area');
            },
            dispatch,
          })}
        />
      );
    if (panelTarget === 'alignment' && item)
      return (
        <PropertiesPalette
          sheet={alignmentSheet(
            item,
            [...importIssuesOf(item.data.name), ...item.issues],
            project.crs.origin,
          )}
        />
      );
    if (mode === 'parameters')
      return (
        <ParameterPanel
          parameter={selectedParameter}
          issues={selectedParameter ? issuesOf(parameterState.issues, selectedParameter.name) : []}
          set={parameterState.set}
          alignmentRange={displayRange}
          referenceStation={station}
        />
      );
    return (
      <PropertiesPalette
        sheet={viewSheet({
          mode,
          exaggeration,
          setExaggeration,
          decks: roadDecks,
          profileDeckId: profileDeck?.id,
          setProfileDeckId,
          profileAxis: profile.axis,
          profileAxes: profile.options,
          setProfileAxis: setProfileAxisKey,
          edgeTerrain: edgeTerrainOn,
          setEdgeTerrain: setEdgeTerrainOn,
          canEdgeTerrain: profile.line?.kind === 'bridgeAxis' && tins.length > 0,
          dimensions: dimensionsOn,
          setDimensions: setDimensionsOn,
          section: {
            station: sectionAt,
            range: sectionRange,
            onStation: setSectionStation,
            results: sections.results,
          },
          view3d,
          setView3d,
          hasTerrain: project.terrains.length > 0,
          hasDeck: project.superstructures.length > 0,
        })}
      />
    );
  }

  /** Ľavá časť stavového riadka: výzva nástroja alebo poloha kurzora (hlásenie je vpravo). */
  function statusText(): string {
    if (tool === 'measure' && measureText) return measureText;
    if (tool !== 'none') return sk.ribbon.toolHints[tool];
    if (mode === 'section' && editedProfile) return sk.profileEditor.hints[profileTool];
    if (cursor && item && project.crs.origin)
      return formatCursor(cursor, item.alignment, project.crs.origin);
    return message ? '' : sk.statusBar.ready;
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
      <TitleBar
        projectName={project.name}
        canUndo={canUndo}
        canRedo={canRedo}
        onSave={() => downloadProject(projectStore.getState().project)}
        onUndo={() => projectStore.getState().undo()}
        onRedo={() => projectStore.getState().redo()}
      />
      <Ribbon
        tabs={tabs}
        active={ribbonTab}
        onActive={setRibbonTab}
        menu={<AppMenu sections={menuSections} />}
      />
      <input
        ref={projectInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void openProjectFile(file);
          e.target.value = '';
        }}
      />
      <input
        ref={landXmlInput}
        type="file"
        accept=".xml,.landxml"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void openLandXml(file);
          e.target.value = '';
        }}
      />
      <input
        ref={terrainInput}
        type="file"
        accept=".xml,.landxml,.tif,.tiff"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void openTerrainFile(file);
          e.target.value = '';
        }}
      />
      <aside className="panel panel-left" aria-label={sk.projectTree.title}>
        <ProjectBrowser
          projectName={project.name}
          tree={browser}
          selected={browserSelection}
          onSelect={selectTarget}
          onOpen={openTarget}
          onRename={renameTarget}
          onDelete={deleteTarget}
          canDuplicate={(target) => target.type === 'element' && target.collection !== 'terrains'}
          onDuplicate={(target) => target.type === 'element' && duplicate(target)}
          renameRequest={renameRequest}
          notices={openErrors}
          fileIssues={lastImport.fileIssues}
        />
      </aside>
      <Viewport
        mode={mode}
        onModeChange={setMode}
        alignment={item?.alignment}
        cursorS={cursor?.s}
        onPlanCursor={(c) => setCursor(c && { source: 'plan', ...c })}
        onProfileCursor={(c) =>
          setCursor(c && { source: 'profile', s: c.s, point: c.point, readout: c.readout })
        }
        planCursorPoint={cursor?.source === 'profile' ? cursor.point : undefined}
        onMeasure={setMeasureText}
        planDimensions={deckDimensions}
        profileDimensions={deckDimensions.find((d) => d.deckId === profileDeck?.id)?.chains}
        parametersView={
          <ParameterTable
            parameters={project.parameters}
            state={parameterState}
            referenceStation={station}
            onReferenceStation={setReferenceStation}
            range={displayRange}
            selectedId={selectedParameterId}
            onSelect={setSelectedParameterId}
          />
        }
        plan={planView}
        profile={
          profile.line && {
            line: profile.line,
            drawing: profileView,
            axis: profile.axis,
            title: profileTitle,
            edgeTerrain: profile.edgeTerrain,
          }
        }
        lineEditing={lineEditing}
        tool={tool}
        onTool={setTool}
        fitRequest={fitRequest}
        exaggeration={exaggeration}
        studyArea={studyAreaS}
        focus={viewFocus}
        onStudyArea={(range) => {
          setStudyAreaFrom(range);
          setSelectedElement(undefined);
          setPanelTarget('studyArea');
        }}
        goTo={goTo}
        otherAlignments={otherAlignments}
        planLines={project.planLines}
        onAddPlanLine={addPlanLine}
        onMovePlanLineVertex={movePlanLineVertex}
        selectedId={selectedElement?.id}
        view3d={
          <Suspense fallback={<p className="panel-empty centered">{sk.viewer3d.loading}</p>}>
            <Viewer3D
              project={project}
              alignment={item?.alignment}
              selected={
                selectedElement?.collection === 'superstructures'
                  ? { kind: 'superstructure', id: selectedElement.id }
                  : selectedElement?.collection === 'supports'
                    ? { kind: 'support', id: selectedElement.id }
                    : undefined
              }
              onSelect={(picked) => {
                if (!picked) {
                  setSelectedElement(undefined);
                  return;
                }
                const collection = picked.kind === 'support' ? 'supports' : 'superstructures';
                setSelectedElement({ collection, id: picked.id });
                const station = lineStationOf(picked.id);
                if (station !== undefined) setSectionStation(station);
              }}
              station={sectionAt}
              stationRange={sectionRange}
              onStation={setSectionStation}
              cut={cut}
              terrains={tins}
              cutOn={view3d.cut}
              terrainOn={view3d.terrain}
              basemap={view3d.basemap}
              exactOn={view3d.exact}
              onExactFailed={() => setView3d({ exact: false })}
              onExactReady={setExactReady}
              fitNonce={mode === '3d' ? fitRequest.nonce : 0}
              stepRequest={stepRequest}
            />
          </Suspense>
        }
        sectionView={
          editedProfile ? (
            <ProfileEditorView
              key={editedProfile.def.id}
              profile={editedProfile.def}
              values={editedProfile.values}
              globals={editedProfile.globals}
              station={sectionAt}
              source={editedProfile.source}
              stationControl={
                <StationControl
                  station={sectionAt}
                  range={sectionRange}
                  onStation={setSectionStation}
                />
              }
              selectedPoint={profilePoint}
              onSelectPoint={setProfilePoint}
              onMessage={setMessage}
              onChange={(next) => {
                const { id, ...changes } = next;
                projectStore
                  .getState()
                  .dispatch({ type: 'updateElement', collection: 'profiles', id, changes });
              }}
              tool={profileTool}
              loopRole={loopRole}
              fitRequest={fitRequest}
            />
          ) : (
            <SectionView
              sections={drawnSections}
              station={sectionAt}
              range={sectionRange}
              onStation={setSectionStation}
              elapsed={sections.elapsed}
              selectedId={selectedSuperstructureId}
              onSelect={(id) => setSelectedElement({ collection: 'superstructures', id })}
              canInsert={defaultDeckRange() !== undefined}
              supports={sectionSupports}
              terrain={sectionTerrain}
              drawing={sectionView}
              fitRequest={fitRequest}
              emptyActions={
                <div className="toolbar">
                  <button
                    type="button"
                    className="button primary"
                    disabled={!defaultDeckRange()}
                    onClick={openDeckDialog}
                  >
                    {sk.ribbon.deck}
                  </button>
                  <button type="button" className="button" onClick={insertTwinExample}>
                    {sk.section.insertExample}
                  </button>
                </div>
              }
            />
          )
        }
      />
      {rightPanel()}
      <footer className="app-status">
        <span className="status-main">{statusText()}</span>
        {message && <span className="status-message">{message}</span>}
      </footer>
      {dragging && <div className="drop-overlay">{sk.import.dropHint}</div>}
      {libraryOpen && (
        <ProfileLibraryDialog
          onClose={() => setLibraryOpen(false)}
          onMessage={setMessage}
          onInserted={(id, name) => {
            setSelectedElement({ collection: 'profiles', id });
            setMessage(sk.library.inserted(name));
          }}
        />
      )}
      {projectInfoOpen && <ProjectInfoDialog onClose={() => setProjectInfoOpen(false)} />}
      {axisOffset && (
        <AxisOffsetDialog
          axisId={axisOffset.axisId}
          which={axisOffset.which}
          range={sectionRange ?? { from: 0, to: 100 }}
          onClose={() => setAxisOffset(undefined)}
        />
      )}
      {profileTables && (
        <ProfileTablesDialog
          profileId={profileTables}
          selectedPoint={profilePoint}
          onSelectPoint={setProfilePoint}
          onClose={() => setProfileTables(undefined)}
        />
      )}
      {bearingsOf && (
        <BearingsDialog
          supportId={bearingsOf}
          result={supportState.supports.find((r) => r.support.id === bearingsOf)}
          onClose={() => setBearingsOf(undefined)}
        />
      )}
      {lawDialog && (
        <ProfileLawDialog
          deckId={lawDialog.deckId}
          parameter={lawDialog.parameter}
          ctx={sectionContext}
          onClose={() => setLawDialog(undefined)}
        />
      )}
      {planLineVertices && (
        <PlanLineVerticesDialog
          lineId={planLineVertices}
          onClose={() => setPlanLineVertices(undefined)}
        />
      )}
      {spanLayoutDeck && (
        <SpanLayoutDialog
          decks={roadDecks.map((d) => ({ id: d.id, name: d.name }))}
          deckId={spanLayoutDeck}
          defaults={spanLayoutDefaults}
          preview={(form) =>
            spanLayoutStations(form)?.layout.stations.map(
              (s) => road?.stationing.toDisplay(s).station ?? s,
            )
          }
          templates={{
            pier: [
              ...project.supports
                .filter((s) => s.kind === 'pier')
                .map((s) => ({ value: s.id, label: sk.spanLayout.like(s.name, deckNameOf(s)) })),
              { value: '', label: sk.spanLayout.defaultWall },
              { value: 'columns', label: sk.spanLayout.defaultColumns },
            ],
            abutment: [
              ...project.supports
                .filter((s) => s.kind === 'abutment')
                .map((s) => ({ value: s.id, label: sk.spanLayout.like(s.name, deckNameOf(s)) })),
              { value: '', label: sk.spanLayout.defaultAbutment },
            ],
          }}
          onApply={applySpanLayout}
          onClose={() => setSpanLayoutDeck(undefined)}
        />
      )}
      {deckDialog &&
        (() => {
          const range = defaultDeckRange();
          return (
            range && (
              <DeckInsertDialog
                alignment={range.road.name}
                range={{ from: range.from, to: range.to }}
                onClose={() => setDeckDialog(false)}
                onExample={() => {
                  setDeckDialog(false);
                  insertTwinExample();
                }}
                onInserted={(id, name, r) => {
                  setDeckDialog(false);
                  setSelectedElement({ collection: 'superstructures', id });
                  setSectionStation((r.from + r.to) / 2);
                  setMode('section');
                  setMessage(sk.deckInsert.inserted(name));
                }}
              />
            )
          );
        })()}
      {terrainFile && (
        <TerrainImportDialog
          file={terrainFile}
          alignmentName={project.crs.origin ? item?.alignment.name : undefined}
          busy={terrainBusy}
          onConfirm={(selected, options) => void importTerrains(selected, options)}
          onCancel={() => setTerrainFile(undefined)}
        />
      )}
    </div>
  );
}
