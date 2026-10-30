import type { ModelIssue, Parameter, ParameterSet } from '@bridge/model';
import { formatModelIssue } from '../i18n/modelIssues.ts';
import { sk } from '../i18n/sk.ts';
import { projectStore } from '../store/projectStore.ts';
import { chartRange } from '../views/chartSamples.ts';
import { StationFunctionChart } from '../views/StationFunctionChart.tsx';
import { StationFunctionEditor } from '../views/StationFunctionEditor.tsx';

interface Props {
  parameter: Parameter | undefined;
  issues: readonly ModelIssue[];
  set: ParameterSet;
  alignmentRange: { from: number; to: number } | undefined;
  referenceStation: number;
}

/** Panel vlastností vybraného parametra: editor staničnej funkcie, graf priebehu a problémy. */
export function ParameterPanel({
  parameter,
  issues,
  set,
  alignmentRange,
  referenceStation,
}: Props) {
  const range = parameter ? chartRange(parameter, alignmentRange, referenceStation) : undefined;
  return (
    <aside className="panel panel-right panel-wide" aria-labelledby="parameter-panel-title">
      <h2 id="parameter-panel-title" className="panel-title">
        {parameter ? `${sk.properties.title}: ${parameter.name}` : sk.properties.title}
      </h2>
      {!parameter && <p className="panel-empty">{sk.properties.nothingSelected}</p>}
      {parameter && range && (
        <>
          <StationFunctionEditor
            law={parameter.law}
            range={alignmentRange ?? range}
            onChange={(law) =>
              projectStore
                .getState()
                .dispatch({ type: 'updateParameter', id: parameter.id, changes: { law } })
            }
          />
          <h3 className="panel-subtitle">{sk.stationFunction.title}</h3>
          <StationFunctionChart parameter={parameter} set={set} range={range} />
          <h3 className="panel-subtitle">{sk.properties.issues}</h3>
          {issues.length === 0 ? (
            <p className="panel-empty">{sk.properties.noIssues}</p>
          ) : (
            <ul className="issues">
              {issues.map((i) => (
                <li key={formatModelIssue(i)} className="issue issue-error">
                  {formatModelIssue(i)}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </aside>
  );
}
