import type { AlignmentData } from '@bridge/alignment';
import type { Vec3 } from '@bridge/geom';
import {
  type BearingLine,
  type BridgeAxis,
  type Brief,
  type EdgeBeam,
  type Obstacle,
  type Parameter,
  type PlanLine,
  type ProfileDefinition,
  type ProjectFile,
  renameInStationFunction,
  renameParameter,
  type StationFunction,
  type StudyArea,
  type Superstructure,
  type Support,
  type Survey,
  type TerrainSurface,
  type VariantElements,
  variantElements,
} from '@bridge/model';
import { current, type Draft, isDraft } from 'immer';

/** Kolekcie prvkov mosta s rovnakými príkazmi (pridať / upraviť / odstrániť). */
export interface ElementCollections {
  bridgeAxes: BridgeAxis;
  profiles: ProfileDefinition;
  superstructures: Superstructure;
  edgeBeams: EdgeBeam;
  bearingLines: BearingLine;
  supports: Support;
  terrains: TerrainSurface;
  planLines: PlanLine;
  obstacles: Obstacle;
  surveys: Survey;
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
  /** zmena údajov zadania (Fáza 10a) */
  | { type: 'updateBrief'; changes: Partial<Brief> }
  /** oblasť mosta (Fáza 10a); null ju zruší */
  | { type: 'setStudyArea'; studyArea: StudyArea | null }
  | { type: 'importAlignments'; alignments: AlignmentData[]; origin: Vec3 }
  | { type: 'addParameter'; parameter: Parameter }
  | { type: 'updateParameter'; id: string; changes: Partial<Omit<Parameter, 'id'>> }
  | { type: 'removeParameter'; id: string }
  /** premenovanie vrátane prepisu odkazov v ostatných výrazoch aj v prepisoch variantov */
  | { type: 'renameParameter'; id: string; name: string }
  /** prepis priebehu globálneho parametra v aktívnom variante (ADR 0024); null prepis zruší */
  | { type: 'setParameterOverride'; id: string; law: StationFunction | null }
  /** prepnutie aktívneho variantu = výmena prvkov mosta s pracovnou kópiou (ADR 0024) */
  | { type: 'setActiveVariant'; id: string }
  /** kópia aktívneho variantu (prvky s rovnakými id, prepisy parametrov) ako nový aktívny variant */
  | { type: 'duplicateVariant'; id: string; name: string }
  | { type: 'renameVariant'; id: string; name: string }
  /** odstráni variant; aktívny najprv prepne na susedný, posledný variant ostane */
  | { type: 'removeVariant'; id: string }
  /** pridá prvky naraz (napr. príklad dvojice NK) — jeden krok späť/znova */
  | {
      type: 'addElements';
      bridgeAxes?: BridgeAxis[];
      profiles?: ProfileDefinition[];
      superstructures?: Superstructure[];
      edgeBeams?: EdgeBeam[];
      bearingLines?: BearingLine[];
      supports?: Support[];
      terrains?: TerrainSurface[];
      planLines?: PlanLine[];
      obstacles?: Obstacle[];
      surveys?: Survey[];
      /** lokálny počiatok, ak ho projekt ešte nemá (meračka bez osi, ADR 0021) */
      origin?: Vec3;
    }
  | ElementUpdate
  /** odstráni prvok; os uloženia aj s podperami na nej (ADR 0017), NK aj s rímsami (ADR 0023) */
  | { type: 'removeElement'; collection: ElementCollection; id: string }
  /** nahradí terén novým na tom istom mieste zoznamu (napr. znova stiahnutý DMR) — jeden krok späť/znova */
  | { type: 'replaceTerrain'; id: string; terrain: TerrainSurface }
  /** viac príkazov za sebou ako jeden krok späť/znova (napr. posun osí uloženia a konca NK, ADR 0017) */
  | { type: 'batch'; commands: Command[] };

/** Kolekcie prvkov mosta pracovnej kópie ako nemenné hodnoty (bez draftov immer, nezmenené bez kópie). */
function snapshotElements(draft: Draft<ProjectFile>): VariantElements {
  const value = <T>(x: T): T => (isDraft(x) ? (current(x as Draft<T>) as T) : x);
  const e = variantElements(draft);
  return {
    bridgeAxes: value(e.bridgeAxes),
    profiles: value(e.profiles),
    superstructures: value(e.superstructures),
    edgeBeams: value(e.edgeBeams),
    bearingLines: value(e.bearingLines),
    supports: value(e.supports),
  };
}

/** Prepne aktívny variant výmenou kolekcií s pracovnou kópiou (ADR 0024); aktívny alebo neznámy nič nemení. */
function activateVariant(draft: Draft<ProjectFile>, id: string): void {
  const next = draft.variants.find((v) => v.id === id);
  const active = draft.variants.find((v) => v.id === draft.activeVariant);
  if (!next?.elements || !active || next === active) return;
  // immer dovoľuje presunúť drafty v strome: kolekcie sa vymenia bez kópie
  const stored = variantElements(draft);
  Object.assign(draft, next.elements);
  delete next.elements;
  active.elements = stored;
  draft.activeVariant = next.id;
}

/** Aplikuje príkaz na draft projektu (immer). Čistá funkcia nad draftom. */
export function applyCommand(draft: ProjectFile, command: Command): void {
  switch (command.type) {
    case 'setProjectName':
      draft.name = command.name;
      return;
    case 'updateBrief':
      Object.assign(draft.brief, command.changes);
      return;
    case 'setStudyArea':
      draft.studyArea = command.studyArea;
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
      const old = draft.parameters.find((x) => x.id === command.id)?.name;
      if (old !== undefined && old !== command.name)
        for (const v of draft.variants)
          for (const [id, law] of Object.entries(v.parameters)) {
            const next = renameInStationFunction(law, old, command.name);
            if (JSON.stringify(next) !== JSON.stringify(law)) v.parameters[id] = next;
          }
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
      draft.edgeBeams.push(...(command.edgeBeams ?? []));
      draft.bearingLines.push(...(command.bearingLines ?? []));
      draft.supports.push(...(command.supports ?? []));
      // prvý nový povrch je pre založenie podpier, ak ním nie je žiadny iný (ADR 0020)
      draft.terrains.push(
        ...(command.terrains ?? []).map((t, i) =>
          i === 0 && t.foundation === undefined && !draft.terrains.some((x) => x.foundation)
            ? { ...t, foundation: true }
            : t,
        ),
      );
      draft.planLines.push(...(command.planLines ?? []));
      draft.obstacles.push(...(command.obstacles ?? []));
      draft.surveys.push(...(command.surveys ?? []));
      if (command.origin) draft.crs.origin ??= command.origin;
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
      if (command.collection === 'bearingLines')
        draft.supports = draft.supports.filter((s) => s.bearingLine !== command.id);
      if (command.collection === 'superstructures')
        draft.edgeBeams = draft.edgeBeams.filter((b) => b.superstructure !== command.id);
      return;
    }
    case 'replaceTerrain': {
      const i = draft.terrains.findIndex((x) => x.id === command.id);
      // nový terén (napr. znova stiahnutý DMR) si ponechá príznak pre založenie
      const flag = draft.terrains[i]?.foundation;
      if (i >= 0)
        draft.terrains[i] =
          flag === undefined ? command.terrain : { ...command.terrain, foundation: flag };
      return;
    }
    case 'removeParameter': {
      const i = draft.parameters.findIndex((x) => x.id === command.id);
      if (i >= 0) draft.parameters.splice(i, 1);
      for (const v of draft.variants) delete v.parameters[command.id];
      return;
    }
    case 'setParameterOverride': {
      const variant = draft.variants.find((v) => v.id === draft.activeVariant);
      if (!variant || !draft.parameters.some((x) => x.id === command.id)) return;
      if (command.law) variant.parameters[command.id] = command.law;
      else delete variant.parameters[command.id];
      return;
    }
    case 'setActiveVariant':
      activateVariant(draft, command.id);
      return;
    case 'duplicateVariant': {
      const active = draft.variants.find((v) => v.id === draft.activeVariant);
      if (!active || draft.variants.some((v) => v.id === command.id)) return;
      // nemenné dáta sa môžu zdieľať: uložený variant aj pracovná kópia odkazujú na tie isté kolekcie
      active.elements = snapshotElements(draft);
      draft.variants.push({
        id: command.id,
        name: command.name,
        parameters: { ...active.parameters },
      });
      draft.activeVariant = command.id;
      return;
    }
    case 'renameVariant': {
      const v = draft.variants.find((x) => x.id === command.id);
      if (v) v.name = command.name;
      return;
    }
    case 'removeVariant': {
      const i = draft.variants.findIndex((v) => v.id === command.id);
      if (i < 0 || draft.variants.length < 2) return;
      if (command.id === draft.activeVariant) {
        const neighbour = draft.variants[i + 1] ?? draft.variants[i - 1];
        if (neighbour) activateVariant(draft, neighbour.id);
      }
      draft.variants.splice(i, 1);
      return;
    }
    case 'batch':
      for (const c of command.commands) applyCommand(draft, c);
      return;
  }
}
