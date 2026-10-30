import {
  type AlignmentData,
  type AlignmentIssue,
  parseLandXml,
  suggestOrigin,
} from '@bridge/alignment';
import type { Vec3 } from '@bridge/geom';

export interface ImportResult {
  fileName: string;
  alignments: AlignmentData[];
  /** navrhovaný lokálny počiatok (použije sa, ak ho projekt ešte nemá) */
  origin: Vec3 | undefined;
  /** všetky problémy parsera (súboru aj jednotlivých osí) */
  issues: AlignmentIssue[];
}

/** Načíta LandXML; nič nevyhadzuje, chyby vracia v `issues`. */
export function importLandXml(fileName: string, xml: string): ImportResult {
  const parsed = parseLandXml(xml);
  const first = parsed.alignments[0];
  return {
    fileName,
    alignments: parsed.alignments,
    origin: first ? suggestOrigin(first) : undefined,
    issues: parsed.issues,
  };
}

/** Problémy, ktoré sa netýkajú žiadnej načítanej osi (súbor alebo odmietnuté osi). */
export function fileLevelIssues(result: ImportResult): AlignmentIssue[] {
  const loaded = new Set(result.alignments.map((a) => a.name));
  return result.issues.filter((i) => i.alignment === undefined || !loaded.has(i.alignment));
}
