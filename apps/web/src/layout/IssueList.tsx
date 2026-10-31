import type { AlignmentIssue } from '@bridge/alignment';
import { formatIssue } from '../i18n/issues.ts';
import { sk } from '../i18n/sk.ts';

/** Zoznam problémov LandXML / osi so závažnosťou. */
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
