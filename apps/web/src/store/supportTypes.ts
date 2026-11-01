import {
  type Support,
  type SupportLibraryEntry,
  type SupportType,
  supportFromType,
  typeFromSupport,
} from '@bridge/model';
import type { SupportResult } from '@bridge/sections';

/** Zdroj typov podpier (ADR 0019). */
export type SupportSourceKey = 'builtin' | 'cloud' | 'project' | 'file';

/** Kľúč typu vo výbere: zdroj a id položky; prázdny = predvolená podpera. */
export const supportTypeKey = (source: SupportSourceKey, id: string) => `${source}:${id}`;

/** Zdroj s položkami (poradie zdrojov = poradie vo výberoch). */
export interface SupportSource {
  key: SupportSourceKey;
  title: string;
  /** krátky názov zdroja vo výberoch typu */
  short: string;
  entries: readonly SupportLibraryEntry[];
}

/** Podpery projektu ako typy (kóta → výška podpery s aktuálnou najnižšou výškou). */
export function projectSupportEntries(
  supports: readonly Support[],
  results: readonly SupportResult[],
): SupportLibraryEntry[] {
  return supports.map((s) => ({
    id: s.id,
    name: s.name,
    support: typeFromSupport(s, results.find((r) => r.support.id === s.id)?.height.min),
  }));
}

/** Typ podľa kľúča výberu; undefined pre predvolenú podperu alebo neznámy kľúč. */
export function findSupportType(
  sources: readonly SupportSource[],
  key: string,
): SupportLibraryEntry | undefined {
  for (const s of sources) {
    const entry = s.entries.find((e) => supportTypeKey(s.key, e.id) === key);
    if (entry) return entry;
  }
  return undefined;
}

/** Možnosti výberu typu pre druh podpery: predvolená a typy zo zdrojov s menom zdroja. */
export function supportTypeOptions(
  sources: readonly SupportSource[],
  kind: Support['kind'],
  defaultLabel: string,
): { value: string; label: string }[] {
  return [
    { value: '', label: defaultLabel },
    ...sources.flatMap((s) =>
      s.entries
        .filter((e) => e.support.kind === kind)
        .map((e) => ({ value: supportTypeKey(s.key, e.id), label: `${e.name} · ${s.short}` })),
    ),
  ];
}

/**
 * Typ na existujúcu podperu (ADR 0019): zachová id, meno, os, posun a terén; ložiská z prierezu NK, opora na šírku
 * NK, kóta základovej škáry ostáva pre prepnutie režimu.
 */
export function applySupportType(
  support: Support,
  type: SupportType,
  deck: { bearings: readonly number[]; width: number | undefined },
): Support {
  const next = supportFromType(type, {
    id: support.id,
    name: support.name,
    bearingLine: support.bearingLine,
    bearings: deck.bearings,
    ...(deck.width === undefined ? {} : { deckWidth: deck.width }),
    level: support.foundation.level,
  });
  const terrain = support.foundation.terrain;
  return {
    ...next,
    offset: support.offset,
    foundation: { ...next.foundation, ...(terrain === undefined ? {} : { terrain }) },
  };
}
