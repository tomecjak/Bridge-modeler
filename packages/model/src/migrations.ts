import type { ModelIssue } from './issues.ts';
import { SCHEMA_VERSION } from './schema.ts';
import { defaultAbutmentGeometry } from './types.ts';

type RawProject = Record<string, unknown>;

/**
 * Reťaz migrácií `verzia → nasledujúca verzia`. Každá migrácia je čistá funkcia s vlastným testom.
 */
export const MIGRATIONS: Readonly<
  Record<string, { to: string; migrate: (raw: RawProject) => RawProject }>
> = {
  /** 1 → 2: os mosta, prierezy a NK (ADR 0007) */
  '1': {
    to: '2',
    migrate: (raw) => ({ ...raw, bridgeAxes: [], profiles: [], superstructures: [] }),
  },
  /** 2 → 3: podpery (ADR 0008) */
  '2': { to: '3', migrate: (raw) => ({ ...raw, supports: [] }) },
  /** 3 → 4: opora s prahom, múrikom a krídlami (ADR 0010); pôvodné rozmery ostávajú, nové predvolené */
  '3': {
    to: '4',
    migrate: (raw) => ({
      ...raw,
      supports: (Array.isArray(raw.supports) ? raw.supports : []).map((s: RawProject) => {
        const g = s.geometry as RawProject | undefined;
        return g?.type === 'abutment'
          ? { ...s, geometry: { ...defaultAbutmentGeometry(), ...g } }
          : s;
      }),
    }),
  },
  /** 4 → 5: terén (ADR 0011) */
  '4': { to: '5', migrate: (raw) => ({ ...raw, terrains: [] }) },
  /** 5 → 6: čiary v pôdoryse a okraj NK podľa krivky (Fáza 8a) */
  '5': { to: '6', migrate: (raw) => ({ ...raw, planLines: [] }) },
};

/** Prevedie surový objekt projektu na aktuálnu verziu schémy (bez validácie obsahu). */
export function migrateProject(
  raw: RawProject,
  migrations = MIGRATIONS,
): { ok: true; raw: RawProject } | { ok: false; issue: ModelIssue } {
  let current = raw;
  let version = String(current.schemaVersion ?? '');
  const visited = new Set<string>();
  while (version !== SCHEMA_VERSION) {
    const step = migrations[version];
    if (!step || visited.has(version))
      return { ok: false, issue: { code: 'UnsupportedSchemaVersion', version } };
    visited.add(version);
    current = { ...step.migrate(current), schemaVersion: step.to };
    version = step.to;
  }
  return { ok: true, raw: current };
}
