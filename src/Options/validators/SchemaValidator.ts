import { z } from 'zod';
import type { ConfigValidator } from './ConfigValidator';

/**
 * Validates config against a Zod schema, applying type coercion and defaults.
 * This is the first validator in the pipeline — it ensures the config object
 * has the correct shape and types before business rules are checked.
 */
export class SchemaValidator implements ConfigValidator {
  private schema: z.ZodObject<z.ZodRawShape>;

  constructor(schema: z.ZodObject<z.ZodRawShape>) {
    this.schema = schema;
  }

  validate(config: Record<string, unknown>): void {
    const result = this.schema.safeParse(config);
    if (!result.success) {
      const messages = result.error.issues.map(issue => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      });
      throw new Error(`Parse Server configuration error:\n${messages.join('\n')}`);
    }

    // Replace config contents with only schema-approved keys
    const validated = result.data;
    for (const key of Object.keys(config)) {
      delete config[key];
    }
    Object.assign(config, validated);
  }
}
