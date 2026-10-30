import type { AlignmentData } from '@bridge/alignment';
import type { Vec3 } from '@bridge/geom';
import type { Parameter, ProjectFile } from '@bridge/model';

/** Príkazy menia projekt; každý je jedna položka v histórii späť/znova (ADR 0005). */
export type Command =
  | { type: 'setProjectName'; name: string }
  | { type: 'importAlignments'; alignments: AlignmentData[]; origin: Vec3 }
  | { type: 'addParameter'; parameter: Parameter }
  | { type: 'updateParameter'; id: string; changes: Partial<Omit<Parameter, 'id'>> }
  | { type: 'removeParameter'; id: string };

/** Aplikuje príkaz na draft projektu (immer). Čistá funkcia nad draftom. */
export function applyCommand(draft: ProjectFile, command: Command): void {
  switch (command.type) {
    case 'setProjectName':
      draft.name = command.name;
      return;
    case 'importAlignments': {
      // prvý import určí lokálny počiatok; ďalšie osi sú v tom istom S-JTSK, počiatok sa nemení
      draft.crs.origin ??= command.origin;
      for (const a of command.alignments) {
        const i = draft.alignments.findIndex((x) => x.name === a.name);
        if (i >= 0) draft.alignments[i] = a;
        else draft.alignments.push(a);
      }
      return;
    }
    case 'addParameter':
      draft.parameters.push(command.parameter);
      return;
    case 'updateParameter': {
      const p = draft.parameters.find((x) => x.id === command.id);
      if (p) Object.assign(p, command.changes);
      return;
    }
    case 'removeParameter': {
      const i = draft.parameters.findIndex((x) => x.id === command.id);
      if (i >= 0) draft.parameters.splice(i, 1);
      return;
    }
  }
}
