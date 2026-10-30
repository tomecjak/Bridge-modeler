import { formatNumber } from '../format/number.ts';
import { formatModelIssue } from '../i18n/modelIssues.ts';
import { sk } from '../i18n/sk.ts';
import type { SectionResult } from '../store/sections.ts';

interface Props {
  results: readonly SectionResult[];
  selectedId: string | undefined;
}

/** Výsledky prierezov na staničení: šírka, výška v osi, plocha, ťažisko, problémy. */
export function SectionPanel({ results, selectedId }: Props) {
  const shown = selectedId ? results.filter((r) => r.superstructure.id === selectedId) : results;
  return (
    <aside className="panel panel-right" aria-labelledby="section-panel-title">
      <h2 id="section-panel-title" className="panel-title">
        {sk.section.results}
      </h2>
      {shown.length === 0 && <p className="panel-empty">{sk.properties.nothingSelected}</p>}
      {shown.map((r) => (
        <section key={r.superstructure.id} className="result">
          <h3 className="panel-subtitle">{r.superstructure.name}</h3>
          <SectionResultDetails result={r} />
        </section>
      ))}
    </aside>
  );
}

/** Šírka, výška v osi, plocha, ťažisko a problémy jedného prierezu. */
export function SectionResultDetails({ result: r }: { result: SectionResult }) {
  return (
    <>
      {r.drawn && r.section && (
        <dl className="props">
          <dt>{sk.section.width}</dt>
          <dd>{formatNumber(r.drawn.width * 1000, 0)} mm</dd>
          <dt>{sk.section.height}</dt>
          <dd>
            {r.drawn.heightAtAxis === undefined
              ? '—'
              : `${formatNumber(r.drawn.heightAtAxis * 1000, 0)} mm`}
          </dd>
          <dt>{sk.section.area}</dt>
          <dd>{formatNumber(r.section.area, 4)} m²</dd>
          <dt>{sk.section.centroid}</dt>
          <dd>
            x = {formatNumber(r.section.centroid.x * 1000, 0)} mm, y ={' '}
            {formatNumber(r.section.centroid.y * 1000, 0)} mm
          </dd>
        </dl>
      )}
      {r.issues.length > 0 && (
        <ul className="issues">
          {r.issues.map((i) => (
            <li
              key={formatModelIssue(i)}
              className={i.severity === 'warning' ? 'issue issue-warning' : 'issue issue-error'}
            >
              {formatModelIssue(i)}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
