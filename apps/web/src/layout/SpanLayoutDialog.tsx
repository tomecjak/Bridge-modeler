import { formatStation } from '@bridge/alignment';
import { parseSpanLayout, type SpanLayoutError } from '@bridge/sections';
import { useState } from 'react';
import { formatNumber, parseNumber } from '../format/number.ts';
import { sk } from '../i18n/sk.ts';
import { Icon } from '../icons/Icon.tsx';
import { Field } from '../views/Field.tsx';
import { StationField } from '../views/StationFunctionEditor.tsx';
import { DialogFrame } from './DialogFrame.tsx';

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
  /** kríženia prekážok s osou mosta NK (ADR 0020): ukotvenie symetricky okolo km kríženia s jeho uhlom */
  crossings?: (
    deckId: string,
  ) => readonly { id: string; label: string; station: number; angle: number }[];
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
  crossings,
  onApply,
  onClose,
}: Props) {
  const t = sk.spanLayout;
  const [deckId, setDeckId] = useState(initialDeck);
  const [initial, setInitial] = useState(() => defaults(initialDeck));
  const [text, setText] = useState(initial.text);
  const [anchor, setAnchor] = useState<SpanAnchor>('start');
  const [station, setStation] = useState(initial.stations.start);
  const [angle, setAngle] = useState(initial.angle);
  const [overhang, setOverhang] = useState(formatNumber(initial.overhang, 2));
  const [pier, setPier] = useState(templates.pier[0]?.value ?? '');
  const [abutment, setAbutment] = useState(templates.abutment[0]?.value ?? '');
  const [crossing, setCrossing] = useState('');
  const deckCrossings = crossings?.(deckId) ?? [];

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
    setCrossing('');
    setAngle(d.angle);
    setOverhang(formatNumber(d.overhang, 2));
  }

  const total = parsed.ok ? parsed.spans.reduce((a, b) => a + b, 0) : 0;

  return (
    <DialogFrame
      title={t.title}
      subtitle={t.subtitle}
      icon="spans"
      onClose={onClose}
      actions={
        <>
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
        </>
      }
    >
      <div className="dialog-grid dialog-grid-2">
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
          <span className="input-with-note" data-invalid={!parsed.ok || undefined}>
            <input
              type="text"
              value={text}
              aria-label={t.spans}
              aria-invalid={!parsed.ok}
              aria-describedby={parsed.ok ? 'span-layout-summary' : 'span-layout-error'}
              placeholder="16 + 23 + 16"
              onChange={(e) => setText(e.target.value)}
            />
            {parsed.ok && (
              <span id="span-layout-summary" className="note-ok">
                {t.summary(parsed.spans.length, formatNumber(total, 2))}
              </span>
            )}
          </span>
          {!parsed.ok && (
            <span id="span-layout-error" className="note-error">
              {errorText(parsed.error)}
            </span>
          )}
        </Field>
      </div>
      <Field label={t.anchor}>
        <span className="segmented segmented-fill">
          {(['start', 'end', 'center'] as const).map((a) => (
            <label key={a} data-checked={anchor === a || undefined}>
              <input
                type="radio"
                className="visually-hidden"
                name="span-anchor"
                checked={anchor === a}
                onChange={() => {
                  setAnchor(a);
                  setStation(initial.stations[a]);
                  setCrossing('');
                }}
              />
              {t.anchors[a]}
            </label>
          ))}
        </span>
      </Field>
      <div className="dialog-grid dialog-grid-3">
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
      </div>
      {deckCrossings.length > 0 && (
        <Field label={t.crossing}>
          <select
            value={crossing}
            aria-label={t.crossing}
            onChange={(e) => {
              const c = deckCrossings.find((x) => x.id === e.target.value);
              setCrossing(e.target.value);
              if (!c) return;
              // kríženie s prekážkou: polia symetricky okolo km kríženia, uhol kríženia prekážky
              setAnchor('center');
              setStation(Math.round(c.station * 1e4) / 1e4);
              setAngle(String(Math.round(c.angle * 100) / 100));
            }}
          >
            <option value="">{t.noCrossing}</option>
            {deckCrossings.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="dialog-grid dialog-grid-2">
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
      {parsed.ok && stations && <SpanPreview spans={parsed.spans} />}

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
            {stations.map((s, i) => {
              const end = i === 0 || i === stations.length - 1;
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: osi sú číslované poradím
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{formatStation(s, 3)}</td>
                  <td>
                    <span className="support-kind">
                      <Icon name={end ? 'abutment' : 'pier'} size={16} />
                      {end ? t.abutmentKind : t.pierKind}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="hint">{t.hint}</p>
    </DialogFrame>
  );
}

/** Náhľad polí v pohľade: NK, osi uloženia, opory na koncoch, piliere a dĺžky polí v mierke. */
export function SpanPreview({ spans }: { spans: readonly number[] }) {
  const total = spans.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  const left = 30;
  const width = 580;
  const xs = [left];
  for (const span of spans) xs.push((xs.at(-1) ?? left) + (span / total) * width);
  return (
    <svg
      className="span-preview"
      viewBox="0 0 640 110"
      role="img"
      aria-label={sk.spanLayout.summary(spans.length, formatNumber(total, 2))}
    >
      <rect className="span-preview-deck" x={left - 8} y={34} width={width + 16} height={8} />
      {xs.map((x, i) => {
        const end = i === 0 || i === xs.length - 1;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: osi sú číslované poradím
          <g key={i}>
            <line className="span-preview-axis" x1={x} x2={x} y1={18} y2={96} />
            {end ? (
              <rect className="span-preview-support" x={x - 9} y={42} width={18} height={26} />
            ) : (
              <rect className="span-preview-pier" x={x - 4} y={42} width={8} height={36} />
            )}
            <text className="span-preview-label" x={x} y={13} textAnchor="middle">
              {i + 1}
            </text>
          </g>
        );
      })}
      {spans.map((span, i) => (
        <text
          // biome-ignore lint/suspicious/noArrayIndexKey: polia sú číslované poradím
          key={i}
          className="span-preview-length"
          x={((xs[i] ?? 0) + (xs[i + 1] ?? 0)) / 2}
          y={104}
          textAnchor="middle"
        >
          {formatNumber(span, 2)}
        </text>
      ))}
    </svg>
  );
}
