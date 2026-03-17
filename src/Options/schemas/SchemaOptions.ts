import { z } from 'zod';
import { option } from '../schemaUtils';

export const SchemaOptionsSchema = z
  .object({
    afterMigration: option(z.custom<Function>(v => typeof v === 'function').nullable().optional(), {
      env: 'PARSE_SERVER_SCHEMA_AFTER_MIGRATION',
      help: 'Callback function executed after schema migrations have completed.',
    }),
    beforeMigration: option(z.custom<Function>(v => typeof v === 'function').nullable().optional(), {
      env: 'PARSE_SERVER_SCHEMA_BEFORE_MIGRATION',
      help: 'Callback function executed before schema migrations begin.',
    }),
    definitions: option(z.array(z.any()).default([]), {
      env: 'PARSE_SERVER_SCHEMA_DEFINITIONS',
      help: 'Array of schema definitions in REST format, used to configure classes, fields, indexes, and CLPs.',
      docType: 'Any',
    }),
    deleteExtraFields: option(z.boolean().default(false), {
      env: 'PARSE_SERVER_SCHEMA_DELETE_EXTRA_FIELDS',
      help: 'Delete fields from existing classes that are not defined in the schema definitions.',
    }),
    keepUnknownIndexes: option(z.boolean().default(false), {
      env: 'PARSE_SERVER_SCHEMA_KEEP_UNKNOWN_INDEXES',
      help: 'Preserve database indexes that are not defined in the schema definitions, instead of dropping them.',
    }),
    lockSchemas: option(z.boolean().default(false), {
      env: 'PARSE_SERVER_SCHEMA_LOCK_SCHEMAS',
      help: 'Prevent any schema modifications at runtime; all changes must be made through schema definitions.',
    }),
    recreateModifiedFields: option(z.boolean().default(false), {
      env: 'PARSE_SERVER_SCHEMA_RECREATE_MODIFIED_FIELDS',
      help: 'Drop and recreate fields whose type has changed in the schema definitions.',
    }),
    strict: option(z.boolean().default(false), {
      env: 'PARSE_SERVER_SCHEMA_STRICT',
      help: 'Exit the server process if a schema migration fails, instead of continuing with errors.',
    }),
  })
  .loose();

export type SchemaOptions = z.infer<typeof SchemaOptionsSchema>;
