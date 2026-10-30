import { formatStation, parseStation } from '@bridge/alignment';
import type { Segment, SegmentShape, StationFunction } from '@bridge/model';
import { useEffect, useState } from 'react';
import { sk } from '../i18n/sk.ts';
import { ExpressionInput } from './ExpressionInput.tsx';
import { convertLaw } from './ParameterTable.tsx';

interface Props {
  law: StationFunction;
  onChange: (law: StationFunction) => void;
  /** rozsah zobrazovaného staničenia pre nový úsek */
  range: { from: number; to: number };
}

const SHAPES: SegmentShape[] = ['linear', 'parabolic', 'circular'];
const KINDS: StationFunction['kind'][] = ['constant', 'piecewise', 'expression'];

/** Editor staničnej funkcie (druh, výraz alebo úseky) — pre parametre, priebehy NK aj posuny osi mosta. */
export function StationFunctionEditor({ law, onChange: setLaw, range }: Props) {
  const setSegment = (index: number, changes: Partial<Segment>) => {
    if (law.kind !== 'piecewise') return;
    const segments = law.segments.map((s, i) => {
      if (i !== index) return s;
      const next = { ...s, ...changes };
      if (next.shape === 'linear') delete next.vertexAt;
      else next.vertexAt ??= 'end';
      return next;
    });
    setLaw({ kind: 'piecewise', segments });
  };

  return (
    <div className="sf-editor">
      <label className="field">
        <span>{sk.parameters.kind}</span>
        <select
          value={law.kind}
          onChange={(e) =>
            setLaw(convertLaw(law, e.target.value as StationFunction['kind'], range))
          }
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {sk.parameters.kinds[k]}
            </option>
          ))}
        </select>
      </label>
      {law.kind === 'constant' && (
        <div className="field">
          <span>{sk.parameters.definition}</span>
          <ExpressionInput
            value={law.value}
            ariaLabel={sk.parameters.definition}
            onCommit={(value) => setLaw({ kind: 'constant', value })}
          />
        </div>
      )}
      {law.kind === 'expression' && (
        <div className="field">
          <span>{sk.parameters.definition}</span>
          <ExpressionInput
            value={law.expr}
            ariaLabel={sk.parameters.definition}
            placeholder="h0 + 0.002 * (sta - 1200)"
            onCommit={(expr) => setLaw({ kind: 'expression', expr })}
          />
        </div>
      )}
      {law.kind === 'piecewise' && (
        <>
          <ol className="segments">
            {law.segments.map((s, i) => (
              // úseky nemajú ID; poradie je ich identita a mení sa len pridaním/odobratím
              // biome-ignore lint/suspicious/noArrayIndexKey: úsek je určený poradím
              <li key={i} className="segment">
                <div className="segment-head">
                  <span>{sk.stationFunction.segment(i + 1)}</span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={sk.stationFunction.removeSegment}
                    disabled={law.segments.length === 1}
                    onClick={() =>
                      setLaw({
                        kind: 'piecewise',
                        segments: law.segments.filter((_, j) => j !== i),
                      })
                    }
                  >
                    ×
                  </button>
                </div>
                <div className="segment-grid">
                  <div className="field">
                    <span>{sk.stationFunction.from}</span>
                    <StationField
                      ariaLabel={sk.stationFunction.from}
                      value={s.from}
                      onCommit={(from) => setSegment(i, { from })}
                    />
                  </div>
                  <div className="field">
                    <span>{sk.stationFunction.to}</span>
                    <StationField
                      ariaLabel={sk.stationFunction.to}
                      value={s.to}
                      onCommit={(to) => setSegment(i, { to })}
                    />
                  </div>
                  <div className="field">
                    <span>{sk.stationFunction.v0}</span>
                    <ExpressionInput
                      value={s.v0}
                      ariaLabel={sk.stationFunction.v0}
                      onCommit={(v0) => setSegment(i, { v0 })}
                    />
                  </div>
                  <div className="field">
                    <span>{sk.stationFunction.v1}</span>
                    <ExpressionInput
                      value={s.v1}
                      ariaLabel={sk.stationFunction.v1}
                      onCommit={(v1) => setSegment(i, { v1 })}
                    />
                  </div>
                  <label className="field">
                    <span>{sk.stationFunction.shape}</span>
                    <select
                      value={s.shape}
                      onChange={(e) => setSegment(i, { shape: e.target.value as SegmentShape })}
                    >
                      {SHAPES.map((shape) => (
                        <option key={shape} value={shape}>
                          {sk.stationFunction.shapes[shape]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>{sk.stationFunction.vertex}</span>
                    <select
                      value={s.vertexAt ?? ''}
                      disabled={s.shape === 'linear'}
                      onChange={(e) =>
                        setSegment(i, { vertexAt: e.target.value as 'start' | 'end' })
                      }
                    >
                      {s.shape === 'linear' && <option value="">—</option>}
                      <option value="start">{sk.stationFunction.vertexStart}</option>
                      <option value="end">{sk.stationFunction.vertexEnd}</option>
                    </select>
                  </label>
                </div>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="button"
            onClick={() => {
              const last = law.segments.at(-1);
              const from = last?.to ?? range.from;
              const v = last?.v1 ?? '0';
              setLaw({
                kind: 'piecewise',
                segments: [...law.segments, { from, to: from + 10, v0: v, v1: v, shape: 'linear' }],
              });
            }}
          >
            {sk.stationFunction.addSegment}
          </button>
        </>
      )}
    </div>
  );
}

export function StationField({
  value,
  onCommit,
  ariaLabel,
}: {
  value: number;
  onCommit: (v: number) => void;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState(formatStation(value));
  useEffect(() => setDraft(formatStation(value)), [value]);
  const invalid = parseStation(draft) === undefined;
  return (
    <input
      type="text"
      value={draft}
      aria-invalid={invalid}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const v = parseStation(draft);
        if (v === undefined) setDraft(formatStation(value));
        else if (v !== value) onCommit(v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setDraft(formatStation(value));
      }}
    />
  );
}
