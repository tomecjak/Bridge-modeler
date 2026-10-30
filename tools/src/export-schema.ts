/** Zapíše JSON Schema projektu do docs/schema/project.schema.json (pnpm schema:export). */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { projectJsonSchema } from './project-schema.ts';

const dir = resolve(import.meta.dirname, '../../docs/schema');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'project.schema.json'), projectJsonSchema());
console.log(`JSON Schema zapísaná do ${join(dir, 'project.schema.json')}`);
