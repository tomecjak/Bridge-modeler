import type { Alignment } from '@bridge/alignment';
import { sampleHorizontal } from '@bridge/drawing';
import type { ProjectFile } from '@bridge/model';
import { type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { sk } from '../i18n/sk.ts';
import { downloadText } from '../persistence/fileIO.ts';
import { drawingFileName } from '../persistence/fileName.ts';
import type { TerrainTin } from '../store/terrain.ts';
import { StationControl } from '../views/StationControl.tsx';
import { BASEMAPS, type BasemapKind, loadBasemap } from './basemap.ts';

export type { BasemapKind };

import { sceneSurveys } from '../store/survey.ts';
import { type Cut, type Picked, SceneView } from './sceneView.ts';
import { terrainBuffers } from './terrainMesh.ts';
import { useExactWorker, useMeshWorker } from './useMeshWorker.ts';

export interface Viewer3DProps {
  project: ProjectFile;
  /** os cesty zobrazená ako 3D čiara */
  alignment: Alignment | undefined;
  selected: Picked | undefined;
  onSelect: (picked: Picked | undefined) => void;
  /** rez na staničení zo záložky Prierez (zobrazované staničenie, rozsah NK, rovina a prierezy NK) */
  station: number;
  stationRange: { from: number; to: number } | undefined;
  onStation: (station: number) => void;
  cut: Cut | undefined;
  /** TIN terénov projektu (sieť sa zostaví pri ich zmene) */
  terrains: readonly TerrainTin[];
  /** prepínače 3D z ribbonu (ADR 0016) */
  cutOn: boolean;
  terrainOn: boolean;
  basemap: BasemapKind;
  /** presný model cez OpenCascade (ADR 0014) */
  exactOn: boolean;
  /** pri chybe presného modelu sa vráti sieť */
  onExactFailed: () => void;
  /** presný model je vypočítaný (dá sa exportovať STEP) */
  onExactReady: (ready: boolean) => void;
  /** Prispôsobiť z ribbonu (nová hodnota `nonce`) */
  fitNonce: number;
  /** export STEP z menu Súbor (nová hodnota `nonce`) */
  stepRequest: { sjtsk: boolean; nonce: number } | undefined;
}

/** Posun myši, do ktorého sa uvoľnenie tlačidla berie ako klik (výber), nie ťahanie [px]. */
const CLICK_TOLERANCE = 3;

/** Farby scény z tém aplikácie (CSS premenné). */
function readTheme() {
  const css = getComputedStyle(document.documentElement);
  return {
    background: css.getPropertyValue('--canvas').trim() || '#e9ecf1',
    accent: css.getPropertyValue('--accent').trim() || '#2563eb',
    edges: '#2b2f36',
    cut: '#d9773a',
    survey: css.getPropertyValue('--survey').trim() || '#57534e',
  };
}

/** Body osi cesty v lokálnych súradniciach (s výškou nivelety); bez nivelety prázdne. */
function axisPoints(alignment: Alignment | undefined) {
  if (!alignment?.profile) return [];
  return sampleHorizontal(alignment, 2).flatMap((p) => {
    try {
      return [{ x: p.x, y: p.y, z: alignment.evaluate(p.s).point.z }];
    } catch {
      return []; // mimo nivelety
    }
  });
}

export default function Viewer3D({
  project,
  alignment,
  selected,
  onSelect,
  station,
  stationRange,
  onStation,
  cut,
  terrains,
  cutOn,
  terrainOn,
  basemap,
  exactOn,
  onExactFailed,
  onExactReady,
  fitNonce,
  stepRequest,
}: Viewer3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<SceneView | undefined>(undefined);
  const down = useRef<{ x: number; y: number } | undefined>(undefined);
  const [info, setInfo] = useState<{ count: number; elapsed: number }>();
  const [error, setError] = useState<string>();
  const terrainMeshes = useMemo(() => terrains.map((t) => terrainBuffers(t.tin)), [terrains]);
  const [maps, setMaps] = useState<(HTMLImageElement | undefined)[]>([]);
  const [mapNote, setMapNote] = useState<string>();
  const [stepNote, setStepNote] = useState<string>();
  const origin = project.crs.origin;

  // obrázok mapy ZBGIS cez obálku každého terénu (EPSG:5514)
  useEffect(() => {
    if (basemap === 'none' || !origin || terrains.length === 0) {
      setMaps([]);
      setMapNote(undefined);
      return;
    }
    const src = BASEMAPS[basemap];
    let cancelled = false;
    setMapNote(sk.viewer3d.mapLoading(src.label));
    void Promise.all(
      terrains.map((t) => {
        const b = t.tin.bounds;
        return loadBasemap(src, {
          minX: b.minX + origin.x,
          minY: b.minY + origin.y,
          maxX: b.maxX + origin.x,
          maxY: b.maxY + origin.y,
        }).catch(() => undefined);
      }),
    ).then((images) => {
      if (cancelled) return;
      setMaps(images);
      setMapNote(
        images.some((i) => i)
          ? sk.viewer3d.mapAttribution(src.label, src.attribution)
          : sk.viewer3d.mapFailed(src.label),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [basemap, terrains, origin]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let view: SceneView;
    try {
      view = new SceneView(host);
    } catch {
      setError(sk.viewer3d.noWebgl);
      return;
    }
    viewRef.current = view;
    view.setTheme(readTheme());
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => view.setTheme(readTheme());
    media.addEventListener('change', onScheme);
    const observer = new ResizeObserver(() => view.resize(host.clientWidth, host.clientHeight));
    observer.observe(host);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', onScheme);
      view.dispose();
      viewRef.current = undefined;
    };
  }, []);

  const onSceneUpdate = (update: Parameters<SceneView['apply']>[0]) => {
    viewRef.current?.apply(update);
    setInfo({ count: update.keys.length, elapsed: update.elapsed });
    setError(undefined);
  };
  useMeshWorker(project, onSceneUpdate, () => setError(sk.viewer3d.failed), !exactOn);
  const exportStep = useExactWorker(
    project,
    onSceneUpdate,
    (e) => {
      // pri chybe (napr. starý prehliadač bez WASM SIMD) sa vráti sieť
      onExactFailed();
      setError(sk.viewer3d.exactFailed(e instanceof Error ? e.message : String(e)));
    },
    exactOn,
  );

  async function downloadStep(sjtsk: boolean) {
    try {
      const step = await exportStep(sjtsk && origin ? origin : undefined);
      const file = drawingFileName(project.name, sk.viewer3d.stepFileName, 'step');
      downloadText(step, file, 'model/step');
      setStepNote(sk.viewer3d.stepDone(file));
    } catch {
      setStepNote(sk.viewer3d.stepFailed);
    }
  }

  // zapnutie / vypnutie presného modelu: kým sa počíta, nie je čo zobraziť ani exportovať
  // biome-ignore lint/correctness/useExhaustiveDependencies: info sa zahodí len pri prepnutí
  useEffect(() => {
    setInfo(undefined);
    setStepNote(undefined);
  }, [exactOn]);
  useEffect(() => {
    onExactReady(exactOn && info !== undefined);
  }, [exactOn, info, onExactReady]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: prispôsobí sa len pri novej žiadosti z ribbonu
  useEffect(() => {
    if (fitNonce > 0) viewRef.current?.fit();
  }, [fitNonce]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: export len pri novej žiadosti z menu
  useEffect(() => {
    if (stepRequest && exactOn && info) void downloadStep(stepRequest.sjtsk);
  }, [stepRequest?.nonce]);

  useEffect(() => {
    viewRef.current?.setAxis(axisPoints(alignment));
  }, [alignment]);

  useEffect(() => {
    viewRef.current?.setSelected(selected);
  }, [selected]);

  useEffect(() => {
    viewRef.current?.setCut(cutOn ? cut : undefined);
  }, [cutOn, cut]);

  useEffect(() => {
    viewRef.current?.setTerrain(terrainOn ? terrainMeshes : [], terrainOn ? maps : []);
  }, [terrainOn, terrainMeshes, maps]);

  // meračka (ADR 0021): čiary bez výšok ležia na teréne
  const surveyScene = useMemo(
    () =>
      sceneSurveys(
        project.surveys,
        terrains.map((t) => t.tin),
      ),
    [project.surveys, terrains],
  );
  useEffect(() => {
    viewRef.current?.setSurvey(surveyScene.lines, surveyScene.points);
  }, [surveyScene]);

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const start = down.current;
    down.current = undefined;
    const view = viewRef.current;
    if (!start || !view || e.button !== 0) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_TOLERANCE) return;
    const rect = e.currentTarget.getBoundingClientRect();
    onSelect(view.pick(e.clientX - rect.left, e.clientY - rect.top));
  }

  return (
    <div className="section-view">
      <div
        ref={hostRef}
        className="viewer3d-canvas"
        onPointerDown={(e) => {
          down.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={onPointerUp}
      >
        {(error || project.superstructures.length === 0) && (
          <p className="viewer3d-notice">{error ?? sk.viewer3d.noDeck}</p>
        )}
      </div>
      <div className="view-bar">
        {cutOn && <StationControl station={station} range={stationRange} onStation={onStation} />}
        {exactOn && !info && <span className="hint">{sk.viewer3d.exactLoading}</span>}
        {info && (
          <span className="hint">
            {sk.viewer3d.objects(info.count)} ·{' '}
            {exactOn
              ? sk.viewer3d.exactGenerated(info.elapsed)
              : sk.viewer3d.generated(info.elapsed)}
          </span>
        )}
        {mapNote && terrainOn && <span className="hint">{mapNote}</span>}
        {stepNote && <span className="hint">{stepNote}</span>}
        {exactOn && <span className="hint">{sk.viewer3d.occtLicense}</span>}
        <span className="hint viewer3d-controls">{sk.viewer3d.hint}</span>
      </div>
    </div>
  );
}
