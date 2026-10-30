import type { ModelIssue, Parameter } from '@bridge/model';
import { formatModelIssue } from '../i18n/modelIssues.ts';
import { sk } from '../i18n/sk.ts';

interface Props {
  parameter: Parameter | undefined;
  issues: readonly ModelIssue[];
}

/** Panel vlastností vybraného parametra (editor staničnej funkcie pribudne v ďalšom kroku). */
export function ParameterPanel({ parameter, issues }: Props) {
  return (
    <aside className="panel panel-right" aria-labelledby="parameter-panel-title">
      <h2 id="parameter-panel-title" className="panel-title">
        {sk.properties.title}
      </h2>
      {!parameter && <p className="panel-empty">{sk.properties.nothingSelected}</p>}
      {parameter && (
        <>
          <dl className="props">
            <dt>{sk.parameters.name}</dt>
            <dd className="mono">{parameter.name}</dd>
            <dt>{sk.parameters.unit}</dt>
            <dd>{sk.parameters.units[parameter.unit]}</dd>
            <dt>{sk.parameters.kind}</dt>
            <dd>{sk.parameters.kinds[parameter.law.kind]}</dd>
          </dl>
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
