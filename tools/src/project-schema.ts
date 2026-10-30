import { ProjectFileSchema, SCHEMA_VERSION } from '@bridge/model';
import { z } from 'zod';

/** JSON Schema projektového súboru (ADR 0002, 0005), generovaná zo zod schémy. */
export function projectJsonSchema(): string {
  const schema = {
    ...z.toJSONSchema(ProjectFileSchema),
    $id: `https://bridge-modeler.local/schema/project-${SCHEMA_VERSION}.json`,
    title: `Projekt modelára mostov (schemaVersion ${SCHEMA_VERSION})`,
  };
  return `${JSON.stringify(schema, null, 2)}\n`;
}
