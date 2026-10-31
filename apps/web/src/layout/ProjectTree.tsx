import type { AlignmentIssue } from '@bridge/alignment';
import { formatIssue } from '../i18n/issues.ts';
import { sk } from '../i18n/sk.ts';
import type { ElementCollection } from '../store/commands.ts';
import type { EvaluatedAlignment } from '../store/derived.ts';

interface Props {
  projectName: string;
  alignments: readonly EvaluatedAlignment[];
  /** počet problémov osi podľa názvu (parser + výpočet) */
  issueCount: (name: string) => number;
  parameters: readonly { id: string; name: string; issues: number }[];
  selectedParameterId: string | undefined;
  onSelectParameter: (id: string) => void;
  fileIssues: readonly AlignmentIssue[];
  elements: readonly {
    collection: ElementCollection;
    title: string;
    items: readonly { id: string; name: string; issues: number }[];
  }[];
  selectedElement: { collection: ElementCollection; id: string } | undefined;
  onSelectElement: (collection: ElementCollection, id: string) => void;
  /** chyby pri otvorení projektového súboru (už sformulované) */
  notices: readonly string[];
  selected: number;
  onSelect: (index: number) => void;
}

export function IssueList({ issues }: { issues: readonly AlignmentIssue[] }) {
  return (
    <ul className="issues">
      {issues.map((issue, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: problémy nemajú ID, zoznam sa po importe nemení
        <li key={i} className={`issue issue-${issue.severity}`}>
          <strong>{sk.severity[issue.severity]}:</strong> {formatIssue(issue)}
        </li>
      ))}
    </ul>
  );
}

export function ProjectTree({
  projectName,
  alignments,
  issueCount,
  fileIssues,
  selected,
  onSelect,
  notices,
  parameters,
  selectedParameterId,
  onSelectParameter,
  elements,
  selectedElement,
  onSelectElement,
}: Props) {
  return (
    // strom prvkov je pod panelom Postup (Fáza 10a), dá sa zbaliť
    <details className="project-tree" open>
      <summary className="panel-title">{sk.workflow.elements}</summary>
      <p className="file-name">{projectName}</p>
      {alignments.length === 0 && <p className="panel-empty">{sk.projectTree.empty}</p>}
      {alignments.length > 0 && (
        <>
          <h3 className="panel-subtitle">{sk.projectTree.alignments}</h3>
          <ul className="tree">
            {alignments.map((a, i) => (
              <li key={a.data.name}>
                <button
                  type="button"
                  className="tree-item"
                  aria-current={i === selected}
                  onClick={() => onSelect(i)}
                >
                  {a.data.name || '—'}
                  {issueCount(a.data.name) > 0 && (
                    <span className="badge">{issueCount(a.data.name)}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {elements
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <section key={g.collection}>
            <h3 className="panel-subtitle">{g.title}</h3>
            <ul className="tree">
              {g.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="tree-item"
                    aria-current={
                      selectedElement?.collection === g.collection && selectedElement.id === item.id
                    }
                    onClick={() => onSelectElement(g.collection, item.id)}
                  >
                    {item.name || '—'}
                    {item.issues > 0 && <span className="badge badge-error">{item.issues}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      {parameters.length > 0 && (
        <>
          <h3 className="panel-subtitle">{sk.projectTree.parameters}</h3>
          <ul className="tree">
            {parameters.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="tree-item mono"
                  aria-current={p.id === selectedParameterId}
                  onClick={() => onSelectParameter(p.id)}
                >
                  {p.name || '—'}
                  {p.issues > 0 && <span className="badge badge-error">{p.issues}</span>}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {notices.length > 0 && (
        <>
          <h3 className="panel-subtitle">{sk.persistence.openFailed}</h3>
          <ul className="issues">
            {notices.map((n) => (
              <li key={n} className="issue issue-error">
                {n}
              </li>
            ))}
          </ul>
        </>
      )}
      {fileIssues.length > 0 && (
        <>
          <h3 className="panel-subtitle">{sk.projectTree.fileIssues}</h3>
          <IssueList issues={fileIssues} />
        </>
      )}
    </details>
  );
}
