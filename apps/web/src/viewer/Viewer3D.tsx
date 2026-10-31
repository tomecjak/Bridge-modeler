import type { Alignment } from '@bridge/alignment';
import type { ProjectFile } from '@bridge/model';
import { type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { sk } from '../i18n/sk.ts';
import type { TerrainTin } from '../store/terrain.ts';
import { StationControl } from '../views/StationControl.tsx';
import { sampleHorizontal } from '../views/sampling.ts';
import { BASEMAPS, type BasemapKind, loadBasemap } from './basemap.ts';
import { type Cut, type Picked, SceneView } from './sceneView.ts';
import { terrainBuffers } from './terrainMesh.ts';
import { useMeshWorker } from './useMeshWorker.ts';

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
  /** priebeh sťahovania DMR 5.0 [%] */
  terrainProgress: number | undefined;
  /** projekt nemá terén → stiahnuť DMR 5.0 zo ZBGIS */
  onRequestTerrain: () => void;
  onCancelTerrain: () => void;
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
  terrainProgress,
  onRequestTerrain,
  onCancelTerrain,
}: Viewer3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<SceneView | undefined>(undefined);
  const down = useRef<{ x: number; y: number } | undefined>(undefined);
  const [info, setInfo] = useState<{ count: number; elapsed: number }>();
  const [error, setError] = useState<string>();
  const [cutOn, setCutOn] = useState(false);
  const [terrainOn, setTerrainOn] = useState(true);
  const terrainMeshes = useMemo(() => terrains.map((t) => terrainBuffers(t.tin)), [terrains]);
  const [basemap, setBasemap] = useState<BasemapKind>('none');
  const [maps, setMaps] = useState<(HTMLImageElement | undefined)[]>([]);
  const [mapNote, setMapNote] = useState<string>();
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

  useMeshWorker(
    project,
    (update) => {
      viewRef.current?.apply(update);
      setInfo({ count: update.keys.length, elapsed: update.elapsed });
      setError(undefined);
    },
    () => setError(sk.viewer3d.failed),
  );

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
      <div className="section-toolbar">
        <button
          type="button"
          className="button"
          title={sk.viewer3d.fitTitle}
          onClick={() => viewRef.current?.fit()}
        >
          {sk.viewer3d.fit}
        </button>
        <button
          type="button"
          className="button"
          aria-pressed={cutOn}
          title={sk.viewer3d.cutTitle}
          onClick={() => setCutOn((v) => !v)}
        >
          {sk.viewer3d.cut}
        </button>
        <button
          type="button"
          className="button"
          aria-pressed={terrainOn && terrains.length > 0}
          title={terrains.length === 0 ? sk.viewer3d.terrainDownloadTitle : undefined}
          disabled={terrainProgress !== undefined}
          onClick={() => {
            // bez terénu zapnutie stiahne DMR 5.0 zo ZBGIS
            if (terrains.length === 0) {
              setTerrainOn(true);
              onRequestTerrain();
            } else setTerrainOn((v) => !v);
          }}
        >
          {sk.viewer3d.terrain}
        </button>
        {terrains.length > 0 && terrainOn && (
          <label className="station-input">
            {sk.viewer3d.basemap}
            <select
              value={basemap}
              aria-label={sk.viewer3d.basemap}
              onChange={(e) => setBasemap(e.target.value as BasemapKind)}
            >
              <option value="none">{sk.viewer3d.basemaps.none}</option>
              <option value="ortofoto">{sk.viewer3d.basemaps.ortofoto}</option>
              <option value="mapa">{sk.viewer3d.basemaps.mapa}</option>
            </select>
          </label>
        )}
        {mapNote && terrainOn && <span className="hint">{mapNote}</span>}
        {terrainProgress !== undefined && (
          <>
            <span className="hint">{sk.terrain.downloading(terrainProgress)}</span>
            <button type="button" className="button" onClick={onCancelTerrain}>
              {sk.terrain.cancelDownload}
            </button>
          </>
        )}
        {cutOn && <StationControl station={station} range={stationRange} onStation={onStation} />}
        {info && (
          <span className="hint">
            {sk.viewer3d.objects(info.count)} · {sk.viewer3d.generated(info.elapsed)}
          </span>
        )}
        <span className="hint viewer3d-controls">{sk.viewer3d.hint}</span>
      </div>
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
    </div>
  );
}
