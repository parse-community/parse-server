import logger from '../logger';
import Deprecations from './Deprecations';

/**
 * The deprecator class.
 */
class Deprecator {
  /**
   * Scans the Parse Server for deprecated options.
   * This needs to be called before setting option defaults, otherwise it
   * becomes indistinguishable whether an option has been set manually or
   * by default.
   * @param {any} options The Parse Server options.
   */
  static scanParseServerOptions(options) {
    // Scan for deprecations
    for (const deprecation of Deprecator._getDeprecations()) {
      // Get deprecation properties
      const solution = deprecation.solution;
      const optionKey = deprecation.optionKey;
      const changeNewDefault = deprecation.changeNewDefault;

      // If default will change, only throw a warning if option is not set
      if (changeNewDefault != null && options[optionKey] == null) {
        Deprecator._logOption({ optionKey, changeNewDefault, solution });
      }
    }
  }

  /**
   * Logs a deprecation warning for a parameter that can only be determined dynamically
   * during runtime.
   *
   * Note: Do not use this to log deprecations of Parse Server options, but add such
   * deprecations to `Deprecations.js` instead. See the contribution docs for more
   * details.
   *
   * For consistency, the deprecation warning is composed of the following parts:
   *
   * > DeprecationWarning: `usage` is deprecated and will be removed in a future version.
   * `solution`.
   *
   * - `usage`: The deprecated usage.
   * - `solution`: The instruction to resolve this deprecation warning.
   *
   * For example:
   * > DeprecationWarning: `Prefixing field names with dollar sign ($) in aggregation query`
   * is deprecated and will be removed in a future version. `Reference field names without
   * dollar sign prefix.`
   *
   * @param {Object} options The deprecation options.
   * @param {String} options.usage The usage that is deprecated.
   * @param {String} [options.solution] The instruction to resolve this deprecation warning.
   * Optional. It is recommended to add an instruction for the convenience of the developer.
   */
  static logRuntimeDeprecation(options) {
    Deprecator._logGeneric(options);
  }

  /**
   * Returns the deprecation definitions.
   * @returns {Array<Object>} The deprecations.
   */
  static _getDeprecations() {
    return Deprecations;
  }

  /**
   * Logs a generic deprecation warning.
   *
   * @param {Object} options The deprecation options.
   * @param {String} options.usage The usage that is deprecated.
   * @param {String} [options.solution] The instruction to resolve this deprecation warning.
   * Optional. It is recommended to add an instruction for the convenience of the developer.
   */
  static _logGeneric({ usage, solution }) {
    // Compose message
    let output = `DeprecationWarning: ${usage} is deprecated and will be removed in a future version.`;
    output += solution ? ` ${solution}` : '';
    logger.warn(output);
  }

  /**
   * Logs a deprecation warning for a Parse Server option.
   *
   * @param {String} optionKey The option key incl. its path, e.g. `security.enableCheck`.
   * @param {String} envKey The environment key, e.g. `PARSE_SERVER_SECURITY`.
   * @param {String} changeNewKey Set the new key name if the current key will be replaced,
   * or set to an empty string if the current key will be removed without replacement.
   * @param {String} changeNewDefault Set the new default value if the key's default value
   * will change in a future version.
   * @param {String} [solution] The instruction to resolve this deprecation warning. This
   * message must not include the warning that the parameter is deprecated, that is
   * automatically added to the message. It should only contain the instruction on how
   * to resolve this warning.
   */
  static _logOption({ optionKey, envKey, changeNewKey, changeNewDefault, solution }) {
    const type = optionKey ? 'option' : 'environment key';
    const key = optionKey ? optionKey : envKey;
    const keyAction =
      changeNewKey == null
        ? undefined
        : changeNewKey.length > 0
          ? `renamed to '${changeNewKey}'`
          : `removed`;

    // Compose message
    let output = `DeprecationWarning: The Parse Server ${type} '${key}' `;
    output += changeNewKey ? `is deprecated and will be ${keyAction} in a future version.` : '';
    output += changeNewDefault
      ? `default will change to '${changeNewDefault}' in a future version.`
      : '';
    output += solution ? ` ${solution}` : '';
    logger.warn(output);
  }
}

module.exports = Deprecator;
