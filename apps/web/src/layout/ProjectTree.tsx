import type { AlignmentIssue } from '@bridge/alignment';
import { formatIssue } from '../i18n/issues.ts';
import { sk } from '../i18n/sk.ts';
import type { EvaluatedAlignment } from '../store/derived.ts';

interface Props {
  projectName: string;
  alignments: readonly EvaluatedAlignment[];
  /** počet problémov osi podľa názvu (parser + výpočet) */
  issueCount: (name: string) => number;
  fileIssues: readonly AlignmentIssue[];
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
}: Props) {
  return (
    <aside className="panel panel-left" aria-labelledby="project-tree-title">
      <h2 id="project-tree-title" className="panel-title">
        {sk.projectTree.title}
      </h2>
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
    </aside>
  );
}
