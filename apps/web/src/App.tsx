import type { AlignmentIssue } from '@bridge/alignment';
import { createEmptyProject, evaluateLaw, openProject } from '@bridge/model';
import {
  globalScope,
  singleBeamHaunched,
  singleDeckExample,
  supportElevation,
  twinDeckExample,
} from '@bridge/sections';
import { type DragEvent, lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { type CursorInfo, formatCursor } from './format/cursor.ts';
import { formatModelIssue } from './i18n/modelIssues.ts';
import { sk } from './i18n/sk.ts';
import { fileLevelIssues, importLandXml } from './import/importLandXml.ts';
import { ElementPanel } from './layout/ElementPanel.tsx';
import { ParameterPanel } from './layout/ParameterPanel.tsx';
import { ProjectTree } from './layout/ProjectTree.tsx';
import { PropertiesPanel } from './layout/PropertiesPanel.tsx';
import { SectionPanel } from './layout/SectionPanel.tsx';
import { type ViewMode, Viewport } from './layout/Viewport.tsx';
import { loadAutosave, startAutosave } from './persistence/autosave.ts';
import { downloadProject } from './persistence/fileIO.ts';
import type { ElementCollection } from './store/commands.ts';
import { alignmentsByName, useEvaluatedAlignments } from './store/derived.ts';
import { issuesOf, newId, useParameterState } from './store/parameters.ts';
import { projectStore, useProject } from './store/projectStore.ts';
import { useSectionResults } from './store/sections.ts';
import { defaultSupport, useSupportState } from './store/supports.ts';
import { ParameterTable } from './views/ParameterTable.tsx';
import { SectionView } from './views/SectionView.tsx';

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

  /** Rozsah novej NK: štvrtina rozsahu nivelety, najviac 200 m (zobrazované staničenie). */
  function defaultDeckRange():
    | { road: NonNullable<typeof item>['alignment']; from: number; to: number }
    | undefined {
    const road = item?.alignment;
    const profile = road?.profile;
    if (!road || !profile) return undefined;
    const start = road.stationing.toDisplay(profile.startS).station;
    const end = road.stationing.toDisplay(profile.endS).station;
    const from = Math.round(start + (end - start) * 0.25);
    return { road, from, to: Math.round(Math.min(end, from + 200)) };
  }

  /** Podpery na osiach mosta vedených po zobrazenej osi cesty (pre pôdorys a profil). */
  const roadSupports = supportState.supports.filter((r) => {
    const deck = project.superstructures.find((d) => d.id === r.support.superstructure);
    const axis = project.bridgeAxes.find((a) => a.id === deck?.bridgeAxis);
    return axis !== undefined && axis.alignment === item?.data.name;
  });

  /** Pohľady na podpery v priereze na aktuálnom staničení (± 0,5 m). */
  const sectionSupports = roadSupports
    .filter((r) => Math.abs(r.support.station - sectionAt) <= 0.5 && r.axis)
    .flatMap((r) => {
      const el = supportElevation(r);
      if (!el || !r.axis) return [];
      const dx = r.axis.horizontalOffset;
      const z0 = item?.alignment.origin.z ?? 0;
      const move = (poly: readonly { x: number; y: number }[]) =>
        poly.map((p) => ({ x: p.x + dx, y: p.y + z0 }));
      return [
        {
          id: r.support.id,
          name: r.support.name,
          body: el.body.map(move),
          footing: move(el.footing),
        },
      ];
    });

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
    const support = defaultSupport(newId('sup'), `${prefix}${n}`, kind, deck.id, station, soffit);
    projectStore.getState().dispatch({ type: 'addElements', supports: [support] });
    setSelectedElement({ collection: 'supports', id: support.id });
    setSectionStation(station);
    setMessage(undefined);
  }

  function insertExample(template: 'twin' | 'single') {
    const range = defaultDeckRange();
    if (!range) {
      // bez osi cesty aspoň vložíme prierez a otvoríme jeho editor
      if (template === 'single') {
        const id = newId('prof');
        projectStore
          .getState()
          .dispatch({ type: 'addElements', profiles: [singleBeamHaunched(id)] });
        setSelectedElement({ collection: 'profiles', id });
      }
      setMessage(sk.section.needsAlignment);
      setMode('section');
      return;
    }
    const { road, from, to } = range;
    const example =
      template === 'twin'
        ? twinDeckExample(road.name, from, to, {
            left: newId('nk'),
            right: newId('nk'),
            profile: newId('prof'),
            leftAxis: newId('axis'),
            rightAxis: newId('axis'),
          })
        : singleDeckExample(road.name, from, to, {
            deck: newId('nk'),
            profile: newId('prof'),
            axis: newId('axis'),
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

  useEffect(() => {
    let cancelled = false;
    void loadAutosave().then((saved) => {
      if (cancelled || !saved) return;
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
        </div>
      </header>
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
        ]}
        selectedElement={selectedElement}
        onSelectElement={(collection, id) => {
          setSelectedElement({ collection, id });
          const support = project.supports.find((x) => x.id === id);
          if (support) setSectionStation(support.station);
          // 3D ukazuje NK aj podpery; inak podpery v pôdoryse a profile, ostatné prvky v priereze
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
        supports={roadSupports}
        onAddSupport={addSupportAt}
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
            />
          </Suspense>
        }
        sectionView={
          <SectionView
            sections={sections.results.flatMap((r) => (r.drawn ? [r.drawn] : []))}
            station={sectionAt}
            range={sectionRange}
            onStation={setSectionStation}
            elapsed={sections.elapsed}
            selectedId={selectedSuperstructureId}
            onSelect={(id) => setSelectedElement({ collection: 'superstructures', id })}
            canInsert={defaultDeckRange() !== undefined}
            supports={sectionSupports}
            onInsert={insertExample}
            emptyActions={
              <div className="toolbar">
                <button type="button" className="button" onClick={() => insertExample('twin')}>
                  {sk.section.insertExample}
                </button>
                <button type="button" className="button" onClick={() => insertExample('single')}>
                  {sk.section.insertTemplate}
                </button>
              </div>
            }
          />
        }
      />
      {mode !== 'parameters' && selectedElement ? (
        <ElementPanel
          collection={selectedElement.collection}
          id={selectedElement.id}
          result={sections.results.find((r) => r.superstructure.id === selectedElement.id)}
          supportResult={supportState.supports.find((r) => r.support.id === selectedElement.id)}
          spans={supportState.spans.get(selectedElement.id)}
          onRemoved={() => setSelectedElement(undefined)}
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
    </div>
  );
}
