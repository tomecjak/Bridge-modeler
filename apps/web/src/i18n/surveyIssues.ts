import type { SurveyIssue } from '@bridge/survey';
import { formatNumber } from '../format/number.ts';

const at = (x: number, y: number) => `E ${formatNumber(x, 3)}, N ${formatNumber(y, 3)}`;
const point = (number: string | undefined, x: number, y: number) =>
  number ? `Bod ${number} (${at(x, y)})` : `Bod ${at(x, y)}`;

/** Zrozumiteľná slovenská hláška k problému pri importe meračky z DXF (ADR 0021). */
export function formatSurveyIssue(issue: SurveyIssue): string {
  switch (issue.code) {
    case 'BinaryDxf':
      return 'Súbor je binárny DXF; uložte ho v AutoCADe ako ASCII DXF.';
    case 'MalformedDxf':
      return `Súbor nie je platný DXF (riadok ${issue.line}: ${issue.detail}).`;
    case 'UnsupportedUnits':
      return `Nepodporované jednotky výkresu ($INSUNITS = ${issue.units}); podporované sú mm, cm a m.`;
    case 'UnitsAssumed':
      return 'Výkres nemá nastavené jednotky ($INSUNITS) — predpokladajú sa metre.';
    case 'NoEntities':
      return 'V modelovom priestore nie sú body, texty ani čiary.';
    case 'PointWithoutHeight':
      return `${point(issue.number, issue.x, issue.y)} nemá výšku (žiadny text výšky do 1 m).`;
    case 'HeightWithoutPoint':
      return `Výška ${formatNumber(issue.value, 2)} pri ${at(issue.x, issue.y)} nepatrí žiadnemu bodu.`;
    case 'AmbiguousHeight':
      return `${point(issue.number, issue.x, issue.y)}: výška ${formatNumber(issue.value, 2)} je nejednoznačná (text ${formatNumber(issue.distance, 2)} m od bodu je bližšie k inému bodu) — skontrolujte ju.`;
    case 'NonNumericHeight':
      return `Text „${issue.text}“ na hladine výšok pri ${at(issue.x, issue.y)} nie je číslo.`;
  }
}
