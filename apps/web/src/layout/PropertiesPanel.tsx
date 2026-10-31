import type { AlignmentIssue } from '@bridge/alignment';
import { formatStation } from '@bridge/alignment';
import type { Vec3 } from '@bridge/geom';
import { formatNumber } from '../format/number.ts';
import { sk } from '../i18n/sk.ts';
import type { EvaluatedAlignment } from '../store/derived.ts';
import { IssueList } from './IssueList.tsx';

interface Props {
  item: EvaluatedAlignment | undefined;
  /** problémy parsera k tejto osi z posledného importu */
  importIssues: readonly AlignmentIssue[];
  origin: Vec3 | null;
}

export function PropertiesPanel({ item, importIssues, origin }: Props) {
  return (
    <aside className="panel panel-right" aria-labelledby="properties-title">
      <h2 id="properties-title" className="panel-title">
        {sk.properties.title}
      </h2>
      {!item && <p className="panel-empty">{sk.properties.nothingSelected}</p>}
      {item && (
        <AlignmentProperties
          item={item}
          issues={[...importIssues, ...item.issues]}
          origin={origin}
        />
      )}
    </aside>
  );
}

function AlignmentProperties({
  item,
  issues,
  origin,
}: {
  item: EvaluatedAlignment;
  issues: readonly AlignmentIssue[];
  origin: Vec3 | null;
}) {
  const { alignment } = item;
  const st = alignment.stationing;
  const count = (kind: string) => alignment.elements.filter((e) => e.kind === kind).length;
  const profile = alignment.profile;
  return (
    <>
      <dl className="props">
        <dt>{sk.properties.name}</dt>
        <dd>{alignment.name}</dd>
        <dt>{sk.properties.length}</dt>
        <dd>{formatNumber(alignment.length, 3)} m</dd>
        <dt>{sk.properties.stationRange}</dt>
        <dd>
          {formatStation(st.toDisplay(0).station)} –{' '}
          {formatStation(st.toDisplay(alignment.length).station)}
        </dd>
        <dt>{sk.properties.elements}</dt>
        <dd>
          {count('line')} {sk.properties.lines}, {count('arc')} {sk.properties.arcs},{' '}
          {count('spiral')} {sk.properties.spirals}
        </dd>
        <dt>{sk.properties.profile}</dt>
        <dd>
          {profile
            ? `${profile.name}: ${formatStation(st.toDisplay(profile.startS).station)} – ${formatStation(st.toDisplay(profile.endS).station)}`
            : sk.properties.noProfile}
        </dd>
        {origin && (
          <>
            <dt>{sk.properties.origin}</dt>
            <dd>
              E {formatNumber(origin.x, 0)}, N {formatNumber(origin.y, 0)}
            </dd>
          </>
        )}
      </dl>
      <h3 className="panel-subtitle">{sk.properties.issues}</h3>
      {issues.length === 0 ? (
        <p className="panel-empty">{sk.properties.noIssues}</p>
      ) : (
        <IssueList issues={issues} />
      )}
    </>
  );
}
