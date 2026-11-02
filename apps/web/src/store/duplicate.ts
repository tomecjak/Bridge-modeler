import type { BearingLine, ProjectFile, Support } from '@bridge/model';
import { nextLineName } from './bearingLines.ts';
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
 * Kópia osi uloženia posunutá o 5 m po staničení (pri konci NK späť, aby ostala v rozsahu NK) s ďalším voľným
 * číslom v NK a kópie podpier na nej s ďalšími číslami podpier.
 */
function copyLine(
  project: ProjectFile,
  line: BearingLine,
  supports: readonly Support[],
  newId: (prefix: string) => string,
): { line: BearingLine; supports: Support[] } {
  const deck = project.superstructures.find((d) => d.id === line.superstructure);
  const shifted = line.station + DUPLICATE_SHIFT;
  const copy: BearingLine = {
    ...clone(line),
    id: newId('bl'),
    name: nextLineName(
      project.bearingLines
        .filter((l) => l.superstructure === line.superstructure)
        .map((l) => l.name),
    ),
    station: deck && shifted > deck.to ? line.station - DUPLICATE_SHIFT : shifted,
  };
  const names = project.supports.map((x) => x.name);
  return {
    line: copy,
    supports: supports.map((s) => {
      const name = nextSupportName(s.kind === 'abutment' ? 'O' : 'P', names);
      names.push(name);
      return { ...clone(s), id: newId('sup'), name, bearingLine: copy.id };
    }),
  };
}

/**
 * Kópia prvku (Upraviť → Duplikovať, ADR 0016) ako jeden príkaz `addElements`:
 * - podpera aj os uloženia dostanú novú os posunutú o 5 m po staničení (v rozsahu NK, ADR 0017) a ďalšie čísla,
 * - NK sa skopíruje aj s vlastnou osou mosta, osami uloženia a podperami (dá sa posunúť nabok, napr. druhá NK
 *   dvojice),
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
      const line = project.bearingLines.find((l) => l.id === s?.bearingLine);
      if (!s || !line) return undefined;
      const copy = copyLine(project, line, [s], newId);
      return {
        command: { type: 'addElements', bearingLines: [copy.line], supports: copy.supports },
        selected: { collection, id: copy.supports[0]?.id ?? '' },
      };
    }
    case 'bearingLines': {
      const line = project.bearingLines.find((l) => l.id === id);
      if (!line) return undefined;
      const on = project.supports.filter((s) => s.bearingLine === id);
      const copy = copyLine(project, line, on, newId);
      return {
        command: { type: 'addElements', bearingLines: [copy.line], supports: copy.supports },
        selected: { collection, id: copy.line.id },
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
      const lineIds = new Map(
        project.bearingLines
          .filter((l) => l.superstructure === d.id)
          .map((l) => [l.id, newId('bl')]),
      );
      const bearingLines = project.bearingLines.flatMap((l) => {
        const lineId = lineIds.get(l.id);
        return lineId ? [{ ...clone(l), id: lineId, superstructure: copy.id }] : [];
      });
      const supports = project.supports.flatMap((s) => {
        const lineId = lineIds.get(s.bearingLine);
        return lineId ? [{ ...clone(s), id: newId('sup'), bearingLine: lineId }] : [];
      });
      return {
        command: {
          type: 'addElements',
          ...(axisCopy ? { bridgeAxes: [axisCopy] } : {}),
          superstructures: [copy],
          ...(bearingLines.length > 0 ? { bearingLines, supports } : {}),
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
    case 'obstacles': {
      const o = project.obstacles.find((x) => x.id === id);
      if (!o) return undefined;
      const copy = {
        ...clone(o),
        id: newId('obst'),
        name: copyName(
          o.name,
          project.obstacles.map((x) => x.name),
        ),
      };
      return {
        command: { type: 'addElements', obstacles: [copy] },
        selected: { collection, id: copy.id },
      };
    }
    case 'terrains':
    case 'surveys':
      return undefined;
  }
}
