import type { ModelIssue } from './issues.ts';
import { migrateProject } from './migrations.ts';
import { type ProjectFile, ProjectFileSchema } from './schema.ts';

export type OpenResult = { ok: true; project: ProjectFile } | { ok: false; issues: ModelIssue[] };

/** Otvorí projektový súbor: JSON → migrácie → validácia schémou. Problémy vracia, nevyhadzuje. */
export function openProject(text: string): OpenResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return {
      ok: false,
      issues: [{ code: 'InvalidJson', detail: e instanceof Error ? e.message : String(e) }],
    };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {
      ok: false,
      issues: [{ code: 'SchemaViolation', path: '', message: 'expected an object' }],
    };
  }
  const migrated = migrateProject(raw as Record<string, unknown>);
  if (!migrated.ok) return { ok: false, issues: [migrated.issue] };
  const parsed = ProjectFileSchema.safeParse(migrated.raw);
  if (parsed.success) return { ok: true, project: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map((i) => ({
      code: 'SchemaViolation' as const,
      path: formatPath(i.path),
      message: i.message,
    })),
  };
}

/** Uloží projekt do JSON so stabilným poradím kľúčov podľa schémy (determinizmus, ADR 0002). */
export function serializeProject(project: ProjectFile): string {
  return `${JSON.stringify(ProjectFileSchema.parse(project), null, 2)}\n`;
}

function formatPath(path: readonly PropertyKey[]): string {
  return path
    .map((p, i) => (typeof p === 'number' ? `[${p}]` : `${i === 0 ? '' : '.'}${String(p)}`))
    .join('');
}
