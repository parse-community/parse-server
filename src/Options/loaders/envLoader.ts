import { z } from 'zod';
import { buildEnvMap, coerceValue } from '../schemaUtils';

/**
 * Loads configuration from environment variables based on Zod schema metadata.
 *
 * For each field in the schema that has an `env` metadata key, checks if that
 * environment variable is set. If so, coerces the string value to the
 * appropriate type and places it at the correct path in the result object.
 *
 * Supports nested schemas: if a field is a ZodObject, its fields are also
 * checked for env var mappings.
 */
export function loadFromEnv(
  schema: z.ZodObject<z.ZodRawShape>,
  env: Record<string, string | undefined> = process.env
): Record<string, unknown> {
  const envMap = buildEnvMap(schema);
  const result: Record<string, unknown> = {};

  for (const [envKey, { path, fieldSchema }] of envMap) {
    const rawValue = env[envKey];
    if (rawValue === undefined || rawValue === '') {
      continue;
    }

    const coerced = coerceValue(rawValue, fieldSchema);
    setNestedValue(result, path, coerced);
  }

  return result;
}

/**
 * Sets a value at a nested path in an object.
 * Creates intermediate objects as needed.
 *
 * Example: setNestedValue(obj, ['schema', 'strict'], true)
 * Result: { schema: { strict: true } }
 */
function setNestedValue(obj: Record<string, unknown>, path: string[], value: unknown): void {
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (current[key] === undefined || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[path[path.length - 1]] = value;
}
