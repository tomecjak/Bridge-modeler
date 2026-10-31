import type { Alignment } from '@bridge/alignment';
import type { StudyArea } from '@bridge/model';
import { formatNumber } from '../format/number.ts';
import { sk } from '../i18n/sk.ts';
import { projectStore, useProject } from '../store/projectStore.ts';
import { Field } from '../views/Field.tsx';
import { StationField } from '../views/StationFunctionEditor.tsx';

interface Props {
  /** zobrazená os cesty */
  road: Alignment | undefined;
  /** návrh rozsahu pre „Zadať staničeniami“ (zobrazované staničenie) */
  suggestion: { from: number; to: number } | undefined;
  /** zapne nástroj „Oblasť mosta“ v pozdĺžnom profile */
  onMark: () => void;
}

const set = (studyArea: StudyArea | null) =>
  projectStore.getState().dispatch({ type: 'setStudyArea', studyArea });

/** Dĺžka oblasti po osi cesty (spojité staničenie, rešpektuje skoky v staničení). */
function areaLength(road: Alignment, area: StudyArea): number {
  const a = road.stationing.fromDisplay(area.from);
  const b = road.stationing.fromDisplay(area.to);
  return a === undefined || b === undefined ? area.to - area.from : b - a;
}

/** Oblasť mosta (Fáza 10a): úsek osi cesty, ktorý riadi terén, rozsah novej NK a prispôsobenie pohľadov. */
export function StudyAreaPanel({ road, suggestion, onMark }: Props) {
  const t = sk.studyArea;
  const area = useProject((s) => s.project.studyArea);
  const onRoad = area && road && area.alignment === road.name ? area : undefined;

  /** zmena jedného konca; oblasť ostane zoradená od menšieho staničenia */
  const change = (end: 'from' | 'to', value: number) => {
    if (!onRoad) return;
    const next = { ...onRoad, [end]: value };
    set({ ...next, from: Math.min(next.from, next.to), to: Math.max(next.from, next.to) });
  };

  return (
    <aside className="panel panel-right" aria-labelledby="study-area-title">
      <h2 id="study-area-title" className="panel-title">
        {t.title}
      </h2>
      <div className="sf-editor">
        <p className="hint">{t.hint}</p>
        {!area && <p className="panel-empty">{t.none}</p>}
        {area && !onRoad && <p className="panel-empty">{t.otherAlignment(area.alignment)}</p>}
        {onRoad && road && (
          <>
            <Field label={t.alignment}>
              <span>{road.name}</span>
            </Field>
            <div className="segment-grid">
              <Field label={t.from}>
                <StationField
                  ariaLabel={t.from}
                  value={onRoad.from}
                  onCommit={(v) => change('from', v)}
                />
              </Field>
              <Field label={t.to}>
                <StationField
                  ariaLabel={t.to}
                  value={onRoad.to}
                  onCommit={(v) => change('to', v)}
                />
              </Field>
            </div>
            <Field label={t.length}>
              <span>{formatNumber(areaLength(road, onRoad), 3)} m</span>
            </Field>
          </>
        )}
        <div className="toolbar">
          <button type="button" className="button" disabled={!road} onClick={onMark}>
            {t.mark}
          </button>
          {!onRoad && road && (
            <button
              type="button"
              className="button"
              disabled={!suggestion}
              onClick={() => suggestion && set({ alignment: road.name, ...suggestion })}
            >
              {t.enter}
            </button>
          )}
          {area && (
            <button type="button" className="button" onClick={() => set(null)}>
              {t.clear}
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
