import {
  type Alignment,
  type AlignmentData,
  type AlignmentIssue,
  createAlignment,
  parseLandXml,
  suggestOrigin,
} from '@bridge/alignment';
import type { Vec3 } from '@bridge/geom';

export interface ImportedAlignment {
  data: AlignmentData;
  alignment: Alignment;
  /** problémy parsera aj výpočtu, ktoré sa týkajú tejto osi */
  issues: AlignmentIssue[];
}

export interface ImportResult {
  fileName: string;
  /** spoločný lokálny počiatok všetkých osí zo súboru (ADR 0003) */
  origin: Vec3 | undefined;
  alignments: ImportedAlignment[];
  /** problémy celého súboru alebo osí, ktoré sa nepodarilo načítať */
  issues: AlignmentIssue[];
}

/** Načíta LandXML a pripraví vyhodnocovače osí; nič nevyhadzuje, chyby vracia v `issues`. */
export function importLandXml(fileName: string, xml: string): ImportResult {
  const parsed = parseLandXml(xml);
  const first = parsed.alignments[0];
  const origin = first ? suggestOrigin(first) : undefined;
  const loaded = new Set(parsed.alignments.map((a) => a.name));
  const alignments = origin
    ? parsed.alignments.map((data) => {
        const built = createAlignment(data, origin);
        const parserIssues = parsed.issues.filter((i) => i.alignment === data.name);
        return { data, alignment: built.alignment, issues: [...parserIssues, ...built.issues] };
      })
    : [];
  const issues = parsed.issues.filter((i) => i.alignment === undefined || !loaded.has(i.alignment));
  return { fileName, origin, alignments, issues };
}
