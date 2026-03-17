import type { ConfigValidator } from './ConfigValidator';

/**
 * Validates controller-dependent configuration.
 * Runs after controllers are assembled — checks that runtime dependencies
 * required by certain config options are present.
 *
 * Type-level checks (booleans, numbers, formats) are handled by Zod schemas.
 * This validator only checks cross-field runtime constraints that depend
 * on assembled controller state.
 */
export class ControllerValidator implements ConfigValidator {
  validate(config: Record<string, unknown>): void {
    if (config.verifyUserEmails) {
      this.validateEmailVerificationDependencies(config);
    }
  }

  /**
   * When email verification is enabled, an email adapter, app name,
   * and publicServerURL must all be configured.
   */
  private validateEmailVerificationDependencies(config: Record<string, unknown>): void {
    const userController = config.userController as Record<string, unknown> | undefined;
    const emailAdapter = userController?.adapter;
    if (!emailAdapter) {
      throw new Error('An emailAdapter is required for e-mail verification and password resets.');
    }
    if (typeof config.appName !== 'string') {
      throw new Error('An app name is required for e-mail verification and password resets.');
    }
    const publicServerURL = config.publicServerURL || config._publicServerURL;
    if (!publicServerURL) {
      throw new Error('The option publicServerURL is required when verifyUserEmails is enabled.');
    }
    if (config.emailVerifyTokenReuseIfValid && !config.emailVerifyTokenValidityDuration) {
      throw new Error('You cannot use emailVerifyTokenReuseIfValid without emailVerifyTokenValidityDuration');
    }
  }
}
