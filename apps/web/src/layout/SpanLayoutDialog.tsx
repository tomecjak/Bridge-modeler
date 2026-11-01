import { formatStation } from '@bridge/alignment';
import { parseSpanLayout, type SpanLayoutError } from '@bridge/sections';
import { useEffect, useState } from 'react';
import { formatNumber, parseNumber } from '../format/number.ts';
import { sk } from '../i18n/sk.ts';
import { Field } from '../views/Field.tsx';
import { StationField } from '../views/StationFunctionEditor.tsx';

/** Ukotvenie rozloženia: prvá os, posledná os alebo stred súčtu polí na km. */
export type SpanAnchor = 'start' | 'end' | 'center';

/** Zadanie rozloženia polí NK (ADR 0017). */
export interface SpanLayoutForm {
  deckId: string;
  /** dĺžky polí po osi mosta [m] */
  spans: number[];
  anchor: SpanAnchor;
  /** km ukotvenia (zobrazované staničenie) */
  station: number;
  /** uhol kríženia všetkých osí (výraz v °) */
  angle: string;
  /** presah konca NK za krajnú os po osi mosta [m] */
  overhang: number;
  /** typ nových pilierov a opôr: id podpery projektu alebo predvolený typ */
  pier: string;
  abutment: string;
}

/** Predvolené hodnoty pre NK: doterajšie polia, km ukotvení, uhol a presah konca NK. */
export interface SpanLayoutDefaults {
  text: string;
  stations: Record<SpanAnchor, number>;
  angle: string;
  overhang: number;
}

interface Props {
  decks: readonly { id: string; name: string }[];
  deckId: string;
  defaults: (deckId: string) => SpanLayoutDefaults;
  /** zobrazované staničenia osí pre zadanie (náhľad); undefined, ak sa nedá vypočítať */
  preview: (form: SpanLayoutForm) => number[] | undefined;
  /** typy podpier na výber (hodnota, popis) */
  templates: {
    pier: readonly { value: string; label: string }[];
    abutment: readonly { value: string; label: string }[];
  };
  onApply: (form: SpanLayoutForm) => void;
  onClose: () => void;
}

function errorText(e: SpanLayoutError): string {
  const t = sk.spanLayout.errors;
  switch (e.code) {
    case 'Empty':
      return t.empty;
    case 'InvalidTerm':
      return t.invalidTerm(e.term);
    case 'NonPositiveSpan':
      return t.nonPositive;
  }
}

/**
 * Rozloženie polí NK jedným krokom (ADR 0017): zápis polí („16 + 23 + 16“, „3×20“), ukotvenie od začiatku, od konca
 * alebo symetricky okolo km, spoločný uhol kríženia, presah konca NK a typ pilierov a opôr. Náhľad čísluje osi
 * a ukazuje ich km; existujúce podpery sa zachovajú a presunú.
 */
export function SpanLayoutDialog({
  decks,
  deckId: initialDeck,
  defaults,
  preview,
  templates,
  onApply,
  onClose,
}: Props) {
  const t = sk.spanLayout;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const [deckId, setDeckId] = useState(initialDeck);
  const [initial, setInitial] = useState(() => defaults(initialDeck));
  const [text, setText] = useState(initial.text);
  const [anchor, setAnchor] = useState<SpanAnchor>('start');
  const [station, setStation] = useState(initial.stations.start);
  const [angle, setAngle] = useState(initial.angle);
  const [overhang, setOverhang] = useState(formatNumber(initial.overhang, 2));
  const [pier, setPier] = useState(templates.pier[0]?.value ?? '');
  const [abutment, setAbutment] = useState(templates.abutment[0]?.value ?? '');

  const parsed = parseSpanLayout(text);
  const overhangValue = parseNumber(overhang);
  const form: SpanLayoutForm | undefined =
    parsed.ok && overhangValue !== undefined && overhangValue >= 0 && angle.trim() !== ''
      ? {
          deckId,
          spans: parsed.spans,
          anchor,
          station,
          angle: angle.trim(),
          overhang: overhangValue,
          pier,
          abutment,
        }
      : undefined;
  const stations = form && preview(form);

  function selectDeck(id: string) {
    const d = defaults(id);
    setDeckId(id);
    setInitial(d);
    setText(d.text);
    setStation(d.stations[anchor]);
    setAngle(d.angle);
    setOverhang(formatNumber(d.overhang, 2));
  }

  return (
    <div className="modal-backdrop">
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="span-layout-title"
      >
        <h2 id="span-layout-title" className="panel-title">
          {t.title}
        </h2>
        <p className="hint">{t.hint}</p>
        <div className="span-layout-fields">
          <Field label={t.deck}>
            <select value={deckId} aria-label={t.deck} onChange={(e) => selectDeck(e.target.value)}>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t.spans}>
            <input
              type="text"
              value={text}
              aria-label={t.spans}
              aria-invalid={!parsed.ok}
              placeholder="16 + 23 + 16"
              onChange={(e) => setText(e.target.value)}
            />
          </Field>
          <Field label={t.anchor}>
            <select
              value={anchor}
              aria-label={t.anchor}
              onChange={(e) => {
                const value = e.target.value as SpanAnchor;
                setAnchor(value);
                setStation(initial.stations[value]);
              }}
            >
              {(['start', 'end', 'center'] as const).map((a) => (
                <option key={a} value={a}>
                  {t.anchors[a]}
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
          <Field label={t.overhang}>
            <input
              type="text"
              value={overhang}
              aria-label={t.overhang}
              aria-invalid={overhangValue === undefined || overhangValue < 0}
              onChange={(e) => setOverhang(e.target.value)}
            />
          </Field>
          <Field label={t.pier}>
            <select value={pier} aria-label={t.pier} onChange={(e) => setPier(e.target.value)}>
              {templates.pier.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t.abutment}>
            <select
              value={abutment}
              aria-label={t.abutment}
              onChange={(e) => setAbutment(e.target.value)}
            >
              {templates.abutment.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {parsed.ok ? (
          <p className="hint">
            {t.summary(
              parsed.spans.length,
              formatNumber(
                parsed.spans.reduce((a, b) => a + b, 0),
                2,
              ),
            )}
          </p>
        ) : (
          <p className="issue issue-error">{errorText(parsed.error)}</p>
        )}
        {stations && (
          <table className="span-layout-preview">
            <thead>
              <tr>
                <th>{t.line}</th>
                <th>{t.stationColumn}</th>
                <th>{t.supportColumn}</th>
              </tr>
            </thead>
            <tbody>
              {stations.map((s, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: osi sú číslované poradím
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{formatStation(s, 3)}</td>
                  <td>{i === 0 || i === stations.length - 1 ? t.abutmentKind : t.pierKind}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="toolbar modal-actions">
          <button type="button" className="button" onClick={onClose}>
            {t.cancel}
          </button>
          <button
            type="button"
            className="button primary"
            disabled={!form || !stations}
            onClick={() => form && onApply(form)}
          >
            {t.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
