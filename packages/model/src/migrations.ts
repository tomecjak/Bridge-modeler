import type { ModelIssue } from './issues.ts';
import { SCHEMA_VERSION } from './schema.ts';

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
