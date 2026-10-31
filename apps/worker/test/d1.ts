/**
 * Náhrada D1 pre testy vo Vitest/Node nad zabudovaným `node:sqlite` (ADR 0015): podmnožina API, ktorú Worker
 * používa (`prepare().bind().all() / first() / run()`), a spustenie skutočných migrácií.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

export function testDatabase(): D1Database {
  const db = new DatabaseSync(':memory:');
  const dir = join(import.meta.dirname, '../migrations');
  for (const file of readdirSync(dir).sort()) db.exec(readFileSync(join(dir, file), 'utf8'));
  const statement = (sql: string, args: SQLInputValue[]) => ({
    bind: (...values: unknown[]) => statement(sql, values as SQLInputValue[]),
    all: async () => ({ results: db.prepare(sql).all(...args), success: true, meta: {} }),
    first: async () => db.prepare(sql).get(...args) ?? null,
    run: async () => {
      const r = db.prepare(sql).run(...args);
      return { success: true, results: [], meta: { changes: Number(r.changes) } };
    },
  });
  return { prepare: (sql: string) => statement(sql, []) } as unknown as D1Database;
}
