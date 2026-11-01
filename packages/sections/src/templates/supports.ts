import {
  defaultAbutmentGeometry,
  type Library,
  memoryLibrary,
  type SupportLibraryEntry,
  type SupportType,
} from '@bridge/model';

/**
 * Zabudované typy podpier (ADR 0019). Rozmery sú zástupné, kým ich projektant nepotvrdí (PLAN.md, Otvorené otázky);
 * dĺžku opory a jej základu určí pri vložení šírka NK, osovú vzdialenosť dvoch stĺpov ložiská.
 */
export const SUPPORT_TEMPLATES: readonly { key: string; name: string; support: SupportType }[] = [
  {
    key: 'wallPier',
    name: 'Stenový pilier',
    support: {
      kind: 'pier',
      geometry: { type: 'wall', thickness: '1.2', length: '7.5' },
      footing: { length: '9', width: '6.5', thickness: '1.5' },
      connection: 'bearing',
      bearingHeight: '0.45',
      foundation: { mode: 'terrain', cover: '0.5', height: '8' },
    },
  },
  {
    key: 'singleColumn',
    name: 'Jeden stĺp',
    support: {
      kind: 'pier',
      geometry: {
        type: 'columns',
        shape: 'circle',
        diameter: '1.5',
        width: '1.5',
        depth: '1.5',
        count: '1',
        spacing: '0',
      },
      footing: { length: '5', width: '5', thickness: '1.5' },
      connection: 'fixed',
      bearingHeight: '0',
      foundation: { mode: 'terrain', cover: '0.5', height: '8' },
    },
  },
  {
    key: 'twoColumns',
    name: 'Dva stĺpy',
    support: {
      kind: 'pier',
      geometry: {
        type: 'columns',
        shape: 'circle',
        diameter: '1.2',
        width: '1.2',
        depth: '1.2',
        count: '2',
        spacing: '4',
      },
      footing: { length: '6', width: '3.5', thickness: '1.2' },
      connection: 'bearing',
      bearingHeight: '0.45',
      foundation: { mode: 'terrain', cover: '0.5', height: '8' },
    },
  },
  {
    key: 'abutmentOnPiles',
    name: 'Opora na pilótach (212-00)',
    support: {
      kind: 'abutment',
      geometry: { ...defaultAbutmentGeometry('12'), backwallThickness: '0.84' },
      footing: { length: '0', width: '0', thickness: '0' },
      connection: 'bearing',
      bearingHeight: '0.45',
      // prah priamo na pilótach: výška podpery = výška prahu
      foundation: { mode: 'height', cover: '0.5', height: '1.1' },
    },
  },
  {
    key: 'massiveAbutment',
    name: 'Masívna opora',
    support: {
      kind: 'abutment',
      geometry: {
        ...defaultAbutmentGeometry('12'),
        backwallThickness: '0.84',
        stemThickness: '1.5',
      },
      footing: { length: '12', width: '5', thickness: '1.5' },
      connection: 'bearing',
      bearingHeight: '0.45',
      foundation: { mode: 'height', cover: '0.5', height: '5' },
    },
  },
  {
    key: 'integralAbutment',
    name: 'Integrovaná opora',
    support: {
      kind: 'abutment',
      geometry: {
        ...defaultAbutmentGeometry('12'),
        construction: 'monolithic',
        wallThickness: '1.2',
      },
      footing: { length: '0', width: '0', thickness: '0' },
      connection: 'fixed',
      bearingHeight: '0',
      foundation: { mode: 'height', cover: '0.5', height: '4' },
    },
  },
];

/** Zabudované typy podpier ako knižnica len na čítanie (id `sablona-podpera:<kľúč>`). */
export function builtinSupportLibrary(name = 'Šablóny'): Library<SupportLibraryEntry> {
  return memoryLibrary(
    name,
    SUPPORT_TEMPLATES.map((t) => ({
      id: `sablona-podpera:${t.key}`,
      name: t.name,
      support: t.support,
    })),
    { readOnly: true },
  );
}
