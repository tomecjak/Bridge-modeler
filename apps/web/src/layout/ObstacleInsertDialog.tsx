import type { ObstacleKind } from '@bridge/model';
import { useEffect, useState } from 'react';
import { sk } from '../i18n/sk.ts';
import { Field } from '../views/Field.tsx';
import { StationField } from '../views/StationFunctionEditor.tsx';

/** Zadanie novej prekážky (ADR 0020): druh, názov a os (krivka alebo ručne km a uhol na osi cesty). */
export interface ObstacleForm {
  kind: ObstacleKind;
  name: string;
  /** `alignment:<meno>`, `planLine:<id>`, `survey:<meračka>/<čiara>` alebo `station` */
  source: string;
  road: string;
  station: number;
  angle: string;
}

interface Props {
  alignments: readonly string[];
  planLines: readonly { id: string; name: string }[];
  /** čiary meračiek (kľúč `curveKey`, popis) — ADR 0021 */
  surveyLines: readonly { value: string; label: string }[];
  initial: { source: string; road: string; station: number };
  nameFor: (kind: ObstacleKind) => string;
  onInsert: (form: ObstacleForm) => void;
  onClose: () => void;
}

const KINDS: readonly ObstacleKind[] = [
  'road',
  'railway',
  'water',
  'fieldRoad',
  'footpath',
  'other',
];

/** Dialóg „Vložiť prekážku“: os z LandXML, čiara v pôdoryse, čiara meračky alebo ručné kríženie na km osi cesty. */
export function ObstacleInsertDialog({
  alignments,
  planLines,
  surveyLines,
  initial,
  nameFor,
  onInsert,
  onClose,
}: Props) {
  const t = sk.obstacles;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const [kind, setKind] = useState<ObstacleKind>('road');
  const [name, setName] = useState(() => nameFor('road'));
  const [named, setNamed] = useState(false);
  const [source, setSource] = useState(initial.source);
  const [road, setRoad] = useState(initial.road);
  const [station, setStation] = useState(initial.station);
  const [angle, setAngle] = useState('90');
  const valid =
    name.trim() !== '' && (source !== 'station' || (road !== '' && angle.trim() !== ''));

  return (
    <div className="modal-backdrop">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="obstacle-dialog-title"
      >
        <h2 id="obstacle-dialog-title" className="panel-title">
          {t.dialogTitle}
        </h2>
        <div className="span-layout-fields">
          <Field label={t.kind}>
            <select
              value={kind}
              aria-label={t.kind}
              onChange={(e) => {
                const k = e.target.value as ObstacleKind;
                setKind(k);
                if (!named) setName(nameFor(k));
              }}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t.kinds[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t.name}>
            <input
              type="text"
              value={name}
              aria-label={t.name}
              onChange={(e) => {
                setName(e.target.value);
                setNamed(true);
              }}
            />
          </Field>
          <Field label={t.source}>
            <select
              value={source}
              aria-label={t.source}
              onChange={(e) => setSource(e.target.value)}
            >
              {alignments.map((a) => (
                <option key={`a:${a}`} value={`alignment:${a}`}>
                  {t.curveAlignment(a)}
                </option>
              ))}
              {planLines.map((l) => (
                <option key={`l:${l.id}`} value={`planLine:${l.id}`}>
                  {t.curvePlanLine(l.name)}
                </option>
              ))}
              {surveyLines.map((l) => (
                <option key={l.value} value={l.value}>
                  {t.curveSurvey(l.label)}
                </option>
              ))}
              <option value="station">{t.manual}</option>
            </select>
          </Field>
          {source === 'station' && (
            <>
              <Field label={t.road}>
                <select value={road} aria-label={t.road} onChange={(e) => setRoad(e.target.value)}>
                  {alignments.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t.station}>
                <StationField ariaLabel={t.station} value={station} onCommit={setStation} />
              </Field>
              <Field label={t.angle}>
                <input
                  type="text"
                  value={angle}
                  aria-label={t.angle}
                  onChange={(e) => setAngle(e.target.value)}
                />
              </Field>
            </>
          )}
        </div>
        <p className="hint">{t.placeholder}</p>
        <div className="toolbar modal-actions">
          <button type="button" className="button" onClick={onClose}>
            {t.cancel}
          </button>
          <button
            type="button"
            className="button primary"
            disabled={!valid}
            onClick={() =>
              onInsert({ kind, name: name.trim(), source, road, station, angle: angle.trim() })
            }
          >
            {t.insertConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}
