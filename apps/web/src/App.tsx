import { type AlignmentIssue, formatStation } from '@bridge/alignment';
import {
  type Drawing,
  planDrawing,
  profileDrawing,
  projectSupport,
  sectionDrawing,
  toDxf,
  toSvg,
  translate,
} from '@bridge/drawing';
import type { Vec2 } from '@bridge/geom';
import { createEmptyProject, evaluateLaw, openProject, type TerrainSurface } from '@bridge/model';
import {
  bridgeAxisPlan,
  evaluateSuperstructure,
  globalScope,
  profileParameterValues,
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
import { deckSheet, profileSheet, supportSheet } from './layout/properties/elementSheets.tsx';
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
import { TerrainImportDialog } from './layout/TerrainImportDialog.tsx';
import { VIEW_TABS, type ViewMode, Viewport } from './layout/Viewport.tsx';
import { loadAutosave, startAutosave } from './persistence/autosave.ts';
import { downloadProject, downloadText } from './persistence/fileIO.ts';
import { drawingFileName } from './persistence/fileName.ts';
import { type BrowserTarget, browserTree } from './store/browserTree.ts';
import type { ElementCollection } from './store/commands.ts';
import { alignmentsByName, useEvaluatedAlignments } from './store/derived.ts';
import { useDeckDrawings } from './store/drawings.ts';
import { duplicateElement } from './store/duplicate.ts';
import { issuesOf, newId, useParameterState } from './store/parameters.ts';
import { projectStore, useProject } from './store/projectStore.ts';
import { useSectionResults } from './store/sections.ts';
import { defaultSupport, useAxisLengths, useSupportState } from './store/supports.ts';
import {
  terrainCrossSections,
  terrainProfiles,
  terrainProfilesAlong,
  useTerrainTins,
} from './store/terrain.ts';
import type { Cut } from './viewer/sceneView.ts';
import { GoToStation } from './views/GoToStation.tsx';
import { ParameterTable } from './views/ParameterTable.tsx';
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
  const [terrainFile, setTerrainFile] = useState<TerrainFile>();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [deckDialog, setDeckDialog] = useState(false);
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
    const deck = project.superstructures.find((d) => d.id === r.support.superstructure);
    const axis = project.bridgeAxes.find((a) => a.id === deck?.bridgeAxis);
    return axis !== undefined && axis.alignment === item?.data.name;
  });

  const deckDrawings = useDeckDrawings(alignmentMap, parameterState.set, supportState.supports);
  const roadDecks = deckDrawings.filter((d) => d.road === item?.data.name);
  const profileDeck =
    roadDecks.find((d) => d.id === (profileDeckId ?? selectedSuperstructureId)) ?? roadDecks[0];
  /** terén pozdĺž osi mosta vybranej NK (bez NK pozdĺž osi cesty) */
  const profileTerrain = useMemo(() => {
    if (!road || tins.length === 0) return [];
    const sup = project.superstructures.find((d) => d.id === profileDeck?.id);
    const axis = project.bridgeAxes.find((a) => a.id === sup?.bridgeAxis);
    if (!axis) return terrainProfiles(tins, road);
    const line = bridgeAxisPlan(axis, road, parameterState.set, 0, road.length);
    return terrainProfilesAlong(tins, line, road.origin.z);
  }, [
    tins,
    road,
    profileDeck?.id,
    project.superstructures,
    project.bridgeAxes,
    parameterState.set,
  ]);
  const profileView = useMemo(
    () =>
      road &&
      profileDrawing({
        alignment: road,
        decks: profileDeck ? [{ id: profileDeck.id, cut: profileDeck.longitudinal }] : [],
        supports: profileDeck?.supports ?? [],
        terrain: profileTerrain.flatMap((t) => t.runs),
      }),
    [road, profileDeck, profileTerrain],
  );

  /** Pohľady na podpery v priereze na aktuálnom staničení (± 0,5 m). */
  const sectionSupports = roadSupports
    .filter((r) => Math.abs(r.support.station - sectionAt) <= 0.5 && r.axis)
    .flatMap((r) => projectSupport(r, item?.alignment.origin.z ?? 0) ?? []);

  const otherAlignments = useMemo(
    () => alignments.filter((a) => a.alignment !== road).map((a) => a.alignment),
    [alignments, road],
  );
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

  /** Klik v pôdoryse: podpera pre NK, ktorej rozsah obsahuje staničenie a ktorej os je najbližšie ku kliknutiu. */
  function addSupportAt(s: number, offset: number) {
    const road = item?.alignment;
    if (!road) return;
    const station = Math.round(road.stationing.toDisplay(s).station * 1000) / 1000;
    const scope = globalScope(parameterState.set, station);
    const candidates = project.superstructures
      .filter((d) => station >= d.from && station <= d.to)
      .map((d) => {
        const axis = project.bridgeAxes.find(
          (a) => a.id === d.bridgeAxis && a.alignment === road.name,
        );
        const h = axis ? evaluateLaw(axis.horizontalOffset, 'length', scope, station) : undefined;
        return { d, distance: h?.ok ? Math.abs(h.value - offset) : Number.POSITIVE_INFINITY };
      })
      .filter((c) => Number.isFinite(c.distance))
      .sort((a, b) => a.distance - b.distance);
    const deck = candidates[0]?.d;
    if (!deck) {
      setMessage(sk.supports.noDeckHere);
      return;
    }
    const nearEnd = station - deck.from < 2 || deck.to - station < 2;
    const kind = nearEnd ? 'abutment' : 'pier';
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
    const support = defaultSupport(
      newId('sup'),
      `${prefix}${n}`,
      kind,
      deck.id,
      station,
      soffit,
      width,
    );
    projectStore.getState().dispatch({ type: 'addElements', supports: [support] });
    setSelectedElement({ collection: 'supports', id: support.id });
    setSectionStation(station);
    setMessage(undefined);
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
        const support = project.supports.find((x) => x.id === target.id);
        if (support) setSectionStation(support.station);
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

  /** Staničenie prvku na priblíženie (podpera, stred NK). */
  function targetStation(target: BrowserTarget): number | undefined {
    if (target.type !== 'element') return undefined;
    const support = project.supports.find((x) => x.id === target.id);
    if (support) return support.station;
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
              onBearings: () => setBearingsOf(support.id),
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

  function statusText(): string {
    if (message) return message;
    if (tool !== 'none') return sk.ribbon.toolHints[tool];
    if (mode === 'section' && editedProfile) return sk.profileEditor.hints[profileTool];
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
        onProfileCursor={(s) => setCursor(s === undefined ? undefined : { source: 'profile', s })}
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
        profile={profileView}
        onAddSupport={addSupportAt}
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
                const support = project.supports.find((x) => x.id === picked.id);
                if (support) setSectionStation(support.station);
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
      <footer className="app-status">{statusText()}</footer>
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
