import type { AlignmentIssue } from '@bridge/alignment';
import { formatIssue } from '../i18n/issues.ts';
import { sk } from '../i18n/sk.ts';
import type { ImportResult } from '../import/importLandXml.ts';

interface Props {
  imported: ImportResult | undefined;
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

export function ProjectTree({ imported, selected, onSelect }: Props) {
  return (
    <aside className="panel panel-left" aria-labelledby="project-tree-title">
      <h2 id="project-tree-title" className="panel-title">
        {sk.projectTree.title}
      </h2>
      {!imported && <p className="panel-empty">{sk.projectTree.empty}</p>}
      {imported && (
        <>
          <p className="file-name">{imported.fileName}</p>
          {imported.alignments.length > 0 && (
            <>
              <h3 className="panel-subtitle">{sk.projectTree.alignments}</h3>
              <ul className="tree">
                {imported.alignments.map((a, i) => (
                  <li key={a.data.name}>
                    <button
                      type="button"
                      className="tree-item"
                      aria-current={i === selected}
                      onClick={() => onSelect(i)}
                    >
                      {a.data.name || '—'}
                      {a.issues.length > 0 && <span className="badge">{a.issues.length}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {imported.issues.length > 0 && (
            <>
              <h3 className="panel-subtitle">{sk.projectTree.fileIssues}</h3>
              <IssueList issues={imported.issues} />
            </>
          )}
        </>
      )}
    </aside>
  );
}
