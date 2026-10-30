import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectJsonSchema } from './project-schema.ts';

describe('docs/schema/project.schema.json', () => {
  it('is up to date with the zod schema (run pnpm schema:export)', () => {
    const file = readFileSync(
      resolve(import.meta.dirname, '../../docs/schema/project.schema.json'),
      'utf8',
    );
    expect(file).toBe(projectJsonSchema());
  });
});
