import type { Support } from '@bridge/model';
import { evaluateNumber } from './expressions.ts';
import { globalScope } from './superstructure.ts';
import {
  type BearingLineResult,
  evaluateBearingLine,
  type SupportContext,
  supportCenter,
} from './supports.ts';

/** Terén v strede podpery [m n. m.], ktorý sa líši od uloženého; `undefined` = podpera stojí mimo terénu. */
export interface SupportTerrainChange {
  id: string;
  terrain: number | undefined;
}

export interface SupportTerrainInput extends SupportContext {
  supports: readonly Support[];
  /** výška terénu v bode (lokálne súradnice a z), `undefined` mimo terénu */
  terrainAt: (x: number, y: number) => number | undefined;
  /** výška počiatku projektu (lokálne z → m n. m.) */
  z0: number;
  /** už vyhodnotené osi uloženia podľa id (inak sa vyhodnotia z kontextu) */
  lines?: ReadonlyMap<string, BearingLineResult>;
}

/**
 * Terén v strede podpery (ADR 0019) na mm: bod na osi uloženia posunutý o `offset`. Podpera, ktorej os sa nedá
 * vyhodnotiť alebo posun je neplatný, sa nemení. Vráti len podpery, ktorých `foundation.terrain` sa líši.
 */
export function resolveSupportTerrain(input: SupportTerrainInput): SupportTerrainChange[] {
  const changes: SupportTerrainChange[] = [];
  const evaluated = new Map(input.lines);
  for (const support of input.supports) {
    let line = evaluated.get(support.bearingLine);
    if (!line) {
      const def = input.bearingLines.find((l) => l.id === support.bearingLine);
      if (!def) continue;
      line = evaluateBearingLine(input, def);
      evaluated.set(def.id, line);
    }
    if (!line.axis || line.issues.some((i) => i.severity !== 'warning')) continue;
    const offset = evaluateNumber(
      support.offset,
      globalScope(input.parameters, line.station),
      'offset',
    );
    if (!offset.ok) continue;
    const c = supportCenter(line, offset.value);
    const z = input.terrainAt(c.x, c.y);
    const terrain = z === undefined ? undefined : Math.round((z + input.z0) * 1000) / 1000;
    if (terrain !== support.foundation.terrain) changes.push({ id: support.id, terrain });
  }
  return changes;
}
