"use strict";

var _logger = _interopRequireDefault(require("../logger"));

var _Deprecations = _interopRequireDefault(require("./Deprecations"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

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
      const changeNewDefault = deprecation.changeNewDefault; // If default will change, only throw a warning if option is not set

      if (changeNewDefault != null && options[optionKey] == null) {
        Deprecator._logOption({
          optionKey,
          changeNewDefault,
          solution
        });
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
    return _Deprecations.default;
  }
  /**
   * Logs a generic deprecation warning.
   *
   * @param {Object} options The deprecation options.
   * @param {String} options.usage The usage that is deprecated.
   * @param {String} [options.solution] The instruction to resolve this deprecation warning.
   * Optional. It is recommended to add an instruction for the convenience of the developer.
   */


  static _logGeneric({
    usage,
    solution
  }) {
    // Compose message
    let output = `DeprecationWarning: ${usage} is deprecated and will be removed in a future version.`;
    output += solution ? ` ${solution}` : '';

    _logger.default.warn(output);
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


  static _logOption({
    optionKey,
    envKey,
    changeNewKey,
    changeNewDefault,
    solution
  }) {
    const type = optionKey ? 'option' : 'environment key';
    const key = optionKey ? optionKey : envKey;
    const keyAction = changeNewKey == null ? undefined : changeNewKey.length > 0 ? `renamed to '${changeNewKey}'` : `removed`; // Compose message

    let output = `DeprecationWarning: The Parse Server ${type} '${key}' `;
    output += changeNewKey ? `is deprecated and will be ${keyAction} in a future version.` : '';
    output += changeNewDefault ? `default will change to '${changeNewDefault}' in a future version.` : '';
    output += solution ? ` ${solution}` : '';

    _logger.default.warn(output);
  }

}

module.exports = Deprecator;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9EZXByZWNhdG9yL0RlcHJlY2F0b3IuanMiXSwibmFtZXMiOlsiRGVwcmVjYXRvciIsInNjYW5QYXJzZVNlcnZlck9wdGlvbnMiLCJvcHRpb25zIiwiZGVwcmVjYXRpb24iLCJfZ2V0RGVwcmVjYXRpb25zIiwic29sdXRpb24iLCJvcHRpb25LZXkiLCJjaGFuZ2VOZXdEZWZhdWx0IiwiX2xvZ09wdGlvbiIsImxvZ1J1bnRpbWVEZXByZWNhdGlvbiIsIl9sb2dHZW5lcmljIiwiRGVwcmVjYXRpb25zIiwidXNhZ2UiLCJvdXRwdXQiLCJsb2dnZXIiLCJ3YXJuIiwiZW52S2V5IiwiY2hhbmdlTmV3S2V5IiwidHlwZSIsImtleSIsImtleUFjdGlvbiIsInVuZGVmaW5lZCIsImxlbmd0aCIsIm1vZHVsZSIsImV4cG9ydHMiXSwibWFwcGluZ3MiOiI7O0FBQUE7O0FBQ0E7Ozs7QUFFQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQSxVQUFOLENBQWlCO0FBQ2Y7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDK0IsU0FBdEJDLHNCQUFzQixDQUFDQyxPQUFELEVBQVU7QUFDckM7QUFDQSxTQUFLLE1BQU1DLFdBQVgsSUFBMEJILFVBQVUsQ0FBQ0ksZ0JBQVgsRUFBMUIsRUFBeUQ7QUFDdkQ7QUFDQSxZQUFNQyxRQUFRLEdBQUdGLFdBQVcsQ0FBQ0UsUUFBN0I7QUFDQSxZQUFNQyxTQUFTLEdBQUdILFdBQVcsQ0FBQ0csU0FBOUI7QUFDQSxZQUFNQyxnQkFBZ0IsR0FBR0osV0FBVyxDQUFDSSxnQkFBckMsQ0FKdUQsQ0FNdkQ7O0FBQ0EsVUFBSUEsZ0JBQWdCLElBQUksSUFBcEIsSUFBNEJMLE9BQU8sQ0FBQ0ksU0FBRCxDQUFQLElBQXNCLElBQXRELEVBQTREO0FBQzFETixRQUFBQSxVQUFVLENBQUNRLFVBQVgsQ0FBc0I7QUFBRUYsVUFBQUEsU0FBRjtBQUFhQyxVQUFBQSxnQkFBYjtBQUErQkYsVUFBQUE7QUFBL0IsU0FBdEI7QUFDRDtBQUNGO0FBQ0Y7QUFFRDtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUFDOEIsU0FBckJJLHFCQUFxQixDQUFDUCxPQUFELEVBQVU7QUFDcENGLElBQUFBLFVBQVUsQ0FBQ1UsV0FBWCxDQUF1QlIsT0FBdkI7QUFDRDtBQUVEO0FBQ0Y7QUFDQTtBQUNBOzs7QUFDeUIsU0FBaEJFLGdCQUFnQixHQUFHO0FBQ3hCLFdBQU9PLHFCQUFQO0FBQ0Q7QUFFRDtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUFDb0IsU0FBWEQsV0FBVyxDQUFDO0FBQUVFLElBQUFBLEtBQUY7QUFBU1AsSUFBQUE7QUFBVCxHQUFELEVBQXNCO0FBQ3RDO0FBQ0EsUUFBSVEsTUFBTSxHQUFJLHVCQUFzQkQsS0FBTSx5REFBMUM7QUFDQUMsSUFBQUEsTUFBTSxJQUFJUixRQUFRLEdBQUksSUFBR0EsUUFBUyxFQUFoQixHQUFvQixFQUF0Qzs7QUFDQVMsb0JBQU9DLElBQVAsQ0FBWUYsTUFBWjtBQUNEO0FBRUQ7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBQ21CLFNBQVZMLFVBQVUsQ0FBQztBQUFFRixJQUFBQSxTQUFGO0FBQWFVLElBQUFBLE1BQWI7QUFBcUJDLElBQUFBLFlBQXJCO0FBQW1DVixJQUFBQSxnQkFBbkM7QUFBcURGLElBQUFBO0FBQXJELEdBQUQsRUFBa0U7QUFDakYsVUFBTWEsSUFBSSxHQUFHWixTQUFTLEdBQUcsUUFBSCxHQUFjLGlCQUFwQztBQUNBLFVBQU1hLEdBQUcsR0FBR2IsU0FBUyxHQUFHQSxTQUFILEdBQWVVLE1BQXBDO0FBQ0EsVUFBTUksU0FBUyxHQUNiSCxZQUFZLElBQUksSUFBaEIsR0FDSUksU0FESixHQUVJSixZQUFZLENBQUNLLE1BQWIsR0FBc0IsQ0FBdEIsR0FDRyxlQUFjTCxZQUFhLEdBRDlCLEdBRUcsU0FMVCxDQUhpRixDQVVqRjs7QUFDQSxRQUFJSixNQUFNLEdBQUksd0NBQXVDSyxJQUFLLEtBQUlDLEdBQUksSUFBbEU7QUFDQU4sSUFBQUEsTUFBTSxJQUFJSSxZQUFZLEdBQUksNkJBQTRCRyxTQUFVLHVCQUExQyxHQUFtRSxFQUF6RjtBQUNBUCxJQUFBQSxNQUFNLElBQUlOLGdCQUFnQixHQUNyQiwyQkFBMEJBLGdCQUFpQix3QkFEdEIsR0FFdEIsRUFGSjtBQUdBTSxJQUFBQSxNQUFNLElBQUlSLFFBQVEsR0FBSSxJQUFHQSxRQUFTLEVBQWhCLEdBQW9CLEVBQXRDOztBQUNBUyxvQkFBT0MsSUFBUCxDQUFZRixNQUFaO0FBQ0Q7O0FBNUdjOztBQStHakJVLE1BQU0sQ0FBQ0MsT0FBUCxHQUFpQnhCLFVBQWpCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGxvZ2dlciBmcm9tICcuLi9sb2dnZXInO1xuaW1wb3J0IERlcHJlY2F0aW9ucyBmcm9tICcuL0RlcHJlY2F0aW9ucyc7XG5cbi8qKlxuICogVGhlIGRlcHJlY2F0b3IgY2xhc3MuXG4gKi9cbmNsYXNzIERlcHJlY2F0b3Ige1xuICAvKipcbiAgICogU2NhbnMgdGhlIFBhcnNlIFNlcnZlciBmb3IgZGVwcmVjYXRlZCBvcHRpb25zLlxuICAgKiBUaGlzIG5lZWRzIHRvIGJlIGNhbGxlZCBiZWZvcmUgc2V0dGluZyBvcHRpb24gZGVmYXVsdHMsIG90aGVyd2lzZSBpdFxuICAgKiBiZWNvbWVzIGluZGlzdGluZ3Vpc2hhYmxlIHdoZXRoZXIgYW4gb3B0aW9uIGhhcyBiZWVuIHNldCBtYW51YWxseSBvclxuICAgKiBieSBkZWZhdWx0LlxuICAgKiBAcGFyYW0ge2FueX0gb3B0aW9ucyBUaGUgUGFyc2UgU2VydmVyIG9wdGlvbnMuXG4gICAqL1xuICBzdGF0aWMgc2NhblBhcnNlU2VydmVyT3B0aW9ucyhvcHRpb25zKSB7XG4gICAgLy8gU2NhbiBmb3IgZGVwcmVjYXRpb25zXG4gICAgZm9yIChjb25zdCBkZXByZWNhdGlvbiBvZiBEZXByZWNhdG9yLl9nZXREZXByZWNhdGlvbnMoKSkge1xuICAgICAgLy8gR2V0IGRlcHJlY2F0aW9uIHByb3BlcnRpZXNcbiAgICAgIGNvbnN0IHNvbHV0aW9uID0gZGVwcmVjYXRpb24uc29sdXRpb247XG4gICAgICBjb25zdCBvcHRpb25LZXkgPSBkZXByZWNhdGlvbi5vcHRpb25LZXk7XG4gICAgICBjb25zdCBjaGFuZ2VOZXdEZWZhdWx0ID0gZGVwcmVjYXRpb24uY2hhbmdlTmV3RGVmYXVsdDtcblxuICAgICAgLy8gSWYgZGVmYXVsdCB3aWxsIGNoYW5nZSwgb25seSB0aHJvdyBhIHdhcm5pbmcgaWYgb3B0aW9uIGlzIG5vdCBzZXRcbiAgICAgIGlmIChjaGFuZ2VOZXdEZWZhdWx0ICE9IG51bGwgJiYgb3B0aW9uc1tvcHRpb25LZXldID09IG51bGwpIHtcbiAgICAgICAgRGVwcmVjYXRvci5fbG9nT3B0aW9uKHsgb3B0aW9uS2V5LCBjaGFuZ2VOZXdEZWZhdWx0LCBzb2x1dGlvbiB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogTG9ncyBhIGRlcHJlY2F0aW9uIHdhcm5pbmcgZm9yIGEgcGFyYW1ldGVyIHRoYXQgY2FuIG9ubHkgYmUgZGV0ZXJtaW5lZCBkeW5hbWljYWxseVxuICAgKiBkdXJpbmcgcnVudGltZS5cbiAgICpcbiAgICogTm90ZTogRG8gbm90IHVzZSB0aGlzIHRvIGxvZyBkZXByZWNhdGlvbnMgb2YgUGFyc2UgU2VydmVyIG9wdGlvbnMsIGJ1dCBhZGQgc3VjaFxuICAgKiBkZXByZWNhdGlvbnMgdG8gYERlcHJlY2F0aW9ucy5qc2AgaW5zdGVhZC4gU2VlIHRoZSBjb250cmlidXRpb24gZG9jcyBmb3IgbW9yZVxuICAgKiBkZXRhaWxzLlxuICAgKlxuICAgKiBGb3IgY29uc2lzdGVuY3ksIHRoZSBkZXByZWNhdGlvbiB3YXJuaW5nIGlzIGNvbXBvc2VkIG9mIHRoZSBmb2xsb3dpbmcgcGFydHM6XG4gICAqXG4gICAqID4gRGVwcmVjYXRpb25XYXJuaW5nOiBgdXNhZ2VgIGlzIGRlcHJlY2F0ZWQgYW5kIHdpbGwgYmUgcmVtb3ZlZCBpbiBhIGZ1dHVyZSB2ZXJzaW9uLlxuICAgKiBgc29sdXRpb25gLlxuICAgKlxuICAgKiAtIGB1c2FnZWA6IFRoZSBkZXByZWNhdGVkIHVzYWdlLlxuICAgKiAtIGBzb2x1dGlvbmA6IFRoZSBpbnN0cnVjdGlvbiB0byByZXNvbHZlIHRoaXMgZGVwcmVjYXRpb24gd2FybmluZy5cbiAgICpcbiAgICogRm9yIGV4YW1wbGU6XG4gICAqID4gRGVwcmVjYXRpb25XYXJuaW5nOiBgUHJlZml4aW5nIGZpZWxkIG5hbWVzIHdpdGggZG9sbGFyIHNpZ24gKCQpIGluIGFnZ3JlZ2F0aW9uIHF1ZXJ5YFxuICAgKiBpcyBkZXByZWNhdGVkIGFuZCB3aWxsIGJlIHJlbW92ZWQgaW4gYSBmdXR1cmUgdmVyc2lvbi4gYFJlZmVyZW5jZSBmaWVsZCBuYW1lcyB3aXRob3V0XG4gICAqIGRvbGxhciBzaWduIHByZWZpeC5gXG4gICAqXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIFRoZSBkZXByZWNhdGlvbiBvcHRpb25zLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gb3B0aW9ucy51c2FnZSBUaGUgdXNhZ2UgdGhhdCBpcyBkZXByZWNhdGVkLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gW29wdGlvbnMuc29sdXRpb25dIFRoZSBpbnN0cnVjdGlvbiB0byByZXNvbHZlIHRoaXMgZGVwcmVjYXRpb24gd2FybmluZy5cbiAgICogT3B0aW9uYWwuIEl0IGlzIHJlY29tbWVuZGVkIHRvIGFkZCBhbiBpbnN0cnVjdGlvbiBmb3IgdGhlIGNvbnZlbmllbmNlIG9mIHRoZSBkZXZlbG9wZXIuXG4gICAqL1xuICBzdGF0aWMgbG9nUnVudGltZURlcHJlY2F0aW9uKG9wdGlvbnMpIHtcbiAgICBEZXByZWNhdG9yLl9sb2dHZW5lcmljKG9wdGlvbnMpO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgdGhlIGRlcHJlY2F0aW9uIGRlZmluaXRpb25zLlxuICAgKiBAcmV0dXJucyB7QXJyYXk8T2JqZWN0Pn0gVGhlIGRlcHJlY2F0aW9ucy5cbiAgICovXG4gIHN0YXRpYyBfZ2V0RGVwcmVjYXRpb25zKCkge1xuICAgIHJldHVybiBEZXByZWNhdGlvbnM7XG4gIH1cblxuICAvKipcbiAgICogTG9ncyBhIGdlbmVyaWMgZGVwcmVjYXRpb24gd2FybmluZy5cbiAgICpcbiAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgVGhlIGRlcHJlY2F0aW9uIG9wdGlvbnMuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBvcHRpb25zLnVzYWdlIFRoZSB1c2FnZSB0aGF0IGlzIGRlcHJlY2F0ZWQuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBbb3B0aW9ucy5zb2x1dGlvbl0gVGhlIGluc3RydWN0aW9uIHRvIHJlc29sdmUgdGhpcyBkZXByZWNhdGlvbiB3YXJuaW5nLlxuICAgKiBPcHRpb25hbC4gSXQgaXMgcmVjb21tZW5kZWQgdG8gYWRkIGFuIGluc3RydWN0aW9uIGZvciB0aGUgY29udmVuaWVuY2Ugb2YgdGhlIGRldmVsb3Blci5cbiAgICovXG4gIHN0YXRpYyBfbG9nR2VuZXJpYyh7IHVzYWdlLCBzb2x1dGlvbiB9KSB7XG4gICAgLy8gQ29tcG9zZSBtZXNzYWdlXG4gICAgbGV0IG91dHB1dCA9IGBEZXByZWNhdGlvbldhcm5pbmc6ICR7dXNhZ2V9IGlzIGRlcHJlY2F0ZWQgYW5kIHdpbGwgYmUgcmVtb3ZlZCBpbiBhIGZ1dHVyZSB2ZXJzaW9uLmA7XG4gICAgb3V0cHV0ICs9IHNvbHV0aW9uID8gYCAke3NvbHV0aW9ufWAgOiAnJztcbiAgICBsb2dnZXIud2FybihvdXRwdXQpO1xuICB9XG5cbiAgLyoqXG4gICAqIExvZ3MgYSBkZXByZWNhdGlvbiB3YXJuaW5nIGZvciBhIFBhcnNlIFNlcnZlciBvcHRpb24uXG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBvcHRpb25LZXkgVGhlIG9wdGlvbiBrZXkgaW5jbC4gaXRzIHBhdGgsIGUuZy4gYHNlY3VyaXR5LmVuYWJsZUNoZWNrYC5cbiAgICogQHBhcmFtIHtTdHJpbmd9IGVudktleSBUaGUgZW52aXJvbm1lbnQga2V5LCBlLmcuIGBQQVJTRV9TRVJWRVJfU0VDVVJJVFlgLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gY2hhbmdlTmV3S2V5IFNldCB0aGUgbmV3IGtleSBuYW1lIGlmIHRoZSBjdXJyZW50IGtleSB3aWxsIGJlIHJlcGxhY2VkLFxuICAgKiBvciBzZXQgdG8gYW4gZW1wdHkgc3RyaW5nIGlmIHRoZSBjdXJyZW50IGtleSB3aWxsIGJlIHJlbW92ZWQgd2l0aG91dCByZXBsYWNlbWVudC5cbiAgICogQHBhcmFtIHtTdHJpbmd9IGNoYW5nZU5ld0RlZmF1bHQgU2V0IHRoZSBuZXcgZGVmYXVsdCB2YWx1ZSBpZiB0aGUga2V5J3MgZGVmYXVsdCB2YWx1ZVxuICAgKiB3aWxsIGNoYW5nZSBpbiBhIGZ1dHVyZSB2ZXJzaW9uLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gW3NvbHV0aW9uXSBUaGUgaW5zdHJ1Y3Rpb24gdG8gcmVzb2x2ZSB0aGlzIGRlcHJlY2F0aW9uIHdhcm5pbmcuIFRoaXNcbiAgICogbWVzc2FnZSBtdXN0IG5vdCBpbmNsdWRlIHRoZSB3YXJuaW5nIHRoYXQgdGhlIHBhcmFtZXRlciBpcyBkZXByZWNhdGVkLCB0aGF0IGlzXG4gICAqIGF1dG9tYXRpY2FsbHkgYWRkZWQgdG8gdGhlIG1lc3NhZ2UuIEl0IHNob3VsZCBvbmx5IGNvbnRhaW4gdGhlIGluc3RydWN0aW9uIG9uIGhvd1xuICAgKiB0byByZXNvbHZlIHRoaXMgd2FybmluZy5cbiAgICovXG4gIHN0YXRpYyBfbG9nT3B0aW9uKHsgb3B0aW9uS2V5LCBlbnZLZXksIGNoYW5nZU5ld0tleSwgY2hhbmdlTmV3RGVmYXVsdCwgc29sdXRpb24gfSkge1xuICAgIGNvbnN0IHR5cGUgPSBvcHRpb25LZXkgPyAnb3B0aW9uJyA6ICdlbnZpcm9ubWVudCBrZXknO1xuICAgIGNvbnN0IGtleSA9IG9wdGlvbktleSA/IG9wdGlvbktleSA6IGVudktleTtcbiAgICBjb25zdCBrZXlBY3Rpb24gPVxuICAgICAgY2hhbmdlTmV3S2V5ID09IG51bGxcbiAgICAgICAgPyB1bmRlZmluZWRcbiAgICAgICAgOiBjaGFuZ2VOZXdLZXkubGVuZ3RoID4gMFxuICAgICAgICAgID8gYHJlbmFtZWQgdG8gJyR7Y2hhbmdlTmV3S2V5fSdgXG4gICAgICAgICAgOiBgcmVtb3ZlZGA7XG5cbiAgICAvLyBDb21wb3NlIG1lc3NhZ2VcbiAgICBsZXQgb3V0cHV0ID0gYERlcHJlY2F0aW9uV2FybmluZzogVGhlIFBhcnNlIFNlcnZlciAke3R5cGV9ICcke2tleX0nIGA7XG4gICAgb3V0cHV0ICs9IGNoYW5nZU5ld0tleSA/IGBpcyBkZXByZWNhdGVkIGFuZCB3aWxsIGJlICR7a2V5QWN0aW9ufSBpbiBhIGZ1dHVyZSB2ZXJzaW9uLmAgOiAnJztcbiAgICBvdXRwdXQgKz0gY2hhbmdlTmV3RGVmYXVsdFxuICAgICAgPyBgZGVmYXVsdCB3aWxsIGNoYW5nZSB0byAnJHtjaGFuZ2VOZXdEZWZhdWx0fScgaW4gYSBmdXR1cmUgdmVyc2lvbi5gXG4gICAgICA6ICcnO1xuICAgIG91dHB1dCArPSBzb2x1dGlvbiA/IGAgJHtzb2x1dGlvbn1gIDogJyc7XG4gICAgbG9nZ2VyLndhcm4ob3V0cHV0KTtcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IERlcHJlY2F0b3I7XG4iXX0=