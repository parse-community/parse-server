import { ParseServerOptionsSchema } from './schemas/ParseServerOptions';
import { SchemaValidator } from './validators/SchemaValidator';

/**
 * The schema validator instance for Parse Server configuration.
 * All validation rules (types, defaults, constraints, cross-field checks)
 * are encoded in the Zod schema itself.
 */
const schemaValidator = new SchemaValidator(ParseServerOptionsSchema);

/**
 * Validates and applies defaults to a Parse Server configuration object.
 *
 * @param options - Raw configuration object
 * @returns The validated and defaulted configuration object
 * @throws Error with descriptive message if validation fails
 */
export function validateConfig(options: Record<string, any>): Record<string, any> {
  if (options == null || typeof options !== 'object') {
    throw new Error('Parse Server configuration must be a non-null object.');
  }
  const config = { ...options };
  schemaValidator.validate(config);
  return config;
}
