import { Command } from 'commander';
import { z } from 'zod';
import { getAllOptionMeta, coerceValue } from '../schemaUtils';

/**
 * Registers Commander options from a Zod object schema's metadata.
 *
 * For each field in the schema that has option metadata, creates a
 * corresponding Commander option with the appropriate flag format,
 * help text, and type coercion.
 */
export function registerSchemaOptions(
  program: Command,
  schema: z.ZodObject<z.ZodRawShape>
): void {
  const metaMap = getAllOptionMeta(schema);
  const shape = schema.shape;

  for (const [key, meta] of metaMap) {
    const fieldSchema = shape[key] as z.ZodTypeAny;
    const isRequired = !isOptionalOrDefaulted(fieldSchema);

    const flag = isRequired ? `--${key} <${key}>` : `--${key} [${key}]`;

    program.option(flag, meta.help, (value: string) => {
      return coerceValue(value, fieldSchema);
    });
  }
}

/**
 * Extracts option values from a parsed Commander program.
 * Only returns values that were explicitly set via CLI args.
 */
export function extractCliOptions(
  program: Command,
  schema: z.ZodObject<z.ZodRawShape>
): Record<string, unknown> {
  const opts = program.opts();
  const shape = schema.shape;
  const result: Record<string, unknown> = {};

  for (const key of Object.keys(shape)) {
    if (opts[key] !== undefined) {
      result[key] = opts[key];
    }
  }

  return result;
}

/**
 * Checks if a Zod schema field is optional or has a default value.
 */
function isOptionalOrDefaulted(schema: z.ZodTypeAny): boolean {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return true;
  }
  if (schema instanceof z.ZodDefault) {
    return true;
  }
  return false;
}
