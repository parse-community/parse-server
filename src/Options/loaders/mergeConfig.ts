/**
 * Merges multiple configuration sources with defined priority.
 * Later sources override earlier sources. Nested objects are deep merged.
 *
 * Standard priority order (lowest to highest):
 * 1. Config file
 * 2. Environment variables
 * 3. CLI arguments
 *
 * Zod schema defaults are applied separately during parse().
 */
export function mergeConfigs(
  ...sources: Array<Record<string, unknown>>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const source of sources) {
    deepMerge(result, source);
  }

  return result;
}

/**
 * Deep merges source into target, mutating target in place.
 * - Plain objects are recursively merged.
 * - Arrays and primitives from source overwrite target values.
 * - Undefined values in source are skipped.
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): void {
  for (const key of Object.keys(source)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      continue;
    }

    const sourceVal = source[key];
    const targetVal = target[key];

    if (sourceVal === undefined) {
      continue;
    }

    if (isPlainObject(sourceVal) && isPlainObject(targetVal)) {
      deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>
      );
    } else if (isPlainObject(sourceVal)) {
      const clone: Record<string, unknown> = {};
      deepMerge(clone, sourceVal as Record<string, unknown>);
      target[key] = clone;
    } else {
      target[key] = sourceVal;
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
