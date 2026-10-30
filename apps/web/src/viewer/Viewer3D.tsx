import type { Alignment } from '@bridge/alignment';
import type { ProjectFile } from '@bridge/model';
import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { sk } from '../i18n/sk.ts';
import { StationControl } from '../views/StationControl.tsx';
import { sampleHorizontal } from '../views/sampling.ts';
import { type Cut, type Picked, SceneView } from './sceneView.ts';
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
}: Viewer3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<SceneView | undefined>(undefined);
  const down = useRef<{ x: number; y: number } | undefined>(undefined);
  const [info, setInfo] = useState<{ count: number; elapsed: number }>();
  const [error, setError] = useState<string>();
  const [cutOn, setCutOn] = useState(false);

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
