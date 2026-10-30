import type { AlignmentData } from '@bridge/alignment';
import type { Vec3 } from '@bridge/geom';
import {
  type BridgeAxis,
  type Parameter,
  type ProfileDefinition,
  type ProjectFile,
  renameParameter,
  type Superstructure,
} from '@bridge/model';

/** Kolekcie prvkov mosta s rovnakými príkazmi (pridať / upraviť / odstrániť). */
export interface ElementCollections {
  bridgeAxes: BridgeAxis;
  profiles: ProfileDefinition;
  superstructures: Superstructure;
}
export type ElementCollection = keyof ElementCollections;

type ElementUpdate = {
  [K in ElementCollection]: {
    type: 'updateElement';
    collection: K;
    id: string;
    changes: Partial<Omit<ElementCollections[K], 'id'>>;
  };
}[ElementCollection];

/** Príkazy menia projekt; každý je jedna položka v histórii späť/znova (ADR 0005). */
export type Command =
  | { type: 'setProjectName'; name: string }
  | { type: 'importAlignments'; alignments: AlignmentData[]; origin: Vec3 }
  | { type: 'addParameter'; parameter: Parameter }
  | { type: 'updateParameter'; id: string; changes: Partial<Omit<Parameter, 'id'>> }
  | { type: 'removeParameter'; id: string }
  /** premenovanie vrátane prepisu odkazov v ostatných výrazoch */
  | { type: 'renameParameter'; id: string; name: string }
  /** pridá prvky naraz (napr. príklad dvojice NK) — jeden krok späť/znova */
  | {
      type: 'addElements';
      bridgeAxes?: BridgeAxis[];
      profiles?: ProfileDefinition[];
      superstructures?: Superstructure[];
    }
  | ElementUpdate
  | { type: 'removeElement'; collection: ElementCollection; id: string };

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
    case 'renameParameter': {
      const renamed = renameParameter(draft.parameters, command.id, command.name);
      renamed.forEach((p, i) => {
        const current = draft.parameters[i];
        if (!current) return;
        if (current.name !== p.name) current.name = p.name;
        if (JSON.stringify(current.law) !== JSON.stringify(p.law)) current.law = p.law;
      });
      return;
    }
    case 'addElements':
      draft.bridgeAxes.push(...(command.bridgeAxes ?? []));
      draft.profiles.push(...(command.profiles ?? []));
      draft.superstructures.push(...(command.superstructures ?? []));
      return;
    case 'updateElement': {
      const list = draft[command.collection] as { id: string }[];
      const item = list.find((x) => x.id === command.id);
      if (item) Object.assign(item, command.changes);
      return;
    }
    case 'removeElement': {
      const list = draft[command.collection] as { id: string }[];
      const i = list.findIndex((x) => x.id === command.id);
      if (i >= 0) list.splice(i, 1);
      return;
    }
    case 'removeParameter': {
      const i = draft.parameters.findIndex((x) => x.id === command.id);
      if (i >= 0) draft.parameters.splice(i, 1);
      return;
    }
  }
}
