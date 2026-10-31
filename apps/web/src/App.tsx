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
import { BriefPanel } from './layout/BriefPanel.tsx';
import { DeckInsertDialog } from './layout/DeckInsertDialog.tsx';
import { ElementPanel } from './layout/ElementPanel.tsx';
import { ParameterPanel } from './layout/ParameterPanel.tsx';
import { ProfileLibraryDialog } from './layout/ProfileLibraryDialog.tsx';
import { ProjectTree } from './layout/ProjectTree.tsx';
import { PropertiesPanel } from './layout/PropertiesPanel.tsx';
import { SectionPanel } from './layout/SectionPanel.tsx';
import { StudyAreaPanel } from './layout/StudyAreaPanel.tsx';
import { TerrainImportDialog } from './layout/TerrainImportDialog.tsx';
import { type ViewMode, Viewport } from './layout/Viewport.tsx';
import { type StepAction, WorkflowPanel } from './layout/WorkflowPanel.tsx';
import { loadAutosave, startAutosave } from './persistence/autosave.ts';
import { downloadProject, downloadText } from './persistence/fileIO.ts';
import { drawingFileName } from './persistence/fileName.ts';
import type { ElementCollection } from './store/commands.ts';
import { alignmentsByName, useEvaluatedAlignments } from './store/derived.ts';
import { useDeckDrawings } from './store/drawings.ts';
import { issuesOf, newId, useParameterState } from './store/parameters.ts';
import { projectStore, useProject } from './store/projectStore.ts';
import { useSectionResults } from './store/sections.ts';
import { defaultSupport, useSupportState } from './store/supports.ts';
import {
  terrainCrossSections,
  terrainProfiles,
  terrainProfilesAlong,
  useTerrainTins,
} from './store/terrain.ts';
import { type StepId, workflowSteps } from './store/workflow.ts';
import type { Cut } from './viewer/sceneView.ts';
import type { ExportFormat } from './views/ExportMenu.tsx';
import { ParameterTable } from './views/ParameterTable.tsx';
import { ProfileEditorView } from './views/ProfileEditorView.tsx';
import { SectionView } from './views/SectionView.tsx';
import { StationControl } from './views/StationControl.tsx';

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
  /** rozbalený krok postupu a panel vpravo otvorený z postupu (Fáza 10a) */
  const [expandedStep, setExpandedStep] = useState<StepId>();
  const [sidePanel, setSidePanel] = useState<'brief' | 'studyArea'>();
  /** žiadosti o nástroj „Pridať podperu“ v pôdoryse a „Oblasť mosta“ v profile (počítadlá, aby sa dali zopakovať) */
  const [supportToolRequest, setSupportToolRequest] = useState(0);
  const [areaToolRequest, setAreaToolRequest] = useState(0);
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
  const supportState = useSupportState(alignmentMap, parameterState.set);
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
  function exportDrawing(drawing: Drawing | undefined, view: string, format: ExportFormat) {
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

  const steps = workflowSteps({
    brief: project.brief,
    alignments: alignments.map((a) => ({
      hasProfile: a.alignment.profile !== undefined,
      errors: [...a.issues, ...importIssuesOf(a.data.name)].filter((i) => i.severity === 'error')
        .length,
    })),
    terrains: project.terrains.length,
    hasStudyArea: project.studyArea !== null,
    decks: sections.results.map((r) => ({
      errors: r.issues.filter((i) => i.severity !== 'warning').length,
    })),
    spans: project.superstructures.flatMap((sup) => {
      const spans = supportState.spans.get(sup.id);
      if (!spans) return [];
      const supportErrors = supportState.supports
        .filter((r) => r.support.superstructure === sup.id)
        .flatMap((r) => r.issues.filter((i) => i.severity !== 'warning'));
      return [
        {
          supports: spans.supports.length,
          errors:
            supportErrors.length + spans.issues.filter((i) => i.severity !== 'warning').length,
          warnings: spans.issues.filter((i) => i.severity === 'warning').length,
        },
      ];
    }),
  });
  const hasRoad = alignments.some((a) => a.alignment.profile !== undefined);
  const stepActions: Partial<Record<StepId, StepAction[]>> = {
    brief: [
      {
        label: sk.workflow.actions.editBrief,
        onClick: () => {
          setSelectedElement(undefined);
          setSidePanel('brief');
        },
      },
    ],
    sources: [
      { label: sk.import.button, onClick: () => landXmlInput.current?.click() },
      {
        label: sk.terrain.import,
        onClick: () => terrainInput.current?.click(),
        disabled: !project.crs.origin,
      },
      {
        label: sk.terrain.download,
        onClick: () => void downloadDmrTerrain(),
        disabled: !hasRoad || project.terrains.length > 0 || dmrProgress !== undefined,
      },
    ],
    studyArea: [
      {
        label: sk.workflow.actions.markStudyArea,
        onClick: () => {
          setMode('2d');
          setAreaToolRequest((n) => n + 1);
        },
        disabled: !hasRoad,
      },
      {
        label: sk.workflow.actions.editStudyArea,
        onClick: () => {
          setSelectedElement(undefined);
          setSidePanel('studyArea');
        },
      },
    ],
    deck: [
      {
        label: sk.workflow.actions.insertDeck,
        onClick: openDeckDialog,
        disabled: !hasRoad,
      },
      { label: sk.library.open, onClick: () => setLibraryOpen(true) },
    ],
    supports: [
      {
        label: sk.workflow.actions.addSupport,
        onClick: () => {
          setMode('2d');
          setSupportToolRequest((n) => n + 1);
        },
        disabled: project.superstructures.length === 0,
      },
    ],
    outputs: [
      { label: sk.workflow.actions.open3d, onClick: () => setMode('3d') },
      { label: sk.workflow.actions.open2d, onClick: () => setMode('2d') },
      { label: sk.workflow.actions.openSection, onClick: () => setMode('section') },
    ],
  };

  // výber prvku v strome, v 3D alebo po vložení zavrie panel otvorený z postupu
  useEffect(() => {
    if (selectedElement) setSidePanel(undefined);
  }, [selectedElement]);

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
      setExpandedStep('studyArea');
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

  function statusText(): string {
    if (message) return message;
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
      <header className="app-header">
        <span className="app-title">{sk.app.title}</span>
        <div className="toolbar">
          <button type="button" className="button" onClick={newProject}>
            {sk.persistence.newProject}
          </button>
          <label className="button">
            {sk.persistence.open}
            <input
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void openProjectFile(file);
                e.target.value = '';
              }}
            />
          </label>
          <button
            type="button"
            className="button"
            onClick={() => downloadProject(projectStore.getState().project)}
          >
            {sk.persistence.save}
          </button>
          <span className="toolbar-separator" />
          <button
            type="button"
            className="button"
            disabled={!canUndo}
            title={sk.history.undoShortcut}
            onClick={() => projectStore.getState().undo()}
          >
            {sk.history.undo}
          </button>
          <button
            type="button"
            className="button"
            disabled={!canRedo}
            title={sk.history.redoShortcut}
            onClick={() => projectStore.getState().redo()}
          >
            {sk.history.redo}
          </button>
          <label className="button">
            {sk.import.button}
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
          </label>
          <label className="button">
            {sk.terrain.import}
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
          </label>
        </div>
      </header>
      <aside className="panel panel-left" aria-label={sk.projectTree.title}>
        <WorkflowPanel
          steps={steps}
          actions={stepActions}
          expanded={expandedStep}
          onExpand={(id) => {
            setExpandedStep(id);
            if (id === 'brief' || id === 'studyArea') {
              setSelectedElement(undefined);
              setSidePanel(id);
            } else {
              setSidePanel(undefined);
            }
          }}
        />
        <ProjectTree
          projectName={project.name}
          alignments={alignments}
          issueCount={(name) =>
            importIssuesOf(name).length +
            (alignments.find((a) => a.data.name === name)?.issues.length ?? 0)
          }
          parameters={project.parameters.map((p) => ({
            id: p.id,
            name: p.name,
            issues: issuesOf(parameterState.issues, p.name).length,
          }))}
          selectedParameterId={mode === 'parameters' ? selectedParameterId : undefined}
          onSelectParameter={(id) => {
            setSelectedParameterId(id);
            setMode('parameters');
            setSidePanel(undefined);
          }}
          fileIssues={lastImport.fileIssues}
          elements={[
            {
              collection: 'bridgeAxes',
              title: sk.tree.bridgeAxes,
              items: project.bridgeAxes.map((a) => ({ id: a.id, name: a.name, issues: 0 })),
            },
            {
              collection: 'profiles',
              title: sk.tree.profiles,
              items: project.profiles.map((p) => ({ id: p.id, name: p.name, issues: 0 })),
            },
            {
              collection: 'superstructures',
              title: sk.tree.superstructures,
              items: sections.results.map((r) => ({
                id: r.superstructure.id,
                name: r.superstructure.name,
                issues: r.issues.filter((i) => i.severity !== 'warning').length,
              })),
            },
            {
              collection: 'supports',
              title: sk.tree.supports,
              items: supportState.supports.map((r) => ({
                id: r.support.id,
                name: r.support.name,
                issues: r.issues.filter((i) => i.severity !== 'warning').length,
              })),
            },
            {
              collection: 'terrains',
              title: sk.tree.terrains,
              items: project.terrains.map((t) => ({ id: t.id, name: t.name, issues: 0 })),
            },
            {
              collection: 'planLines',
              title: sk.tree.planLines,
              items: project.planLines.map((l) => ({ id: l.id, name: l.name, issues: 0 })),
            },
          ]}
          selectedElement={selectedElement}
          onSelectElement={(collection, id) => {
            setSelectedElement({ collection, id });
            const support = project.supports.find((x) => x.id === id);
            if (support) setSectionStation(support.station);
            // 3D ukazuje NK aj podpery; inak podpery v pôdoryse a profile, ostatné prvky v priereze
            if (collection === 'terrains') return;
            // čiary sa upravujú v pôdoryse
            if (collection === 'planLines') {
              setMode('2d');
              return;
            }
            if (mode === '3d' && (collection === 'supports' || collection === 'superstructures'))
              return;
            if (collection !== 'supports') setMode('section');
            else if (mode !== '2d' && mode !== 'section') setMode('2d');
          }}
          notices={openErrors}
          selected={selected}
          onSelect={(i) => {
            setSelected(i);
            setSelectedElement(undefined);
          }}
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
        onAddSupport={addSupportAt}
        supportToolRequest={supportToolRequest}
        studyArea={studyAreaS}
        focus={viewFocus}
        onStudyArea={setStudyAreaFrom}
        areaToolRequest={areaToolRequest}
        goTo={goTo}
        onGoTo={(s) => {
          setGoTo((g) => ({ s, nonce: (g?.nonce ?? 0) + 1 }));
          setCursor({ source: 'profile', s });
        }}
        terrainDownload={
          hasRoad && project.terrains.length === 0
            ? {
                progress: dmrProgress,
                onDownload: () => void downloadDmrTerrain(),
                onCancel: () => {
                  dmrCancel.current = true;
                },
              }
            : undefined
        }
        otherAlignments={otherAlignments}
        planLines={project.planLines}
        onAddPlanLine={addPlanLine}
        onMovePlanLineVertex={movePlanLineVertex}
        profile={{
          drawing: profileView,
          decks: roadDecks,
          deckId: profileDeck?.id,
          onDeck: setProfileDeckId,
          onExport: (format) =>
            exportDrawing(profileView, sk.export.names.profile(profileDeck?.name ?? ''), format),
        }}
        onExportPlan={(format, coordinates) => {
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
            coordinates === 'sjtsk' && origin ? translate(drawing, origin.x, origin.y) : drawing,
            sk.export.names.plan,
            format,
          );
        }}
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
              terrainProgress={dmrProgress}
              onRequestTerrain={() => void downloadDmrTerrain()}
              onCancelTerrain={() => {
                dmrCancel.current = true;
              }}
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
              onExport={(format) =>
                exportDrawing(
                  sectionView,
                  sk.export.names.section(formatStation(sectionAt, 3)),
                  format,
                )
              }
              onAddDeck={openDeckDialog}
              onOpenLibrary={() => setLibraryOpen(true)}
              emptyActions={
                <div className="toolbar">
                  <button
                    type="button"
                    className="button primary"
                    disabled={!defaultDeckRange()}
                    onClick={openDeckDialog}
                  >
                    {sk.workflow.actions.insertDeck}
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
      {sidePanel === 'brief' ? (
        <BriefPanel />
      ) : sidePanel === 'studyArea' ? (
        <StudyAreaPanel
          road={road}
          suggestion={(() => {
            const r = defaultDeckRange();
            return r && { from: r.from, to: r.to };
          })()}
          onMark={() => {
            setMode('2d');
            setAreaToolRequest((n) => n + 1);
          }}
        />
      ) : mode !== 'parameters' && selectedElement ? (
        <ElementPanel
          collection={selectedElement.collection}
          id={selectedElement.id}
          result={sections.results.find((r) => r.superstructure.id === selectedElement.id)}
          supportResult={supportState.supports.find((r) => r.support.id === selectedElement.id)}
          spans={supportState.spans.get(selectedElement.id)}
          terrainBusy={dmrProgress !== undefined}
          onRedownloadTerrain={(id) => void downloadDmrTerrain(id)}
          onRemoved={() => setSelectedElement(undefined)}
          sectionContext={sectionContext}
          selectedPoint={profilePoint}
          onSelectPoint={setProfilePoint}
        />
      ) : mode === 'section' ? (
        <SectionPanel results={sections.results} selectedId={undefined} />
      ) : mode === 'parameters' ? (
        <ParameterPanel
          parameter={selectedParameter}
          issues={selectedParameter ? issuesOf(parameterState.issues, selectedParameter.name) : []}
          set={parameterState.set}
          alignmentRange={displayRange}
          referenceStation={station}
        />
      ) : (
        <PropertiesPanel
          item={item}
          importIssues={item ? importIssuesOf(item.data.name) : []}
          origin={project.crs.origin}
        />
      )}
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
