import type { ConfigValidator } from './ConfigValidator';

/**
 * Composes multiple ConfigValidators into a sequential pipeline.
 * Each validator runs in order; if one fails, subsequent validators are skipped.
 *
 * Usage:
 * ```ts
 * const pipeline = new ConfigValidationPipeline([
 *   new SchemaValidator(ParseServerOptionsSchema),
 *   new BusinessRuleValidator(),
 * ]);
 * pipeline.validate(config);
 * ```
 */
export class ConfigValidationPipeline implements ConfigValidator {
  private validators: ConfigValidator[];

  constructor(validators: ConfigValidator[]) {
    this.validators = validators;
  }

  validate(config: Record<string, unknown>): void {
    for (const validator of this.validators) {
      validator.validate(config);
    }
  }
}
