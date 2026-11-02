import { formatStation, parseStation } from '@bridge/alignment';
import type { Parameter, ParameterUnit, StationFunction } from '@bridge/model';
import { useEffect, useMemo, useState } from 'react';
import { formatParameterValue } from '../format/parameterValue.ts';
import { formatModelIssue } from '../i18n/modelIssues.ts';
import { sk } from '../i18n/sk.ts';
import {
  issuesOf,
  newParameterId,
  nextParameterName,
  type ParameterState,
  parameterLawCommand,
} from '../store/parameters.ts';
import { projectStore } from '../store/projectStore.ts';
import { ExpressionInput } from './ExpressionInput.tsx';

interface Props {
  parameters: readonly Parameter[];
  state: ParameterState;
  /** zobrazované staničenie, na ktorom sa ukazujú hodnoty */
  referenceStation: number;
  onReferenceStation: (station: number) => void;
  /** rozsah zobrazovaného staničenia osi (pre nový úsek po častiach) */
  range: { from: number; to: number } | undefined;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  /** prepisy aktívneho variantu (id parametra → priebeh, ADR 0024) */
  overrides: Readonly<Record<string, StationFunction>>;
  /** meno aktívneho variantu, ak má projekt viac variantov (inak bez stĺpca prepisu) */
  variant: string | undefined;
}

const UNITS: ParameterUnit[] = ['length', 'angle', 'slope', 'none'];
const KINDS: StationFunction['kind'][] = ['constant', 'piecewise', 'expression'];

const update = (id: string, changes: Partial<Omit<Parameter, 'id'>>) =>
  projectStore.getState().dispatch({ type: 'updateParameter', id, changes });

/** Priebeh do prepisu aktívneho variantu, ak ho má, inak do spoločnej hodnoty (ADR 0024). */
const setLaw = (id: string, law: StationFunction) => {
  const { project, dispatch } = projectStore.getState();
  dispatch(parameterLawCommand(project, id, law));
};

/** Prevod druhu staničnej funkcie so zachovaním zadaného výrazu. */
export function convertLaw(
  law: StationFunction,
  kind: StationFunction['kind'],
  range: { from: number; to: number },
): StationFunction {
  const text =
    law.kind === 'constant'
      ? law.value
      : law.kind === 'expression'
        ? law.expr
        : (law.segments[0]?.v0 ?? '0');
  if (kind === 'constant') return { kind, value: text };
  if (kind === 'expression') return { kind, expr: text };
  return {
    kind,
    segments: [{ from: range.from, to: range.to, v0: text, v1: text, shape: 'linear' }],
  };
}

export function ParameterTable({
  parameters,
  state,
  referenceStation,
  onReferenceStation,
  range,
  selectedId,
  onSelect,
  overrides,
  variant,
}: Props) {
  const evaluation = useMemo(
    () => state.set.evaluateAt(referenceStation),
    [state, referenceStation],
  );
  const [stationDraft, setStationDraft] = useState(formatStation(referenceStation));
  useEffect(() => setStationDraft(formatStation(referenceStation)), [referenceStation]);

  function addParameter() {
    const id = newParameterId();
    projectStore.getState().dispatch({
      type: 'addParameter',
      parameter: {
        id,
        name: nextParameterName(parameters),
        unit: 'length',
        law: { kind: 'constant', value: '0' },
      },
    });
    onSelect(id);
  }

  return (
    <div className="parameters">
      <div className="parameters-toolbar">
        <button type="button" className="button" onClick={addParameter}>
          {sk.parameters.add}
        </button>
        <label className="station-input">
          {sk.parameters.referenceStation}
          <input
            type="text"
            value={stationDraft}
            onChange={(e) => setStationDraft(e.target.value)}
            onBlur={() => {
              const v = parseStation(stationDraft);
              if (v === undefined) setStationDraft(formatStation(referenceStation));
              else onReferenceStation(v);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
        </label>
        <span className="hint">{sk.parameters.unitsHint}</span>
      </div>
      {parameters.length === 0 ? (
        <p className="panel-empty centered">{sk.parameters.empty}</p>
      ) : (
        <table className="parameter-table">
          <thead>
            <tr>
              <th>{sk.parameters.name}</th>
              <th>{sk.parameters.unit}</th>
              <th>{sk.parameters.kind}</th>
              <th className="wide">{sk.parameters.definition}</th>
              <th className="num">{sk.parameters.value}</th>
              {variant !== undefined && (
                <th title={sk.parameters.overrideTitle(variant)}>{sk.parameters.override}</th>
              )}
              <th>{sk.parameters.status}</th>
              <th aria-label={sk.parameters.remove} />
            </tr>
          </thead>
          <tbody>
            {parameters.map((p) => {
              const issues = [
                ...issuesOf(state.issues, p.name),
                ...evaluation.issues.filter((i) => i.parameter === p.name),
              ];
              const value = evaluation.values.get(p.name);
              const overridden = overrides[p.id] !== undefined;
              return (
                <tr
                  key={p.id}
                  aria-selected={p.id === selectedId}
                  className={overridden ? 'parameter-overridden' : undefined}
                  onFocus={() => onSelect(p.id)}
                  onClick={() => onSelect(p.id)}
                >
                  <td>
                    <NameInput
                      value={p.name}
                      onCommit={(name) =>
                        projectStore
                          .getState()
                          .dispatch({ type: 'renameParameter', id: p.id, name })
                      }
                    />
                  </td>
                  <td>
                    <select
                      value={p.unit}
                      aria-label={sk.parameters.unit}
                      onChange={(e) => update(p.id, { unit: e.target.value as ParameterUnit })}
                    >
                      {UNITS.map((u) => (
                        <option key={u} value={u}>
                          {sk.parameters.units[u]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={p.law.kind}
                      aria-label={sk.parameters.kind}
                      onChange={(e) =>
                        setLaw(
                          p.id,
                          convertLaw(
                            p.law,
                            e.target.value as StationFunction['kind'],
                            range ?? {
                              from: referenceStation,
                              to: referenceStation + 10,
                            },
                          ),
                        )
                      }
                    >
                      {KINDS.map((k) => (
                        <option key={k} value={k}>
                          {sk.parameters.kinds[k]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {p.law.kind === 'constant' && (
                      <ExpressionInput
                        value={p.law.value}
                        ariaLabel={sk.parameters.definition}
                        onCommit={(value) => setLaw(p.id, { kind: 'constant', value })}
                      />
                    )}
                    {p.law.kind === 'expression' && (
                      <ExpressionInput
                        value={p.law.expr}
                        ariaLabel={sk.parameters.definition}
                        placeholder="h0 + 0.002 * (sta - 1200)"
                        onCommit={(expr) => setLaw(p.id, { kind: 'expression', expr })}
                      />
                    )}
                    {p.law.kind === 'piecewise' && (
                      <button type="button" className="link" onClick={() => onSelect(p.id)}>
                        {sk.parameters.segments(p.law.segments.length)}
                      </button>
                    )}
                  </td>
                  <td className="num">
                    {value === undefined ? '—' : formatParameterValue(p.unit, value)}
                  </td>
                  {variant !== undefined && (
                    <td className="parameter-override">
                      <input
                        type="checkbox"
                        aria-label={`${sk.parameters.override} ${p.name}`}
                        title={sk.parameters.overrideTitle(variant)}
                        checked={overridden}
                        onChange={(e) =>
                          projectStore.getState().dispatch({
                            type: 'setParameterOverride',
                            id: p.id,
                            // zapnutie začne od spoločnej hodnoty, vypnutie prepis zruší
                            law: e.target.checked ? p.law : null,
                          })
                        }
                      />
                    </td>
                  )}
                  <td className="status" title={issues.map(formatModelIssue).join('\n')}>
                    {issues[0] ? formatModelIssue(issues[0]) : ''}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`${sk.parameters.remove} ${p.name}`}
                      onClick={() =>
                        projectStore.getState().dispatch({ type: 'removeParameter', id: p.id })
                      }
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function NameInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      type="text"
      className="name-input"
      value={draft}
      aria-label={sk.parameters.name}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setDraft(value);
      }}
    />
  );
}
