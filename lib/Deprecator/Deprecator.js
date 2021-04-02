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
      const optionKey = deprecation.optionKey;
      const changeNewDefault = deprecation.changeNewDefault; // If default will change, only throw a warning if option is not set

      if (changeNewDefault != null && options[optionKey] == null) {
        Deprecator._log({
          optionKey,
          changeNewDefault
        });
      }
    }
  }
  /**
   * Returns the deprecation definitions.
   * @returns {Array<Object>} The deprecations.
   */


  static _getDeprecations() {
    return _Deprecations.default;
  }
  /**
   * Logs a deprecation warning for a Parse Server option.
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


  static _log({
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9EZXByZWNhdG9yL0RlcHJlY2F0b3IuanMiXSwibmFtZXMiOlsiRGVwcmVjYXRvciIsInNjYW5QYXJzZVNlcnZlck9wdGlvbnMiLCJvcHRpb25zIiwiZGVwcmVjYXRpb24iLCJfZ2V0RGVwcmVjYXRpb25zIiwib3B0aW9uS2V5IiwiY2hhbmdlTmV3RGVmYXVsdCIsIl9sb2ciLCJEZXByZWNhdGlvbnMiLCJlbnZLZXkiLCJjaGFuZ2VOZXdLZXkiLCJzb2x1dGlvbiIsInR5cGUiLCJrZXkiLCJrZXlBY3Rpb24iLCJ1bmRlZmluZWQiLCJsZW5ndGgiLCJvdXRwdXQiLCJsb2dnZXIiLCJ3YXJuIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJtYXBwaW5ncyI6Ijs7QUFBQTs7QUFDQTs7OztBQUVBO0FBQ0E7QUFDQTtBQUNBLE1BQU1BLFVBQU4sQ0FBaUI7QUFDZjtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNFLFNBQU9DLHNCQUFQLENBQThCQyxPQUE5QixFQUF1QztBQUNyQztBQUNBLFNBQUssTUFBTUMsV0FBWCxJQUEwQkgsVUFBVSxDQUFDSSxnQkFBWCxFQUExQixFQUF5RDtBQUN2RDtBQUNBLFlBQU1DLFNBQVMsR0FBR0YsV0FBVyxDQUFDRSxTQUE5QjtBQUNBLFlBQU1DLGdCQUFnQixHQUFHSCxXQUFXLENBQUNHLGdCQUFyQyxDQUh1RCxDQUt2RDs7QUFDQSxVQUFJQSxnQkFBZ0IsSUFBSSxJQUFwQixJQUE0QkosT0FBTyxDQUFDRyxTQUFELENBQVAsSUFBc0IsSUFBdEQsRUFBNEQ7QUFDMURMLFFBQUFBLFVBQVUsQ0FBQ08sSUFBWCxDQUFnQjtBQUFFRixVQUFBQSxTQUFGO0FBQWFDLFVBQUFBO0FBQWIsU0FBaEI7QUFDRDtBQUNGO0FBQ0Y7QUFFRDtBQUNGO0FBQ0E7QUFDQTs7O0FBQ0UsU0FBT0YsZ0JBQVAsR0FBMEI7QUFDeEIsV0FBT0kscUJBQVA7QUFDRDtBQUVEO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUFDRSxTQUFPRCxJQUFQLENBQVk7QUFBRUYsSUFBQUEsU0FBRjtBQUFhSSxJQUFBQSxNQUFiO0FBQXFCQyxJQUFBQSxZQUFyQjtBQUFtQ0osSUFBQUEsZ0JBQW5DO0FBQXFESyxJQUFBQTtBQUFyRCxHQUFaLEVBQTZFO0FBQzNFLFVBQU1DLElBQUksR0FBR1AsU0FBUyxHQUFHLFFBQUgsR0FBYyxpQkFBcEM7QUFDQSxVQUFNUSxHQUFHLEdBQUdSLFNBQVMsR0FBR0EsU0FBSCxHQUFlSSxNQUFwQztBQUNBLFVBQU1LLFNBQVMsR0FDYkosWUFBWSxJQUFJLElBQWhCLEdBQ0lLLFNBREosR0FFSUwsWUFBWSxDQUFDTSxNQUFiLEdBQXNCLENBQXRCLEdBQ0MsZUFBY04sWUFBYSxHQUQ1QixHQUVDLFNBTFAsQ0FIMkUsQ0FVM0U7O0FBQ0EsUUFBSU8sTUFBTSxHQUFJLHdDQUF1Q0wsSUFBSyxLQUFJQyxHQUFJLElBQWxFO0FBQ0FJLElBQUFBLE1BQU0sSUFBSVAsWUFBWSxHQUFJLDZCQUE0QkksU0FBVSx1QkFBMUMsR0FBbUUsRUFBekY7QUFDQUcsSUFBQUEsTUFBTSxJQUFJWCxnQkFBZ0IsR0FDckIsMkJBQTBCQSxnQkFBaUIsd0JBRHRCLEdBRXRCLEVBRko7QUFHQVcsSUFBQUEsTUFBTSxJQUFJTixRQUFRLEdBQUksSUFBR0EsUUFBUyxFQUFoQixHQUFvQixFQUF0Qzs7QUFDQU8sb0JBQU9DLElBQVAsQ0FBWUYsTUFBWjtBQUNEOztBQTdEYzs7QUFnRWpCRyxNQUFNLENBQUNDLE9BQVAsR0FBaUJyQixVQUFqQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBsb2dnZXIgZnJvbSAnLi4vbG9nZ2VyJztcbmltcG9ydCBEZXByZWNhdGlvbnMgZnJvbSAnLi9EZXByZWNhdGlvbnMnO1xuXG4vKipcbiAqIFRoZSBkZXByZWNhdG9yIGNsYXNzLlxuICovXG5jbGFzcyBEZXByZWNhdG9yIHtcbiAgLyoqXG4gICAqIFNjYW5zIHRoZSBQYXJzZSBTZXJ2ZXIgZm9yIGRlcHJlY2F0ZWQgb3B0aW9ucy5cbiAgICogVGhpcyBuZWVkcyB0byBiZSBjYWxsZWQgYmVmb3JlIHNldHRpbmcgb3B0aW9uIGRlZmF1bHRzLCBvdGhlcndpc2UgaXRcbiAgICogYmVjb21lcyBpbmRpc3Rpbmd1aXNoYWJsZSB3aGV0aGVyIGFuIG9wdGlvbiBoYXMgYmVlbiBzZXQgbWFudWFsbHkgb3JcbiAgICogYnkgZGVmYXVsdC5cbiAgICogQHBhcmFtIHthbnl9IG9wdGlvbnMgVGhlIFBhcnNlIFNlcnZlciBvcHRpb25zLlxuICAgKi9cbiAgc3RhdGljIHNjYW5QYXJzZVNlcnZlck9wdGlvbnMob3B0aW9ucykge1xuICAgIC8vIFNjYW4gZm9yIGRlcHJlY2F0aW9uc1xuICAgIGZvciAoY29uc3QgZGVwcmVjYXRpb24gb2YgRGVwcmVjYXRvci5fZ2V0RGVwcmVjYXRpb25zKCkpIHtcbiAgICAgIC8vIEdldCBkZXByZWNhdGlvbiBwcm9wZXJ0aWVzXG4gICAgICBjb25zdCBvcHRpb25LZXkgPSBkZXByZWNhdGlvbi5vcHRpb25LZXk7XG4gICAgICBjb25zdCBjaGFuZ2VOZXdEZWZhdWx0ID0gZGVwcmVjYXRpb24uY2hhbmdlTmV3RGVmYXVsdDtcblxuICAgICAgLy8gSWYgZGVmYXVsdCB3aWxsIGNoYW5nZSwgb25seSB0aHJvdyBhIHdhcm5pbmcgaWYgb3B0aW9uIGlzIG5vdCBzZXRcbiAgICAgIGlmIChjaGFuZ2VOZXdEZWZhdWx0ICE9IG51bGwgJiYgb3B0aW9uc1tvcHRpb25LZXldID09IG51bGwpIHtcbiAgICAgICAgRGVwcmVjYXRvci5fbG9nKHsgb3B0aW9uS2V5LCBjaGFuZ2VOZXdEZWZhdWx0IH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSBkZXByZWNhdGlvbiBkZWZpbml0aW9ucy5cbiAgICogQHJldHVybnMge0FycmF5PE9iamVjdD59IFRoZSBkZXByZWNhdGlvbnMuXG4gICAqL1xuICBzdGF0aWMgX2dldERlcHJlY2F0aW9ucygpIHtcbiAgICByZXR1cm4gRGVwcmVjYXRpb25zO1xuICB9XG5cbiAgLyoqXG4gICAqIExvZ3MgYSBkZXByZWNhdGlvbiB3YXJuaW5nIGZvciBhIFBhcnNlIFNlcnZlciBvcHRpb24uXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBvcHRpb25LZXkgVGhlIG9wdGlvbiBrZXkgaW5jbC4gaXRzIHBhdGgsIGUuZy4gYHNlY3VyaXR5LmVuYWJsZUNoZWNrYC5cbiAgICogQHBhcmFtIHtTdHJpbmd9IGVudktleSBUaGUgZW52aXJvbm1lbnQga2V5LCBlLmcuIGBQQVJTRV9TRVJWRVJfU0VDVVJJVFlgLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gY2hhbmdlTmV3S2V5IFNldCB0aGUgbmV3IGtleSBuYW1lIGlmIHRoZSBjdXJyZW50IGtleSB3aWxsIGJlIHJlcGxhY2VkLFxuICAgKiBvciBzZXQgdG8gYW4gZW1wdHkgc3RyaW5nIGlmIHRoZSBjdXJyZW50IGtleSB3aWxsIGJlIHJlbW92ZWQgd2l0aG91dCByZXBsYWNlbWVudC5cbiAgICogQHBhcmFtIHtTdHJpbmd9IGNoYW5nZU5ld0RlZmF1bHQgU2V0IHRoZSBuZXcgZGVmYXVsdCB2YWx1ZSBpZiB0aGUga2V5J3MgZGVmYXVsdCB2YWx1ZVxuICAgKiB3aWxsIGNoYW5nZSBpbiBhIGZ1dHVyZSB2ZXJzaW9uLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gW3NvbHV0aW9uXSBUaGUgaW5zdHJ1Y3Rpb24gdG8gcmVzb2x2ZSB0aGlzIGRlcHJlY2F0aW9uIHdhcm5pbmcuIFRoaXNcbiAgICogbWVzc2FnZSBtdXN0IG5vdCBpbmNsdWRlIHRoZSB3YXJuaW5nIHRoYXQgdGhlIHBhcmFtZXRlciBpcyBkZXByZWNhdGVkLCB0aGF0IGlzXG4gICAqIGF1dG9tYXRpY2FsbHkgYWRkZWQgdG8gdGhlIG1lc3NhZ2UuIEl0IHNob3VsZCBvbmx5IGNvbnRhaW4gdGhlIGluc3RydWN0aW9uIG9uIGhvd1xuICAgKiB0byByZXNvbHZlIHRoaXMgd2FybmluZy5cbiAgICovXG4gIHN0YXRpYyBfbG9nKHsgb3B0aW9uS2V5LCBlbnZLZXksIGNoYW5nZU5ld0tleSwgY2hhbmdlTmV3RGVmYXVsdCwgc29sdXRpb24gfSkge1xuICAgIGNvbnN0IHR5cGUgPSBvcHRpb25LZXkgPyAnb3B0aW9uJyA6ICdlbnZpcm9ubWVudCBrZXknO1xuICAgIGNvbnN0IGtleSA9IG9wdGlvbktleSA/IG9wdGlvbktleSA6IGVudktleTtcbiAgICBjb25zdCBrZXlBY3Rpb24gPVxuICAgICAgY2hhbmdlTmV3S2V5ID09IG51bGxcbiAgICAgICAgPyB1bmRlZmluZWRcbiAgICAgICAgOiBjaGFuZ2VOZXdLZXkubGVuZ3RoID4gMFxuICAgICAgICA/IGByZW5hbWVkIHRvICcke2NoYW5nZU5ld0tleX0nYFxuICAgICAgICA6IGByZW1vdmVkYDtcblxuICAgIC8vIENvbXBvc2UgbWVzc2FnZVxuICAgIGxldCBvdXRwdXQgPSBgRGVwcmVjYXRpb25XYXJuaW5nOiBUaGUgUGFyc2UgU2VydmVyICR7dHlwZX0gJyR7a2V5fScgYDtcbiAgICBvdXRwdXQgKz0gY2hhbmdlTmV3S2V5ID8gYGlzIGRlcHJlY2F0ZWQgYW5kIHdpbGwgYmUgJHtrZXlBY3Rpb259IGluIGEgZnV0dXJlIHZlcnNpb24uYCA6ICcnO1xuICAgIG91dHB1dCArPSBjaGFuZ2VOZXdEZWZhdWx0XG4gICAgICA/IGBkZWZhdWx0IHdpbGwgY2hhbmdlIHRvICcke2NoYW5nZU5ld0RlZmF1bHR9JyBpbiBhIGZ1dHVyZSB2ZXJzaW9uLmBcbiAgICAgIDogJyc7XG4gICAgb3V0cHV0ICs9IHNvbHV0aW9uID8gYCAke3NvbHV0aW9ufWAgOiAnJztcbiAgICBsb2dnZXIud2FybihvdXRwdXQpO1xuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gRGVwcmVjYXRvcjtcbiJdfQ==