import {
  type Alignment,
  type AlignmentData,
  type AlignmentIssue,
  createAlignment,
} from '@bridge/alignment';
import { useMemo } from 'react';
import { useProject } from './projectStore.ts';

export interface EvaluatedAlignment {
  data: AlignmentData;
  alignment: Alignment;
  /** problémy výpočtu osi (nesúlad geometrie, niveleta) */
  issues: AlignmentIssue[];
}

/** Vyhodnocovače osí projektu; prepočítajú sa len pri zmene osí alebo počiatku (immer zachová identitu). */
export function useEvaluatedAlignments(): EvaluatedAlignment[] {
  const alignments = useProject((s) => s.project.alignments);
  const origin = useProject((s) => s.project.crs.origin);
  return useMemo(() => {
    if (!origin) return [];
    return alignments.map((data) => {
      const built = createAlignment(data, origin);
      return { data, alignment: built.alignment, issues: built.issues };
    });
  }, [alignments, origin]);
}

/** Vyhodnocovače osí podľa názvu (pre os mosta, ktorá odkazuje na os cesty menom). */
export function alignmentsByName(evaluated: readonly EvaluatedAlignment[]): Map<string, Alignment> {
  return new Map(evaluated.map((e) => [e.data.name, e.alignment]));
}
