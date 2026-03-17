/**
 * Interface for config validators.
 * Each validator is responsible for a single concern (SRP).
 * Validators can be composed into a pipeline (OCP).
 */
export interface ConfigValidator {
  /**
   * Validates the config object. May mutate config to apply defaults or transformations.
   * @param config - The configuration object to validate
   * @throws Error if validation fails
   */
  validate(config: Record<string, unknown>): void;
}
