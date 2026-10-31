import type { ProjectFile } from '@bridge/model';
import type { Command, ElementCollection } from './commands.ts';

/** Posun kópie podpery po staničení a čiary v pôdoryse [m], aby nebola na rovnakom mieste ako originál. */
export const DUPLICATE_SHIFT = 5;

/** Prvý voľný názov „názov (kópia)“, „názov (kópia 2)“, … */
export function copyName(name: string, existing: readonly string[], copy = 'kópia'): string {
  const used = new Set(existing);
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? `${name} (${copy})` : `${name} (${copy} ${n})`;
    if (!used.has(candidate)) return candidate;
  }
}

/** Prvý voľný názov podpery s predponou O (opora) alebo P (pilier). */
function nextSupportName(prefix: string, existing: readonly string[]): string {
  const used = new Set(existing);
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * Kópia prvku (Upraviť → Duplikovať, ADR 0016) ako jeden príkaz `addElements`:
 * - podpera dostane ďalšie číslo a posun o 5 m po staničení (v rozsahu NK),
 * - NK sa skopíruje aj s vlastnou osou mosta (dá sa posunúť nabok, napr. druhá NK dvojice),
 * - os mosta, prierez a čiara (posunutá o 5 m na východ) dostanú názov „(kópia)“.
 * Terén sa nekopíruje. `newId` vytvorí nové id s predponou.
 */
export function duplicateElement(
  project: ProjectFile,
  collection: ElementCollection,
  id: string,
  newId: (prefix: string) => string,
): { command: Command; selected: { collection: ElementCollection; id: string } } | undefined {
  switch (collection) {
    case 'supports': {
      const s = project.supports.find((x) => x.id === id);
      if (!s) return undefined;
      const deck = project.superstructures.find((d) => d.id === s.superstructure);
      const shifted = s.station + DUPLICATE_SHIFT;
      const station = deck && shifted > deck.to ? s.station - DUPLICATE_SHIFT : shifted;
      const copy = {
        ...clone(s),
        id: newId('sup'),
        name: nextSupportName(
          s.kind === 'abutment' ? 'O' : 'P',
          project.supports.map((x) => x.name),
        ),
        station,
      };
      return {
        command: { type: 'addElements', supports: [copy] },
        selected: { collection, id: copy.id },
      };
    }
    case 'superstructures': {
      const d = project.superstructures.find((x) => x.id === id);
      if (!d) return undefined;
      const axis = project.bridgeAxes.find((a) => a.id === d.bridgeAxis);
      const axisCopy = axis && {
        ...clone(axis),
        id: newId('axis'),
        name: copyName(
          axis.name,
          project.bridgeAxes.map((a) => a.name),
        ),
      };
      const copy = {
        ...clone(d),
        id: newId('nk'),
        name: copyName(
          d.name,
          project.superstructures.map((x) => x.name),
        ),
        bridgeAxis: axisCopy?.id ?? d.bridgeAxis,
      };
      return {
        command: {
          type: 'addElements',
          ...(axisCopy ? { bridgeAxes: [axisCopy] } : {}),
          superstructures: [copy],
        },
        selected: { collection, id: copy.id },
      };
    }
    case 'bridgeAxes': {
      const a = project.bridgeAxes.find((x) => x.id === id);
      if (!a) return undefined;
      const copy = {
        ...clone(a),
        id: newId('axis'),
        name: copyName(
          a.name,
          project.bridgeAxes.map((x) => x.name),
        ),
      };
      return {
        command: { type: 'addElements', bridgeAxes: [copy] },
        selected: { collection, id: copy.id },
      };
    }
    case 'profiles': {
      const p = project.profiles.find((x) => x.id === id);
      if (!p) return undefined;
      const copy = {
        ...clone(p),
        id: newId('prof'),
        name: copyName(
          p.name,
          project.profiles.map((x) => x.name),
        ),
      };
      return {
        command: { type: 'addElements', profiles: [copy] },
        selected: { collection, id: copy.id },
      };
    }
    case 'planLines': {
      const l = project.planLines.find((x) => x.id === id);
      if (!l) return undefined;
      const copy = {
        ...clone(l),
        id: newId('line'),
        name: copyName(
          l.name,
          project.planLines.map((x) => x.name),
        ),
        points: l.points.map((pt) => ({ x: pt.x + DUPLICATE_SHIFT, y: pt.y })),
      };
      return {
        command: { type: 'addElements', planLines: [copy] },
        selected: { collection, id: copy.id },
      };
    }
    case 'terrains':
      return undefined;
  }
}
